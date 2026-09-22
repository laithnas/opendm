import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { log } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { queues, type ExecuteJobData } from "@/lib/queue";
import type { Automation, AutomationAction, AutomationCondition, SocialConnection, Contact, Prisma, $Enums } from "@prisma/client";
import type { NormalizedEvent, ProviderCtx, ProviderKind } from "@/modules/providers/types";
import { getSocialProvider } from "@/modules/providers/registry";
import { evaluateConditions } from "@/modules/engine/conditions";
import { renderTemplate, type RenderContext } from "@/modules/engine/render";
import { upsertContact, recordInteraction, getContact } from "@/modules/contacts/service";
import { upsertConversation, addInboundMessage, messagingWindowVerdict, type WindowVerdict } from "@/modules/inbox/service";
import { resolveTrackedLink, linkUrl, validateDestination } from "@/modules/links/service";
import { MESSAGING_WINDOW_HOURS } from "@/config";

// Automation execution engine.
//
// Flow: webhook → ingest job → this module finds matching automations and
// creates observable Executions (idempotent per provider event) → action
// jobs execute steps in the worker → per-step status + retries recorded.
//
// Nothing here sends messages directly; sending happens in the worker via
// the action processors (src/worker/actions.ts).

export type EngineEvent = NormalizedEvent;

function providerEnum(kind: string): $Enums.SocialProvider {
  return kind.toUpperCase() as unknown as $Enums.SocialProvider;
}

export type AutomationWithGraph = Automation & {
  conditions: AutomationCondition[];
  actions: AutomationAction[];
};

export interface AutomatchInput {
  workspaceId: string;
  event: EngineEvent;
  socialConnection?: SocialConnection | null;
  contact?: Contact | null;
  /** Restrict matching to one automation (simulate mode). */
  onlyAutomationId?: string;
}

// ─── Match + schedule ─────────────────────────────────────────────────────

/**
 * Find ACTIVE automations of the event's trigger type and enqueue an
 * execution for each. Idempotent: the composite providerEventId makes a
 * redelivered webhook a no-op.
 */
export async function runAutomationsForEvent(input: AutomatchInput): Promise<{ scheduled: number; skippedDup: number }> {
  const automations = await prisma.automation.findMany({
    where: {
      workspaceId: input.workspaceId,
      status: "ACTIVE",
      triggerType: input.event.kind,
      archivedAt: null,
      ...(input.onlyAutomationId ? { id: input.onlyAutomationId } : {}),
    },
    include: { conditions: true, actions: { orderBy: { order: "asc" } } },
  });

  let scheduled = 0;
  let skippedDup = 0;
  for (const automation of automations) {
    const idempotencyKey = `${input.event.providerEventId}:${automation.id}`;
    const existing = await prisma.execution.findUnique({
      where: { provider_providerEventId: { provider: providerEnum(input.event.provider), providerEventId: idempotencyKey } },
    });
    if (existing) {
      skippedDup++;
      continue;
    }
    await queueExecution({
      workspaceId: input.workspaceId,
      automation,
      event: input.event,
      socialConnection: input.socialConnection ?? null,
      contact: input.contact ?? null,
      idempotencyKey,
    });
    scheduled++;
  }
  return { scheduled, skippedDup };
}

interface QueueExecutionInput {
  workspaceId: string;
  automation: AutomationWithGraph;
  event: EngineEvent;
  socialConnection: SocialConnection | null;
  contact: Contact | null;
  idempotencyKey: string;
}

async function queueExecution(input: QueueExecutionInput): Promise<void> {
  // Ensure contact exists first so the execution can point at it.
  let contact = input.contact;
  if (!contact) {
    contact = await upsertContact({
      workspaceId: input.workspaceId,
      provider: input.event.provider,
      externalId: input.event.contact.externalId,
      username: input.event.contact.username,
      name: input.event.contact.name,
      source: input.event.kind === "COMMENT" ? "COMMENT" : "DM",
    });
  }

  await queues.execute.add(
    "run",
    {
      workspaceId: input.workspaceId,
      automationId: input.automation.id,
      event: {
        provider: input.event.provider,
        kind: input.event.kind,
        providerEventId: input.event.providerEventId,
        contact: {
          externalId: input.event.contact.externalId,
          username: input.event.contact.username,
          name: input.event.contact.name,
        },
        postRef: input.event.mediaId ?? null,
        text: input.event.text,
        mediaId: input.event.mediaId ?? null,
        commentId: input.event.commentId ?? null,
        conversationExternalId: input.event.conversationExternalId ?? null,
        occurredAt: input.event.occurredAt,
        raw: input.event.raw,
      },
    } satisfies ExecuteJobData,
    {
      jobId: `exec:${input.idempotencyKey}`,
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 60 * 60 * 24 * 30 },
      removeOnFail: { age: 60 * 60 * 24 * 30 },
    },
  );
}

