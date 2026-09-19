import { apiRoute, json } from "@/lib/api";
import { CSRF_COOKIE } from "@/lib/security";
import { listUserWorkspaces } from "@/modules/workspaces/access";
import { cookies } from "next/headers";
import { readWorkspaceCookie, setWorkspaceCookie } from "@/auth/session";

// Current user + workspace list, used to bootstrap the app shell. Also sets
// the CSRF cookie when absent (first-loads from email links).

export const GET = apiRoute({
  handler: async (ctx) => {
    const csrf = cookies().get(CSRF_COOKIE);
    let csrfToken: string | null = csrf?.value ?? null;
    if (!csrf) {
      const { newCsrfToken, csrfCookieValue } = await import("@/lib/security");
      csrfToken = newCsrfToken();
      cookies().set(CSRF_COOKIE, csrfToken, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
    const workspaces = await listUserWorkspaces(ctx.user.id);
    const activeWorkspaceId = ctx.workspace?.id ?? readWorkspaceCookie() ?? workspaces[0]?.workspace.id ?? null;
    if (activeWorkspaceId) setWorkspaceCookie(activeWorkspaceId);

    return json({
      user: { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name, isDemo: ctx.user.isDemo },
      workspaces: workspaces.map((m) => ({ ...m.workspace, role: m.role })),
      activeWorkspaceId,
      csrfToken,
      demoMode: process.env.DEMO_MODE === "true",
    });
  },
});