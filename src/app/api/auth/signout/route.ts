import { apiRoute, json } from "@/lib/api";
import { revokeSession, clearSessionCookie } from "@/auth/session";
import { CSRF_COOKIE, CSRF_HEADER, requireCsrf } from "@/lib/security";
import { cookies } from "next/headers";

export const POST = apiRoute({
  auth: false,
  noCsrf: true, // CSRF handled explicitly (needs to work even without session)
  handler: async (ctx) => {
    if (ctx.user) {
      requireCsrf(cookies().get(CSRF_COOKIE)?.value, ctx.req.headers.get(CSRF_HEADER));
      await revokeSession();
    }
    clearSessionCookie();
    return json({ ok: true });
  },
});