// ─── Execution runner (worker: automation-execute queue) ──────────────────

async function recordEventInteraction(input: {
  workspaceId: string;
  contactId: string;
  kind: "COMMENT" | "DM" | "STORY_REPLY";
  payload?: Record<string, unknown>;
  automationId?: string | null;
  executionId?: string | null;
}) {
  const kindMap: Record<string, "COMMENT" | "DM_INBOUND" | "STORY_REPLY"> = {
    COMMENT: "COMMENT",
    DM: "DM_INBOUND",
    STORY_REPLY: "STORY_REPLY",
  };
  return recordInteraction({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    kind: kindMap[input.kind] ?? "COMMENT",
    payload: input.payload,
    automationId: input.automationId,
    executionId: input.executionId,
  });
}

/**
 * Build + run a single automation for one event. Called by the worker's
 * execute processor. Creates the Execution row here (so SKIPPED outcomes are
 * observable) and enqueues action jobs for the enabled actions.
 */
export async function createAndRunExecution(data: ExecuteJobData): Promise<void> {
  const automation = await prisma.automation.findFirst({
    where: { id: data.automationId, workspaceId: data.workspaceId, archivedAt: null },
    include: { conditions: true, actions: { orderBy: { order: "asc" } } },
  });
  if (!automation) throw new AppError("Automation not found", 404, "NOT_FOUND");

  const event: EngineEvent = data.event as EngineEvent;
  const idempotencyKey = `${data.event.providerEventId}:${automation.id}`;
  const existingExec = await prisma.execution.findUnique({
    where: { provider_providerEventId: { provider: providerEnum(data.event.provider), providerEventId: idempotencyKey } },
  });
  if (existingExec) return; // already handled (dupe delivery / retry)

  let connection: SocialConnection | null = null;
  const raw = (data.event.raw ?? {}) as { socialConnectionId?: string };
  if (raw.socialConnectionId) {
    connection = await prisma.socialConnection.findFirst({
      where: { id: raw.socialConnectionId, workspaceId: data.workspaceId },
    });
  }
  if (!connection) {
    connection = await prisma.socialConnection.findFirst({
      where: { workspaceId: data.workspaceId, status: "ACTIVE", provider: "INSTAGRAM" },
      orderBy: { createdAt: "asc" },
    });
  }

  const contact = await getContact(data.workspaceId, data.event.provider, data.event.contact.externalId);
  if (!contact) throw new AppError("Contact missing for execution", 500, "CONTACT_MISSING");

  // Conditions: any failure → observable SKIPPED execution (never re-runs
  // thanks to the idempotency key above).
  const triggerConfig = (automation.triggerConfig ?? {}) as Record<string, unknown>;
  const verdict = evaluateConditions(
    { conditions: automation.conditions, triggerConfig },
    { event, isFollower: contact.isFollower },
  );

  const execution = await prisma.execution.create({
    data: {
      workspaceId: data.workspaceId,
      automationId: automation.id,
      contactId: contact.id,
      socialConnectionId: connection?.id ?? null,
      provider: providerEnum(data.event.provider),
      providerEventId: idempotencyKey,
      triggerType: data.event.kind,
      triggerPayload: data.event as unknown as Prisma.InputJsonValue,
      status: verdict.pass ? "RUNNING" : "SKIPPED",
      startedAt: verdict.pass ? new Date() : null,
      completedAt: verdict.pass ? null : new Date(),
      error: verdict.pass ? null : (verdict.reason ?? "conditions not met"),
    },
  });

  // Record the trigger interaction + conversation state for the CRM/inbox.
  await recordEventInteraction({
    workspaceId: data.workspaceId,
    contactId: contact.id,
    kind: data.event.kind,
    payload: { text: data.event.text, matchedKeyword: verdict.keyword },
    automationId: automation.id,
    executionId: execution.id,
  });
  if (data.event.kind !== "COMMENT" && connection) {
    const conversation = await upsertConversation({
      workspaceId: data.workspaceId,
      socialConnectionId: connection.id,
      contactId: contact.id,
      provider: data.event.provider as ProviderKind,
      externalId: data.event.conversationExternalId ?? `dm:${contact.externalId}`,
      type: data.event.kind === "STORY_REPLY" ? "STORY_REPLY" : "DM",
      inboundAt: new Date(data.event.occurredAt),
    });
    await addInboundMessage({
      workspaceId: data.workspaceId,
      conversationId: conversation.id,
      contactId: contact.id,
      socialConnectionId: connection.id,
      provider: data.event.provider as ProviderKind,
      content: data.event.text,
      externalId: data.event.providerEventId,
      occurredAt: new Date(data.event.occurredAt),
    });
  }

  if (!verdict.pass) return;

  // Snapshot steps so later UI shows what the automation intended even if
  // the config changes mid-flight.
  const ctx: ExecutionContext = {
    executionId: execution.id,
    workspaceId: data.workspaceId,
    automation,
    event,
    socialConnection: connection,
    contact,
    matchedKeyword: verdict.keyword ?? null,
  };

  const renderCtx = await renderContextFor(ctx);
  const enabled = automation.actions.filter((a) => a.enabled);
  let order = 0;
  for (const action of enabled) {
    const snapshot = await snapshotActionPayload(action, ctx, renderCtx, connection);
    if (snapshot.error) {
      await prisma.executionStep.create({
        data: {
          executionId: execution.id,
          actionId: action.id,
          actionType: action.kind,
          label: actionLabel(action),
          order,
          status: "FAILED",
          error: snapshot.error,
          attempts: 1,
          completedAt: new Date(),
        },
      });
      order++;
      continue;
    }
    const step = await prisma.executionStep.create({
      data: {
        executionId: execution.id,
        actionId: action.id,
        actionType: action.kind,
        label: actionLabel(action),
        order,
        status: "PENDING",
        payload: snapshot as object,
        delayMs: action.delayMs,
      },
    });
    await queues.actions.add(
      "run",
      {
        workspaceId: data.workspaceId,
        executionId: execution.id,
        stepId: step.id,
        actionId: action.id,
        scopeId: connection?.id ?? "none",
      },
      {
        delay: action.delayMs,
        attempts: 3,
        backoff: { type: "exponential", delay: 4000 },
        removeOnComplete: { age: 60 * 60 * 24 * 30 },
        removeOnFail: { age: 60 * 60 * 24 * 30 },
      },
    );
    order++;
  }

  // No actions at all → complete immediately.
  if (enabled.length === 0) {
    await finalizeExecution(execution.id);
  }
}

