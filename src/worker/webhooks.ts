import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import type { WebhookDeliveryJobData } from "@/lib/queue";
import { decryptSecret } from "@/lib/crypto";
import { hmacSha256 } from "@/lib/security";
import { httpFetch } from "@/lib/http";
import { queues } from "@/lib/queue";

// Outbound webhook delivery: HMAC-SHA256 signed POSTs with retries and a
// persisted delivery record. Never logs the URL body or the secret.

const MAX_ATTEMPTS = 5;

export async function processWebhookDelivery(data: WebhookDeliveryJobData): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: data.deliveryId, workspaceId: data.workspaceId },
  });
  if (!delivery || delivery.status === "DELIVERED") return;

  const attempts = delivery.attempts + 1;
  const body = JSON.stringify(delivery.payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Leonyx-Event": "execution.completed",
    "X-Leonyx-Idempotency-Key": delivery.id,
  };
  if (delivery.secretRef) {
    try {
      const secret = decryptSecret(delivery.secretRef);
      headers["X-Leonyx-Signature"] = `sha256=${hmacSha256(secret, body)}`;
    } catch {
      log.error("webhook secret decrypt failed", { deliveryId: delivery.id });
    }
  }

  try {
    const res = await httpFetch(delivery.url, { method: "POST", headers, body }, { timeoutMs: 10_000 });
    if (res.status >= 200 && res.status < 300) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "DELIVERED",
          attempts,
          responseStatus: res.status,
          responseBody: res.body.slice(0, 2000),
          lastError: null,
          nextAttemptAt: null,
        },
      });
      log.info("webhook delivered", { deliveryId: delivery.id, status: res.status });
      return;
    }
    throw new Error(`HTTP ${res.status}: ${res.body.slice(0, 500)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFinal = attempts >= MAX_ATTEMPTS;
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: isFinal ? "FAILED" : "PENDING",
        attempts,
        lastError: message.slice(0, 2000),
        nextAttemptAt: isFinal ? null : new Date(Date.now() + backoffMs(attempts)),
      },
    });
    log.warn("webhook delivery failed", { deliveryId: delivery.id, attempts, error: message });
    if (!isFinal) {
      await queues.webhooks.add(
        "deliver",
        { workspaceId: data.workspaceId, deliveryId: delivery.id },
        { attempts: MAX_ATTEMPTS - attempts + 1, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 500, removeOnFail: 500 },
      );
    }
    throw err;
  }
}

function backoffMs(attempt: number): number {
  return Math.min(60_000, 5000 * 2 ** (attempt - 1));
}

export { env };