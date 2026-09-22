import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getSessionUser, setSessionCookie, setWorkspaceCookie } from "@/auth/session";
import { ownerLogin } from "@/auth/magic-link";
import { listUserWorkspaces, createWorkspace } from "@/modules/workspaces/access";

// GET /api/auth/owner — single-user-mode auto-login. Cookies can only be
// set from a Route Handler (not a page render), so /login just redirects
// here when SINGLE_USER_MODE is on. Also guarantees a workspace exists
// (normally created via /onboarding, which this flow skips entirely).
export async function GET(req: NextRequest) {
  if (env.SINGLE_USER_MODE !== "true" || !env.SINGLE_USER_EMAIL) {
    return NextResponse.redirect(new URL("/login", env.APP_URL));
  }
  let userId = (await getSessionUser())?.id;
  if (!userId) {
    const token = await ownerLogin(env.SINGLE_USER_EMAIL, {
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    setSessionCookie(token);
    userId = (await getSessionUser())?.id;
  }
  if (userId) {
    const workspaces = await listUserWorkspaces(userId);
    const workspaceId = workspaces[0]?.workspace.id ?? (await createWorkspace(userId, { name: env.COMPANY_NAME || "Leonyx AI" })).workspaceId;
    setWorkspaceCookie(workspaceId);
  }
  return NextResponse.redirect(new URL("/app", env.APP_URL));
}
