import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { randomCode } from "@/lib/ids";
import { getProviderForConnection } from "@/modules/providers/registry";
import { providerCtx, windowVerdictFor } from "@/modules/engine/execute";
import { upsertConversation, addInboundMessage, addOutboundMessage } from "@/modules/inbox/service";
import { recordInteraction } from "@/modules/contacts/service";
import type { NormalizedEvent, ProviderKind } from "@/modules/providers/types";
import type { SocialConnection } from "@prisma/client";

// "Want the resource? [Yes! Send It] → Follow me, tap below [I Followed] →
// here's the link". By default each tap alone advances the sequence. With
// verifyFollow on, the "I Followed" tap is checked against Instagram's User
// Profile API (is_user_follow_business), which answers for anyone who has
// messaged the account — tapping the stage-0 button counts.
//
// Three stages, tracked as FollowGateRun.step:
//   0 = prompt sent, waiting for the "yes" tap
//   1 = gate sent, waiting for the "I followed" tap
//   2 = completed (final message sent)

const GATE_PAYLOAD_PREFIX = "fg:";
const DEFAULT_NOT_FOLLOWING_TEXT = "Hmm, I can't see your follow yet 👀\n\nFollow me, then tap below and I'll send it straight over.";

function newToken(): string {
  return `${GATE_PAYLOAD_PREFIX}${randomCode(20)}`;
}

export function isGateButtonPayload(payload: string | null | undefined): boolean {
  return Boolean(payload && payload.startsWith(GATE_PAYLOAD_PREFIX));
}

/** Called from the FOLLOW_GATE action: creates the run and sends the opening prompt. */
export async function startFollowGate(input: {
  workspaceId: string;
  actionId: string;
  executionId: string;
  contactId: string;
  connection: SocialConnection;
  promptText: string;
  promptButtonLabel: string;
  /** Comment id to use for a private reply when this is the first DM to this contact. */
  privateReplyCommentId?: string;
}): Promise<{ externalMessageId?: string }> {
  const token = newToken();
  const provider = getProviderForConnection(input.connection);
  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: input.contactId } });

  const result = await provider.sendDm(
    providerCtx(input.connection),
    { externalId: contact.externalId, commentId: input.privateReplyCommentId },
    { text: input.promptText, buttons: [{ title: input.promptButtonLabel, payload: token }] },
  );

  await prisma.followGateRun.create({
    data: {
      workspaceId: input.workspaceId,
      actionId: input.actionId,
      contactId: input.contactId,
      socialConnectionId: input.connection.id,
      pendingButtonPayload: token,
      step: 0,
    },
  });

  await recordInteraction({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    kind: "DM_OUTBOUND",
    payload: { text: input.promptText, followGate: "prompt" },
    executionId: input.executionId,
  });

  return { externalMessageId: result.externalMessageId };
}

/**
 * Called from ingest when an incoming DM's button payload matches an open
 * FollowGateRun: advances to the next stage, no verification performed.
 */
