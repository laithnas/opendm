import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getSessionUser, setSessionCookie } from "@/auth/session";
import { ownerLogin } from "@/auth/magic-link";

// GET /api/auth/owner — single-user-mode auto-login. Cookies can only be
// set from a Route Handler (not a page render), so /login just redirects
// here when SINGLE_USER_MODE is on.
export async function GET(req: NextRequest) {
  if (env.SINGLE_USER_MODE !== "true" || !env.SINGLE_USER_EMAIL) {
    return NextResponse.redirect(new URL("/login", env.APP_URL));
  }
  const existing = await getSessionUser();
  if (!existing) {
    const token = await ownerLogin(env.SINGLE_USER_EMAIL, {
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    setSessionCookie(token);
  }
  return NextResponse.redirect(new URL("/app", env.APP_URL));
}
