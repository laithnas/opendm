import { Queue, QueueEvents, type QueueOptions } from "bullmq";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";

// Queue topology:
//   ingest            — social provider webhook events (fast path from HTTP)
//   automation-execute — one job per (automation, event) pipeline run
//   actions           — individual automation actions (DM, reply, link, webhook)
//   webhook-deliver   — outbound webhook deliveries with retry/backoff
//
// Rule: webhook handlers only push to `ingest` and return. Everything
// retryable lives in a queue so the Next.js server can die without losing
// work, and the standalone worker owns processing.

export const QUEUE_NAMES = {
  ingest: "ingest",
  execute: "automation-execute",
  actions: "actions",
  webhooks: "webhook-deliver",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

interface RateLimitedQueueOptions extends QueueOptions {
  limiter: { max: number; duration: number; groupKey: string };
}

const actionsOptions: RateLimitedQueueOptions = {
  connection: redis,
  prefix: env.QUEUE_PREFIX,
  // Per-account rate limit: max jobs per window per socialConnectionId.
  limiter: {
    max: env.RATE_LIMIT_MAX,
    duration: env.RATE_LIMIT_WINDOW_MS,
    groupKey: "scopeId",
  },
};

const webhooksOptions: RateLimitedQueueOptions = {
  connection: redis,
  prefix: env.QUEUE_PREFIX,
  limiter: { max: 20, duration: 1000, groupKey: "global" },
};

export const queues = {
  ingest: new Queue(QUEUE_NAMES.ingest, { connection: redis, prefix: env.QUEUE_PREFIX }),
  execute: new Queue(QUEUE_NAMES.execute, { connection: redis, prefix: env.QUEUE_PREFIX }),
  actions: new Queue(QUEUE_NAMES.actions, actionsOptions),
  webhooks: new Queue(QUEUE_NAMES.webhooks, webhooksOptions),
} as const;

export const queueEvents = {
  ingest: new QueueEvents(QUEUE_NAMES.ingest, { connection: redis, prefix: env.QUEUE_PREFIX }),
  execute: new QueueEvents(QUEUE_NAMES.execute, { connection: redis, prefix: env.QUEUE_PREFIX }),
  actions: new QueueEvents(QUEUE_NAMES.actions, { connection: redis, prefix: env.QUEUE_PREFIX }),
  webhooks: new QueueEvents(QUEUE_NAMES.webhooks, { connection: redis, prefix: env.QUEUE_PREFIX }),
} as const;

export interface IngestJobData {
  provider: string;
  workspaceId?: string; // resolved at processing time when absent
  /** When set, only this automation runs for the event (simulate mode). */
  onlyAutomationId?: string;
  /** Raw provider webhook envelope. */
  payload: unknown;
  receivedAt: string;
}

export interface ExecuteJobData {
  workspaceId: string;
  automationId: string;
  event: {
    provider: string;
    kind: "COMMENT" | "DM" | "STORY_REPLY";
    providerEventId: string;
    contact: {
      externalId: string;
      username?: string;
      name?: string;
    };
    postRef?: string | null;
    text: string;
    mediaId?: string | null;
    commentId?: string | null;
    conversationExternalId?: string | null;
    occurredAt: string;
    raw: unknown;
  };
}

export interface ActionJobData {
  workspaceId: string;
  executionId: string;
  stepId: string;
  actionId: string;
  scopeId: string; // socialConnectionId — drives per-account rate limiting
}

export interface WebhookDeliveryJobData {
  workspaceId: string;
  deliveryId: string;
}

export async function closeQueues(): Promise<void> {
  await Promise.all(
    Object.values(queues).map((q) => q.close().catch(() => undefined)),
  );
  await Promise.all(
    Object.values(queueEvents).map((q) => q.close().catch(() => undefined)),
  );
}