import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import type { IngestJobData } from "@/lib/queue";
import type { $Enums } from "@prisma/client";
import { getSocialProvider } from "@/modules/providers/registry";
import { runAutomationsForEvent } from "@/modules/engine/execute";
import type { NormalizedEvent } from "@/modules/providers/types";

// Ingest processor: normalize raw provider webhooks into engine events and
// schedule executions. Fast, retry-safe, idempotent downstream.

export async function processIngestJob(job: IngestJobData): Promise<{ events: number; scheduled: number }> {
  const provider = getSocialProvider(job.provider);
  const events = provider.parseWebhook(job.payload);
  let scheduled = 0;
  let skipped = 0;

  for (const event of events) {
    const resolution = await resolveWorkspace(provider.kind, job, event);
    if (!resolution) {
      skipped++;
      log.warn("ingest: no workspace for event", {
        provider: job.provider,
        eventId: event.providerEventId,
        kind: event.kind,
      });
      continue;
    }
    const result = await runAutomationsForEvent({
      event,
      workspaceId: resolution.workspaceId,
      socialConnection: resolution.connection,
      onlyAutomationId: job.onlyAutomationId,
    });
    scheduled += result.scheduled;
  }

  log.info("ingest processed", { provider: job.provider, events: events.length, scheduled, skipped });
  return { events: events.length, scheduled };
}

interface Resolution {
  workspaceId: string;
  connection: import("@prisma/client").SocialConnection | null;
}

async function resolveWorkspace(
  provider: string,
  job: IngestJobData,
  event: NormalizedEvent,
): Promise<Resolution | null> {
  // 1) Explicit workspaceId in the payload (test/mock webhooks).
  if (job.workspaceId) {
    const ws = await prisma.workspace.findUnique({ where: { id: job.workspaceId }, select: { id: true } });
    if (ws) {
      const connection = await prisma.socialConnection.findFirst({
        where: { workspaceId: ws.id, status: "ACTIVE", provider: provider.toUpperCase() as unknown as $Enums.SocialProvider },
        orderBy: { createdAt: "asc" },
      });
      return { workspaceId: ws.id, connection };
    }
    return null;
  }

  // 2) Provider account id inside the envelope (real IG webhooks):
  //    entry[].id is the Instagram user id of the connected account.
  const raw = (job.payload ?? {}) as { entry?: { id?: string }[] };
  const accountId = raw.entry?.[0]?.id;
  if (accountId) {
    const connection = await prisma.socialConnection.findFirst({
      where: { externalAccountId: accountId, provider: provider.toUpperCase() as unknown as $Enums.SocialProvider, status: "ACTIVE" },
    });
    if (connection) {
      // Attach connection id to the event so the execution runner can pick
      // the exact connected account.
      (event.raw as Record<string, unknown>).socialConnectionId = connection.id;
      return { workspaceId: connection.workspaceId, connection };
    }
  }

  // 3) Event-level socialConnectionId (mock provider payloads).
  const eventRaw = (event.raw ?? {}) as { socialConnectionId?: string };
  if (eventRaw.socialConnectionId) {
    const connection = await prisma.socialConnection.findUnique({
      where: { id: eventRaw.socialConnectionId },
    });
    if (connection) {
      (event.raw as Record<string, unknown>).socialConnectionId = connection.id;
      return { workspaceId: connection.workspaceId, connection };
    }
  }
  return null;
}