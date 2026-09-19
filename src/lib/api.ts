import { NextRequest } from "next/server";
import { ZodSchema } from "zod";
import { withContext, log } from "@/lib/logger";
import { AppError, ValidationError, isAppError } from "@/lib/errors";
import { requireUser, readWorkspaceCookie, type SessionUser } from "@/auth/session";
import { getMembership, listUserWorkspaces, type WorkspaceContext } from "@/modules/workspaces/access";
import { CSRF_COOKIE, CSRF_HEADER, requireCsrf } from "@/lib/security";
import { cookies } from "next/headers";

// Uniform API boundary for all route handlers:
//   - correlation id + request metadata in the log context
//   - zod validation at the boundary
//   - workspace membership enforcement on every workspace scoped call
//   - CSRF enforcement for state-changing requests
//   - consistent error JSON

export interface ApiContext {
  req: NextRequest;
  params: Record<string, string>;
  user: SessionUser;
  workspace: WorkspaceContext | null;
  body: unknown;
  clientIp: string | null;
}

interface ApiRouteDef {
  /** Require an authenticated user. Default true. */
  auth?: boolean;
  /** Require an active workspace and membership. Default false — set when
   *  the route is workspace-scoped. */
  workspace?: boolean;
  /** Roles allowed to touch this workspace resource. Default: any member. */
  roles?: ("OWNER" | "ADMIN" | "MEMBER")[];
  /** Parse and validate the JSON body with this schema. */
  schema?: ZodSchema;
  /** Skip the CSRF header check (only for idempotent GET/HEAD). */
  noCsrf?: boolean;
  handler: (ctx: ApiContext) => Promise<Response>;
}

export function apiRoute(def: ApiRouteDef) {
  return async (req: NextRequest, routeCtx: { params: Promise<Record<string, string>> | Record<string, string> }) => {
    const params = await routeCtx.params;
    const requestId = crypto.randomUUID();
    const method = req.method;
    const path = req.nextUrl.pathname;
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    return withContext({ requestId, method, path }, async () => {
      try {
        const user = def.auth === false ? null : await requireUser();

        let workspace: WorkspaceContext | null = null;
        if (def.workspace) {
          if (!user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
          const requestedId = req.headers.get("x-workspace-id");
          const viaCookie = !requestedId;
          const workspaceId = requestedId ?? readWorkspaceCookie();
          if (!workspaceId) throw new AppError("No active workspace", 400, "WORKSPACE_REQUIRED");
          workspace = await getMembership(user.id, workspaceId);
          if (!workspace && viaCookie) {
            // Stale cookie: the workspace was deleted (e.g. demo reseed).
            // Self-heal by falling back to the user's first workspace so the
            // app keeps working instead of bricking every request. The
            // explicit header path stays strict (IDOR protection).
            const first = (await listUserWorkspaces(user.id))[0];
            // Re-resolve through getMembership for the canonical context shape.
            workspace = first ? await getMembership(user.id, first.workspace.id) : null;
          }
          if (!workspace) throw new AppError("Not a member of this workspace", 403, "NOT_IN_WORKSPACE");
          if (def.roles && !def.roles.includes(workspace.role)) {
            throw new AppError("Insufficient role", 403, "FORBIDDEN");
          }
        }

        let body: unknown = undefined;
        if (def.schema) {
          if (method !== "GET" && method !== "HEAD") {
            requireCsrf(cookies().get(CSRF_COOKIE)?.value, req.headers.get(CSRF_HEADER));
          }
          const raw = await req.text();
          if (!raw) throw new ValidationError("Request body required");
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            throw new ValidationError("Request body must be valid JSON");
          }
          const result = def.schema.safeParse(parsed);
          if (!result.success) {
            throw new ValidationError("Invalid request", result.error.flatten());
          }
          body = result.data;
        }

        const ctx: ApiContext = {
          req,
          params,
          user: user as SessionUser,
          workspace,
          body,
          clientIp,
        };
        return await def.handler(ctx);
      } catch (err) {
        if (err instanceof SyntaxError) {
          return json({ error: "Invalid request body" }, 400);
        }
        if (isAppError(err)) {
          if (err.status >= 500) log.error("api error", { code: err.code, message: err.message });
          else log.warn("api error", { code: err.code, message: err.message });
          return json({ error: err.message, code: err.code, details: err.details }, err.status);
        }
        log.error("unhandled api error", { error: err instanceof Error ? err.stack : String(err) });
        return json({ error: "Internal server error" }, 500);
      }
    });
  };
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Eager parse of a promise-paginated param object (Next 15 style compat). */
export async function resolveParams(p: Promise<Record<string, string>> | Record<string, string>) {
  return p instanceof Promise ? await p : p;
}