import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { createHmac, timingSafeEqual } from "node:crypto";

// Security helpers shared by API and webhook surfaces.

const CSRF_COOKIE = "csrf";
const CSRF_HEADER = "x-csrf-token";

// ── CSRF ─────────────────────────────────────────────────────────────────
// Strategy: a per-session random token is stored in an httpOnly cookie and
// must be echoed in the x-csrf-token header for every state-changing
// request. SameSite=Lax already blocks cross-site POSTs; the header check
// protects cookie-authenticated GET-triggered mutations.

export function newCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function csrfCookieValue(): string {
  return newCsrfToken();
}

export function verifyCsrf(cookieValue: string | undefined, headerValue: string | null): boolean {
  if (!cookieValue || !headerValue) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(headerValue);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function requireCsrf(cookieValue: string | undefined, headerValue: string | null): void {
  if (!verifyCsrf(cookieValue, headerValue)) {
    throw new AppError("Invalid CSRF token", 403, "CSRF_FAILED");
  }
}

export { CSRF_COOKIE, CSRF_HEADER };

// ── Safe redirects ────────────────────────────────────────────────────────

/** Only allow same-origin (or explicitly allowed) redirect targets. */
export function safeRedirect(target: string | null | undefined, fallback: string): string {
  if (!target) return fallback;
  try {
    const url = new URL(target, env.APP_URL);
    if (url.origin === new URL(env.APP_URL).origin) return url.pathname + url.search;
  } catch {
    // fall through
  }
  return fallback;
}

// ── HMAC signing (outbound webhook deliveries) ────────────────────────────

export function hmacSha256(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyHmac(secret: string, body: string, signature: string): boolean {
  const expected = hmacSha256(secret, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── Meta webhook signature (X-Hub-Signature-256) ──────────────────────────

export function verifyHubSignature(appSecret: string, rawBody: string, header: string | null): boolean {
  if (!header) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}