// ─── Action snapshot ──────────────────────────────────────────────────────

export interface ExecutionContext {
  executionId: string;
  workspaceId: string;
  automation: AutomationWithGraph;
  event: EngineEvent;
  socialConnection: SocialConnection | null;
  contact: Contact;
  matchedKeyword: string | null;
}

async function renderContextFor(ctx: ExecutionContext): Promise<RenderContext> {
  const ws = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { name: true } });
  return {
    username: ctx.event.contact.username ?? ctx.contact.username,
    name: ctx.event.contact.name ?? ctx.contact.name,
    comment: ctx.event.text,
    keyword: ctx.matchedKeyword,
    link: null,
    workspace: ws?.name ?? null,
  };
}

export interface SnapshotPayload {
  text?: string;
  ctaButtons?: { title: string; payload?: string }[];
  linkSlug?: string;
  linkUrl?: string;
  tag?: string;
  url?: string;
  secretEnc?: string;
  payloadTemplate?: string;
  mediaId?: string;
  commentId?: string;
  ms?: number;
  error?: string;
}

async function snapshotActionPayload(
  action: AutomationAction,
  ctx: ExecutionContext,
  renderCtx: RenderContext,
  connection: SocialConnection | null,
): Promise<SnapshotPayload> {
  const cfg = (action.config ?? {}) as Record<string, unknown>;
  const base: RenderContext = { ...renderCtx };

  switch (action.kind) {
    case "SEND_DM":
    case "SEND_LINK": {
      const messageTemplate = String(cfg.text ?? (action.kind === "SEND_LINK" ? "Here you go: {{link}}" : ""));
      let link: string | null = null;
      let linkSlug: string | null = null;
      if (action.kind === "SEND_LINK" || cfg.linkSlug) {
        const slug = String(cfg.linkSlug ?? "");
        const destination = String(cfg.linkDestination ?? "");
        if (destination) {
          const created = await resolveTrackedLink(ctx.workspaceId, `auto-${Date.now().toString(36)}`, {
            name: String(cfg.linkName ?? "Automation link"),
            destination: validateDestination(destination),
          });
          linkSlug = created.slug;
          link = linkUrl(created.slug);
        } else if (slug) {
          const existing = await prisma.trackedLink.findUnique({ where: { slug } });
          if (!existing || existing.workspaceId !== ctx.workspaceId) {
            return { error: `tracked link "${slug}" not found in this workspace` };
          }
          linkSlug = existing.slug;
          link = linkUrl(existing.slug);
        } else if (action.kind === "SEND_LINK") {
          return { error: "SEND_LINK requires a tracked link or destination URL" };
        }
      }
      const text = renderTemplate(messageTemplate, { ...base, link }).slice(0, 1000);
      if (text.trim() === "") return { error: "message template renders empty" };

      const ctaButtons = Array.isArray(cfg.ctaButtons)
        ? (cfg.ctaButtons as { title?: string; payload?: string }[])
            .filter((b) => b.title?.trim())
            .slice(0, 3)
            .map((b) => ({ title: b.title!.trim().slice(0, 36), payload: b.payload ?? b.title!.trim() }))
        : [];

      return { text, ctaButtons, linkSlug: linkSlug ?? undefined, linkUrl: link ?? undefined };
    }
    case "PUBLIC_REPLY": {
      if (!connection) return { error: "no connected social account for public reply" };
      const text = renderTemplate(String(cfg.text ?? ""), base).slice(0, 1000);
      if (!text.trim()) return { error: "reply template is empty" };
      if (!ctx.event.commentId) return { error: "event has no comment id to reply to" };
      return { text, mediaId: ctx.event.mediaId ?? undefined, commentId: ctx.event.commentId ?? undefined };
    }
    case "ADD_TAG": {
      const tag = String(cfg.tag ?? "").trim();
      if (!tag) return { error: "tag name is empty" };
      return { tag };
    }
    case "CALL_WEBHOOK": {
      const url = String(cfg.url ?? "").trim();
      if (!url) return { error: "webhook URL is empty" };
      validateDestination(url); // SSRF/scheme rules
      const secret = String(cfg.secret ?? "").trim();
      return {
        url,
        secretEnc: secret ? encryptSecret(secret) : undefined,
        payloadTemplate: typeof cfg.payloadTemplate === "string" ? cfg.payloadTemplate : undefined,
      };
    }
    case "DELAY": {
      const ms = Math.max(0, Number(cfg.ms ?? cfg.delayMs ?? 0));
      return { ms };
    }
    default:
      return { error: `unsupported action kind ${action.kind}` };
  }
}

