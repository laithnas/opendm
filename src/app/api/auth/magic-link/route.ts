import { NextRequest, NextResponse } from "next/server";
import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { issueMagicLink, consumeMagicLink } from "@/auth/magic-link";
import { setSessionCookie } from "@/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { safeRedirect } from "@/lib/security";
import { env } from "@/lib/env";

// POST /api/auth/magic-link {email} → issue a login link.
export const POST = apiRoute({
  auth: false,
  schema: z.object({ email: z.string().email() }),
  handler: async (ctx) => {
    const email = (ctx.body as { email: string }).email;
    const ip = ctx.clientIp ?? "unknown";
    const rl = await rateLimit(`magic:${ip}`, 5, 60_000);
    if (!rl.allowed) throw new AppError("Too many login attempts — try again in a minute", 429, "RATE_LIMITED");

    const result = await issueMagicLink(email, ip);
    return json({
      ok: true,
      sent: result.sent,
      previewUrl: result.previewUrl ?? null,
    });
  },
});

// GET /api/auth/magic-link?token=… → consume token, set session, redirect.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const next = req.nextUrl.searchParams.get("next");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid_token", env.APP_URL));
  }
  const result = await consumeMagicLink(token, {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  if (!result) {
    return NextResponse.redirect(new URL("/login?error=invalid_token", env.APP_URL));
  }
  setSessionCookie(result.sessionToken);
  return NextResponse.redirect(new URL(safeRedirect(next, "/onboarding"), env.APP_URL));
}