export async function advanceFollowGate(event: NormalizedEvent, connection: SocialConnection): Promise<boolean> {
  if (!isGateButtonPayload(event.buttonPayload)) return false;

  const run = await prisma.followGateRun.findUnique({
    where: { pendingButtonPayload: event.buttonPayload! },
    include: { action: true, contact: true },
  });
  if (!run || run.workspaceId !== connection.workspaceId || run.step >= 2) {
    // Unknown, already-completed, or cross-workspace token — nothing to do.
    return true;
  }

  // Record the tap itself as a normal inbound DM so the inbox/window state
  // stays consistent — this bypasses the generic automation-match path,
  // which is the only other place this normally happens.
  const conversation = await upsertConversation({
    workspaceId: run.workspaceId,
    socialConnectionId: connection.id,
    contactId: run.contactId,
    provider: "instagram",
    externalId: event.conversationExternalId ?? `dm:${run.contact.externalId}`,
    type: "DM",
    inboundAt: new Date(event.occurredAt),
  });
  await addInboundMessage({
    workspaceId: run.workspaceId,
    conversationId: conversation.id,
    contactId: run.contactId,
    socialConnectionId: connection.id,
    provider: "instagram",
    content: event.text || "(tapped a button)",
    externalId: event.providerEventId,
    occurredAt: new Date(event.occurredAt),
  });

  const verdict = windowVerdictFor(conversation.lastInboundAt);
  if (!verdict.allowed) {
    log.warn("follow gate tap outside messaging window", { runId: run.id, reason: verdict.reason });
    return true;
  }

  const cfg = run.action.config as {
    gateText?: string;
    gateButtonLabel?: string;
    finalText?: string;
    verifyFollow?: boolean;
    notFollowingText?: string;
  };
  const provider = getProviderForConnection(connection);

  if (run.step === 0) {
    // Stage 0 → 1: send the follow-me gate with a fresh token.
    const gateText = String(cfg.gateText ?? "").slice(0, 1000);
    if (!gateText.trim()) {
      log.error("follow gate has no gateText configured", { runId: run.id, actionId: run.actionId });
      return true;
    }
    const token = newToken();
    const result = await provider.sendDm(
      providerCtx(connection),
      { externalId: run.contact.externalId },
      { text: gateText, buttons: [{ title: String(cfg.gateButtonLabel ?? "I Followed").slice(0, 20), payload: token }] },
    );
    await addOutboundMessage({
      workspaceId: run.workspaceId,
      conversationId: conversation.id,
      contactId: run.contactId,
      socialConnectionId: connection.id,
      provider: "instagram" as ProviderKind,
      kind: "TEXT",
      content: gateText,
      externalId: result.externalMessageId ?? null,
      status: "SENT",
    });
    await prisma.followGateRun.update({ where: { id: run.id }, data: { step: 1, pendingButtonPayload: token } });
    await recordInteraction({ workspaceId: run.workspaceId, contactId: run.contactId, kind: "DM_OUTBOUND", payload: { text: gateText, followGate: "gate" } });
    log.info("follow gate advanced to stage 1", { runId: run.id });
    return true;
  }

  // Stage 1 → 2. With verifyFollow on, ask Instagram whether they follow;
  // anyone not confirmed (including a failed lookup) gets the gate again.
  if (cfg.verifyFollow && provider.userFollowsAccount) {
    // Instagram's follow status lags a fresh follow, so re-check once after a
    // short pause, and never block the same person twice: if they've already
    // been told "can't see your follow" in this run, the next tap unlocks.
    let follows = await provider.userFollowsAccount(providerCtx(connection), run.contact.externalId);
    if (follows !== true) {
      await new Promise((r) => setTimeout(r, 3000));
      follows = await provider.userFollowsAccount(providerCtx(connection), run.contact.externalId);
    }
    if (follows !== null) {
      await prisma.contact.update({ where: { id: run.contactId }, data: { isFollower: follows } });
    }
    const alreadyBlocked =
      follows !== true &&
      (await prisma.interaction.count({
        where: {
          contactId: run.contactId,
          kind: "DM_OUTBOUND",
          occurredAt: { gte: run.createdAt },
          payload: { path: ["followGate"], equals: "not_following" },
        },
      })) > 0;
    if (follows !== true && !alreadyBlocked) {
      const retryText = String(cfg.notFollowingText || DEFAULT_NOT_FOLLOWING_TEXT).slice(0, 1000);
      const token = newToken();
      const result = await provider.sendDm(
        providerCtx(connection),
        { externalId: run.contact.externalId },
        { text: retryText, buttons: [{ title: String(cfg.gateButtonLabel ?? "I Followed").slice(0, 20), payload: token }] },
      );
      await addOutboundMessage({
        workspaceId: run.workspaceId,
        conversationId: conversation.id,
        contactId: run.contactId,
        socialConnectionId: connection.id,
        provider: "instagram" as ProviderKind,
        kind: "TEXT",
        content: retryText,
        externalId: result.externalMessageId ?? null,
        status: "SENT",
      });
      await prisma.followGateRun.update({ where: { id: run.id }, data: { pendingButtonPayload: token } });
      await recordInteraction({ workspaceId: run.workspaceId, contactId: run.contactId, kind: "DM_OUTBOUND", payload: { text: retryText, followGate: "not_following" } });
      log.info("follow gate blocked: follow not confirmed", { runId: run.id, follows });
      return true;
    }
  }

  const finalText = String(cfg.finalText ?? "").slice(0, 1000);
  if (!finalText.trim()) {
    log.error("follow gate has no finalText configured", { runId: run.id, actionId: run.actionId });
    return true;
  }
  const result = await provider.sendDm(providerCtx(connection), { externalId: run.contact.externalId }, { text: finalText });
  await addOutboundMessage({
    workspaceId: run.workspaceId,
    conversationId: conversation.id,
    contactId: run.contactId,
    socialConnectionId: connection.id,
    provider: "instagram" as ProviderKind,
    kind: "TEXT",
    content: finalText,
    externalId: result.externalMessageId ?? null,
    status: "SENT",
  });
  await recordInteraction({ workspaceId: run.workspaceId, contactId: run.contactId, kind: "DM_OUTBOUND", payload: { text: finalText, followGate: "unlocked" } });
  await prisma.followGateRun.update({ where: { id: run.id }, data: { step: 2, completedAt: new Date() } });

  log.info("follow gate unlocked", { runId: run.id, contactId: run.contactId });
  return true;
}
