import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { randomCode } from "@/lib/ids";
import { getProviderForConnection } from "@/modules/providers/registry";
import { providerCtx, windowVerdictFor } from "@/modules/engine/execute";
import { upsertConversation, addInboundMessage, addOutboundMessage } from "@/modules/inbox/service";
import { recordInteraction } from "@/modules/contacts/service";
import type { NormalizedEvent, ProviderKind } from "@/modules/providers/types";
import type { SocialConnection } from "@prisma/client";

// "Follow me, tap the button, get the link" — a friction step, not a real
// verified gate. Meta's API has no "does user X follow account Y" endpoint
// for third-party apps (confirmed against Meta's own docs and, separately,
// ManyChat's community/moderators describing their own version as an
// undocumented, delayed, gameable mechanism even as an official Meta
// partner). This is the honest version: the tap alone unlocks the message.
// See docs/meta-setup.md for the write-up.

const GATE_PAYLOAD_PREFIX = "fg:";

export function isGateButtonPayload(payload: string | null | undefined): boolean {
  return Boolean(payload && payload.startsWith(GATE_PAYLOAD_PREFIX));
}

/**
 * Called from the FOLLOW_GATE action: creates the run and sends the gate
 * prompt DM (mirrors SEND_DM's window/private-reply handling).
 */
export async function startFollowGate(input: {
  workspaceId: string;
  actionId: string;
  executionId: string;
  contactId: string;
  connection: SocialConnection;
  gateText: string;
  gateButtonLabel: string;
  /** Comment id to use for a private reply when this is the first DM to this contact. */
  privateReplyCommentId?: string;
}): Promise<{ externalMessageId?: string }> {
  const gateButtonPayload = `${GATE_PAYLOAD_PREFIX}${randomCode(20)}`;
  const provider = getProviderForConnection(input.connection);
  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: input.contactId } });

  const result = await provider.sendDm(
    providerCtx(input.connection),
    { externalId: contact.externalId, commentId: input.privateReplyCommentId },
    { text: input.gateText, buttons: [{ title: input.gateButtonLabel, payload: gateButtonPayload }] },
  );

  await prisma.followGateRun.create({
    data: {
      workspaceId: input.workspaceId,
      actionId: input.actionId,
      contactId: input.contactId,
      socialConnectionId: input.connection.id,
      gateButtonPayload,
      step: 0,
    },
  });

  await recordInteraction({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    kind: "DM_OUTBOUND",
    payload: { text: input.gateText, followGate: "prompt" },
    executionId: input.executionId,
  });

  return { externalMessageId: result.externalMessageId };
}

/**
 * Called from ingest when an incoming DM's button payload matches an open
 * FollowGateRun: sends the real message, no verification performed.
 */
export async function advanceFollowGate(event: NormalizedEvent, connection: SocialConnection): Promise<boolean> {
  if (!isGateButtonPayload(event.buttonPayload)) return false;

  const run = await prisma.followGateRun.findUnique({
    where: { gateButtonPayload: event.buttonPayload! },
    include: { action: true, contact: true },
  });
  if (!run || run.workspaceId !== connection.workspaceId || run.step !== 0) {
    // Unknown, already-completed, or cross-workspace token — nothing to do.
    return isGateButtonPayload(event.buttonPayload);
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

  const finalText = String((run.action.config as { finalText?: string })?.finalText ?? "").slice(0, 1000);
  if (!finalText.trim()) {
    log.error("follow gate has no finalText configured", { runId: run.id, actionId: run.actionId });
    return true;
  }

  const verdict = windowVerdictFor(conversation.lastInboundAt);
  if (!verdict.allowed) {
    log.warn("follow gate tap outside messaging window", { runId: run.id, reason: verdict.reason });
    return true;
  }

  const provider = getProviderForConnection(connection);
  const result = await provider.sendDm(
    providerCtx(connection),
    { externalId: run.contact.externalId },
    { text: finalText },
  );

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
  await recordInteraction({
    workspaceId: run.workspaceId,
    contactId: run.contactId,
    kind: "DM_OUTBOUND",
    payload: { text: finalText, followGate: "unlocked" },
  });

  await prisma.followGateRun.update({
    where: { id: run.id },
    data: { step: 1, completedAt: new Date() },
  });

  log.info("follow gate unlocked", { runId: run.id, contactId: run.contactId });
  return true;
}
