import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import type { ActionJobData } from "@/lib/queue";
import { getSocialProvider } from "@/modules/providers/registry";
import { providerCtx, finalizeExecution, windowVerdictFor } from "@/modules/engine/execute";
import { tagContact, recordInteraction } from "@/modules/contacts/service";
import { addOutboundMessage } from "@/modules/inbox/service";
import { queues } from "@/lib/queue";
import type { ProviderKind } from "@/modules/providers/types";
import type { SnapshotPayload } from "@/modules/engine/execute";

// Action processor: performs one automation step with its provider call.
// Runs inside the worker only. Idempotent per step (completed steps never
// re-run, which also protects against BullMQ redeliveries).

export async function processActionJob(data: ActionJobData): Promise<void> {
  const step = await prisma.executionStep.findUnique({ where: { id: data.stepId } });
  if (!step || step.status === "COMPLETED" || step.status === "SKIPPED") return;

  const execution = await prisma.execution.findUnique({
    where: { id: data.executionId, workspaceId: data.workspaceId },
    include: { contact: true, automation: { select: { id: true, name: true } } },
  });
  if (!execution) throw new Error(`Execution ${data.executionId} not found`);

  const payload = (step.payload ?? {}) as SnapshotPayload;
  const connection = await prisma.socialConnection.findUnique({
    where: { id: execution.socialConnectionId ?? "" },
  });

  await prisma.executionStep.update({
    where: { id: step.id },
    data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
  });

  try {
    switch (step.actionType) {
      case "SEND_DM":
      case "SEND_LINK": {
        const contactConv = await prisma.conversation.findFirst({
          where: { contactId: execution.contactId ?? "", workspaceId: data.workspaceId },
          orderBy: { lastInboundAt: "desc" },
        });
        const verdict = windowVerdictFor(contactConv?.lastInboundAt ?? null);
        if (!verdict.allowed) {
          await markStep(step.id, "SKIPPED", { reason: verdict.reason });
          await finalizeExecution(execution.id);
          return;
        }
        if (!connection) throw new Error("no connected social account");
        const provider = getSocialProvider(connection.provider.toLowerCase());
        const result = await provider.sendDm(providerCtx(connection), {
          externalId: execution.contact?.externalId ?? "",
        }, {
          text: payload.text ?? "",
          quickReplies: payload.ctaButtons?.map((b) => ({ title: b.title, payload: b.payload ?? b.title })),
        });

        // Messages only attach to real conversations (DM/story triggers).
        // Comment triggers have no conversation row yet — the outbound DM
        // is still captured via the interaction timeline.
        if (contactConv) {
          await addOutboundMessage({
            workspaceId: data.workspaceId,
            conversationId: contactConv.id,
            contactId: execution.contactId ?? "",
            socialConnectionId: connection.id,
            provider: connection.provider.toLowerCase() as ProviderKind,
            kind: payload.ctaButtons?.length ? "QUICK_REPLIES" : payload.linkUrl ? "LINK" : "TEXT",
            content: payload.text ?? "",
            externalId: result.externalMessageId ?? null,
            status: "SENT",
          });
        }
        await recordInteraction({
          workspaceId: data.workspaceId,
          contactId: execution.contactId ?? "",
          kind: "DM_OUTBOUND",
          payload: { automationId: execution.automationId, text: payload.text },
          automationId: execution.automationId,
          executionId: execution.id,
        });
        await markStep(step.id, "COMPLETED", { sent: true, externalId: result.externalMessageId });
        break;
      }
      case "PUBLIC_REPLY": {
        if (!connection) throw new Error("no connected social account for public reply");
        const provider = getSocialProvider(connection.provider.toLowerCase());
        const result = await provider.sendPublicReply(providerCtx(connection), {
          commentId: payload.commentId ?? "",
          mediaId: payload.mediaId ?? "",
          text: payload.text ?? "",
        });
        await recordInteraction({
          workspaceId: data.workspaceId,
          contactId: execution.contactId ?? "",
          kind: "SYSTEM",
          payload: { automationId: execution.automationId, publicReply: true, externalReplyId: result.externalReplyId },
          automationId: execution.automationId,
          executionId: execution.id,
        });
        await markStep(step.id, "COMPLETED", { replied: true, externalReplyId: result.externalReplyId });
        break;
      }
      case "ADD_TAG": {
        if (!execution.contactId) throw new Error("no contact to tag");
        const tag = await tagContact(data.workspaceId, execution.contactId, payload.tag ?? "");
        await recordInteraction({
          workspaceId: data.workspaceId,
          contactId: execution.contactId,
          kind: "TAG_ADDED",
          payload: { tag: tag.name, automationId: execution.automationId },
          automationId: execution.automationId,
          executionId: execution.id,
        });
        await markStep(step.id, "COMPLETED", { tag: tag.name });
        break;
      }
      case "CALL_WEBHOOK": {
        if (!payload.url) throw new Error("webhook URL missing");
        const delivery = await prisma.webhookDelivery.create({
          data: {
            workspaceId: data.workspaceId,
            automationId: execution.automationId,
            executionId: execution.id,
            contactId: execution.contactId ?? null,
            url: payload.url,
            secretRef: payload.secretEnc ?? null,
            payload: buildWebhookPayload(execution, payload),
            status: "PENDING",
          },
        });
        await queues.webhooks.add(
          "deliver",
          { workspaceId: data.workspaceId, deliveryId: delivery.id },
          { attempts: 5, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 500, removeOnFail: 500 },
        );
        await markStep(step.id, "COMPLETED", { deliveryId: delivery.id });
        break;
      }
      case "DELAY": {
        // The job itself was scheduled with the delay; nothing to do.
        await markStep(step.id, "COMPLETED", { waitedMs: payload.ms ?? 0 });
        break;
      }
      default:
        throw new Error(`unsupported action type ${step.actionType}`);
    }

    await finalizeExecution(execution.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.executionStep.update({
      where: { id: step.id },
      data: { status: "FAILED", error: message.slice(0, 2000), completedAt: new Date() },
    });
    await finalizeExecution(execution.id);
    log.warn("action step failed", { stepId: step.id, executionId: execution.id, actionType: step.actionType, error: message });
    throw err; // let BullMQ retry
  }
}

async function markStep(stepId: string, status: "COMPLETED" | "SKIPPED", result: Record<string, unknown>) {
  await prisma.executionStep.update({
    where: { id: stepId },
    data: { status, result: result as object, completedAt: new Date() },
  });
  log.info("action step finished", { stepId, status });
}

function buildWebhookPayload(
  execution: { id: string; automationId: string; triggerType: string; triggerPayload: unknown; contactId: string | null },
  payload: SnapshotPayload,
): object {
  const event = (execution.triggerPayload ?? {}) as {
    text?: string;
    kind?: string;
    contact?: { externalId?: string; username?: string };
  };
  const structured = {
    event: "leonyx.execution.completed",
    executionId: execution.id,
    automationId: execution.automationId,
    triggerType: execution.triggerType,
    triggerText: event.text ?? null,
    contactId: execution.contactId,
    contactUsername: event.contact?.username ?? null,
    sentAt: new Date().toISOString(),
  };

  if (payload.payloadTemplate) {
    // Template mode: render {{username}} etc into the body; structured
    // fields are packed into the context in case templates reference them.
    const { renderTemplate } = require("@/modules/engine/render") as typeof import("@/modules/engine/render");
    const text = renderTemplate(payload.payloadTemplate, {
      username: event.contact?.username ?? null,
      comment: event.text ?? null,
    });
    return { ...structured, body: text };
  }
  return structured;
}