import { apiRoute, json } from "@/lib/api";
import { listConversations, getConversation, markConversationRead, setConversationStatus, addOutboundMessage } from "@/modules/inbox/service";
import { z } from "zod";
import { getSocialProvider } from "@/modules/providers/registry";
import { providerCtx, windowVerdictFor } from "@/modules/engine/execute";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { recordInteraction } from "@/modules/contacts/service";

export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const status = ctx.req.nextUrl.searchParams.get("status") ?? "ALL";
    const query = ctx.req.nextUrl.searchParams.get("q") ?? undefined;
    const page = Number(ctx.req.nextUrl.searchParams.get("page") ?? "1");
    const result = await listConversations({ workspaceId: ctx.workspace!.workspaceId, status, query, page });
    return json(result);
  },
});

export const POST = apiRoute({
  workspace: true,
  schema: z.object({ conversationId: z.string() }),
  handler: async (ctx) => {
    // Simulate an inbound DM for the conversation (demo/testing flow).
    const body = ctx.body as { conversationId: string };
    const conversation = await prisma.conversation.findFirst({
      where: { id: body.conversationId, workspaceId: ctx.workspace!.workspaceId },
      include: { contact: true },
    });
    if (!conversation) throw new AppError("Conversation not found", 404, "NOT_FOUND");
    const { addInboundMessage } = await import("@/modules/inbox/service");
    await addInboundMessage({
      workspaceId: ctx.workspace!.workspaceId,
      conversationId: conversation.id,
      contactId: conversation.contactId,
      socialConnectionId: conversation.socialConnectionId,
      provider: conversation.provider.toLowerCase() as "instagram",
      content: "New inbound message…",
      externalId: `test-in-${Date.now()}`,
      occurredAt: new Date(),
    });
    return json({ ok: true });
  },
});