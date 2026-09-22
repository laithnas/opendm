import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { randomCode } from "@/lib/ids";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { httpFetch } from "@/lib/http";

// Magic-link login.
//  - Token: 32 random bytes, single-use, hashed at rest, 15 min TTL.
//  - Delivery: Resend API when configured, otherwise logged to the server
//    console (local development). Demo mode adds a one-click demo login.

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

export async function issueMagicLink(email: string, ip?: string): Promise<{ sent: boolean; previewUrl?: string }> {
  const normalized = email.trim().toLowerCase();
  const raw = randomCode(32);
  await prisma.loginToken.create({
    data: {
      email: normalized,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
    },
  });

  const url = `${env.APP_URL}/api/auth/magic-link?token=${raw}`;
  log.info("magic link issued", { email: normalized, ip });

  if (env.RESEND_API_KEY) {
    const ok = await sendMagicLinkEmail(normalized, url);
    if (!ok) throw new AppError("Failed to send login email", 500, "EMAIL_FAILED");
    return { sent: true };
  }
  // No mail transport: surface the link in the server log for local dev.
  log.warn("RESEND_API_KEY not set — magic link is console-only", { url });
  return { sent: false, previewUrl: url };
}

export async function consumeMagicLink(
  rawToken: string,
  ctx?: { ip?: string; userAgent?: string },
): Promise<{ userId: string; sessionToken: string } | null> {
  const tokenHash = sha256(rawToken);
  const record = await prisma.loginToken.findUnique({ where: { tokenHash } });
  if (!record) return null;
  if (record.consumedAt || record.expiresAt < new Date()) return null;
  await prisma.loginToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });

  const user = await prisma.user.upsert({
    where: { email: record.email },
    update: { emailVerifiedAt: new Date() },
    create: { email: record.email, emailVerifiedAt: new Date() },
  });

  const { createSession } = await import("@/auth/session");
  const sessionToken = await createSession(user.id, ctx);
  return { userId: user.id, sessionToken };
}

/** Demo-mode one-click login: deterministic demo user. */
export async function demoLogin(ctx?: { ip?: string; userAgent?: string }): Promise<string> {
  const { createSession } = await import("@/auth/session");
  const user = await prisma.user.upsert({
    where: { email: "demo@leonyx.local" },
    update: {},
    create: { email: "demo@leonyx.local", name: "Demo User", isDemo: true, emailVerifiedAt: new Date() },
  });
  return createSession(user.id, ctx);
}

/**
 * Single-operator deployments (SINGLE_USER_MODE=true): skip the magic-link
 * screen and sign in directly as the configured owner email. Access control
 * for that setup is the ACCESS_PASSWORD gate in front of the whole app, not
 * per-user auth — this is never enabled on the public product.
 */
export async function ownerLogin(email: string, ctx?: { ip?: string; userAgent?: string }): Promise<string> {
  const { createSession } = await import("@/auth/session");
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.upsert({
    where: { email: normalized },
    update: {},
    create: { email: normalized, emailVerifiedAt: new Date() },
  });
  return createSession(user.id, ctx);
}

async function sendMagicLinkEmail(to: string, url: string): Promise<boolean> {
  try {
    const res = await httpFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to,
        subject: `Your sign-in link`,
        html: `<p>Sign in to ${env.APP_NAME} with this link (valid 15 minutes):</p><p><a href="${url}">Sign in</a></p>`,
      }),
    });
    return res.ok;
  } catch (err) {
    log.error("magic link email failed", { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}