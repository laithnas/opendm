import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { getConversation, markConversationRead, setConversationStatus, addOutboundMessage, messagingWindowVerdict } from "@/modules/inbox/service";
import { getSocialProvider } from "@/modules/providers/registry";
import { providerCtx } from "@/modules/engine/execute";
import { prisma } from "@/lib/db";
import { AppError, ProviderError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { recordInteraction } from "@/modules/contacts/service";
import { MAX_MESSAGE_LENGTH } from "@/config";

export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const conversation = await getConversation(ctx.workspace!.workspaceId, ctx.params.conversationId!);
    if (!conversation) return json({ error: "Conversation not found" }, 404);
    await markConversationRead(ctx.workspace!.workspaceId, conversation.id);

    // Report the messaging-window status honestly so the UI can say why
    // replies may be blocked by Meta.
    const verdict = messagingWindowVerdict(conversation.lastInboundAt ?? conversation.lastMessageAt ?? null);
    return json({ conversation, window: verdict });
  },
});

export const PATCH = apiRoute({
  workspace: true,
  schema: z.object({ status: z.enum(["OPEN", "CLOSED"]) }),
  handler: async (ctx) => {
    const { status } = ctx.body as { status: "OPEN" | "CLOSED" };
    await setConversationStatus(ctx.workspace!.workspaceId, ctx.params.conversationId!, status);
    return json({ ok: true });
  },
});

// POST reply — sends through the provider (mock in demo mode).
export const POST = apiRoute({
  workspace: true,
  schema: z.object({ content: z.string().min(1).max(MAX_MESSAGE_LENGTH) }),
  handler: async (ctx) => {
    const content = (ctx.body as { content: string }).content;
    const conversation = await getConversation(ctx.workspace!.workspaceId, ctx.params.conversationId!);
    if (!conversation) throw new AppError("Conversation not found", 404, "NOT_FOUND");

    // Window check with the real rule — refuse clearly instead of failing
    // at the provider with a cryptic error.
    const verdict = messagingWindowVerdict(conversation.lastInboundAt ?? conversation.lastMessageAt ?? null);
    if (!verdict.allowed) {
      throw new AppError(
        `Reply blocked: ${verdict.reason}. Instagram only allows business replies inside the messaging window.`,
        409,
        "WINDOW_CLOSED",
      );
    }

    const connection = await prisma.socialConnection.findUnique({
      where: { id: conversation.socialConnectionId },
    });
    if (!connection || connection.status !== "ACTIVE") {
      throw new AppError("The connected account is unavailable — reconnect it in Settings", 409, "CONNECTION_UNAVAILABLE");
    }

    const provider = getSocialProvider(connection.provider.toLowerCase());
    const result = await provider.sendDm(providerCtx(connection), { externalId: conversation.contact.externalId }, { text: content });

    await addOutboundMessage({
      workspaceId: ctx.workspace!.workspaceId,
      conversationId: conversation.id,
      contactId: conversation.contactId,
      socialConnectionId: connection.id,
      provider: connection.provider.toLowerCase() as "instagram",
      content,
      externalId: result.externalMessageId ?? null,
      status: "SENT",
    });
    await recordInteraction({
      workspaceId: ctx.workspace!.workspaceId,
      contactId: conversation.contactId,
      kind: "DM_OUTBOUND",
      payload: { text: content, source: "inbox" },
    });
    log.info("inbox reply sent", { conversationId: conversation.id, contactId: conversation.contactId });

    return json({ ok: true, messageId: result.externalMessageId ?? null });
  },
});