function actionLabel(action: AutomationAction): string {
  const labels: Record<string, string> = {
    SEND_DM: "Send DM",
    SEND_LINK: "Send tracked link",
    PUBLIC_REPLY: "Public comment reply",
    ADD_TAG: "Tag contact",
    CALL_WEBHOOK: "Call webhook",
    DELAY: "Wait",
  };
  return labels[action.kind] ?? action.kind;
}

// ─── Status resolution ────────────────────────────────────────────────────

export async function finalizeExecution(executionId: string): Promise<void> {
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: { steps: true },
  });
  if (!execution) return;
  const steps = execution.steps;
  if (steps.some((s) => s.status === "PENDING" || s.status === "RUNNING")) return; // still active

  let status: string;
  const failed = steps.some((s) => s.status === "FAILED");
  const completed = steps.some((s) => s.status === "COMPLETED");
  if (failed && completed) status = "PARTIALLY_COMPLETED";
  else if (failed) status = "FAILED";
  else if (completed) status = "COMPLETED";
  else status = "SKIPPED";

  await prisma.execution.update({
    where: { id: executionId },
    data: { status: status as never, completedAt: new Date(), error: failed ? "one or more actions failed" : null },
  });
  log.info("execution finalized", { executionId, status });
}

/** Window verdict used by the action worker. */
export function windowVerdictFor(lastInboundAt: Date | null | undefined): WindowVerdict {
  return messagingWindowVerdict(lastInboundAt);
}

/** Decrypt a connection's token for provider calls (never leaves the worker). */
export function connectionToken(connection: SocialConnection): string {
  return decryptSecret(connection.accessTokenEnc);
}

export function providerCtx(connection: SocialConnection): ProviderCtx {
  return {
    connection,
    accessToken: connectionToken(connection),
    apiVersion: env.META_GRAPH_VERSION,
  };
}