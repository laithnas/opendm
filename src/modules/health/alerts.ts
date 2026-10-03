import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

// Meta error codes that mean the stored token no longer works and only a
// reconnect fixes it (190 = invalid/expired token, 102 = session expired).
const DEAD_TOKEN_CODES = new Set(["190", "102"]);

export function isDeadTokenCode(code: string | undefined | null): boolean {
  return Boolean(code && DEAD_TOKEN_CODES.has(code));
}

const pending = new Set<Promise<unknown>>();

/** Wait for any in-flight alerts (call before a short-lived script exits). */
export async function flushAlerts(): Promise<void> {
  await Promise.allSettled([...pending]);
}

/** Send a message to Laith's Telegram. Never throws. */
export function sendAlert(text: string): Promise<void> {
  const p = sendAlertNow(text);
  pending.add(p);
  void p.finally(() => pending.delete(p));
  return p;
}

async function sendAlertNow(text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    log.warn("alert not sent: Telegram not configured", { text: text.slice(0, 120) });
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    });
  } catch (err) {
    log.warn("alert send failed", { error: String(err).slice(0, 200) });
  }
}

/**
 * Record that a connection's token stopped working and alert once.
 * The status stays ACTIVE on purpose: ingest only accepts webhooks for ACTIVE
 * connections, and we want every comment and tap kept so it can be replayed
 * after the reconnect. Reconnecting clears lastError.
 */
export function flagDeadToken(connectionId: string, message: string): Promise<void> {
  const p = flagDeadTokenNow(connectionId, message);
  pending.add(p);
  void p.finally(() => pending.delete(p));
  return p;
}

async function flagDeadTokenNow(connectionId: string, message: string): Promise<void> {
  try {
    const first = await prisma.socialConnection.updateMany({
      where: { id: connectionId, lastError: null },
      data: { lastError: `TOKEN_INVALID: ${message}`.slice(0, 500), lastCheckedAt: new Date() },
    });
    if (first.count === 1) {
      const c = await prisma.socialConnection.findUnique({ where: { id: connectionId }, select: { username: true } });
      await sendAlert(
        `🚨 OpenDM: Instagram @${c?.username ?? "account"} disconnected. Automations are NOT sending.\n\n` +
          `Reason: ${message.slice(0, 200)}\n\n` +
          `Fix: reconnect at ${env.APP_URL}/app/settings, then tell Claude to run the recovery script.`,
      );
    }
  } catch (err) {
    log.warn("flagDeadToken failed", { error: String(err).slice(0, 200) });
  }
}
