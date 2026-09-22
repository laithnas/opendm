import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CSRF_COOKIE, newCsrfToken } from "@/lib/security";

// Public, unauthenticated: reports whether demo mode is enabled so the
// login screen can offer the one-click demo entry point. Also mints the
// CSRF cookie when absent (same double-submit token /api/auth/me issues for
// logged-in users) — the login page needs a valid token before it can POST
// /api/auth/magic-link, and that route requires auth:false, so it can't rely
// on /api/auth/me (which requires a session) to hand one out first.
export const GET = () => {
  const jar = cookies();
  let csrfToken = jar.get(CSRF_COOKIE)?.value ?? null;
  if (!csrfToken) {
    csrfToken = newCsrfToken();
    jar.set(CSRF_COOKIE, csrfToken, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return NextResponse.json({ demoMode: process.env.DEMO_MODE === "true", csrfToken });
};
