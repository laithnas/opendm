import { prisma } from "@/lib/db";
import type { Prisma, $Enums } from "@prisma/client";
import { MESSAGING_WINDOW_HOURS } from "@/config";
import type { NormalizedEvent, ProviderKind } from "@/modules/providers/types";

// Conversations (unified inbox) backed by the provider messaging API.

function providerEnum(provider: ProviderKind | string): $Enums.SocialProvider {
  return provider.toUpperCase() as unknown as $Enums.SocialProvider;
}

export interface UpsertConversationInput {
  workspaceId: string;
  socialConnectionId: string;
  contactId: string;
  provider: ProviderKind;
  externalId: string;
  type: "DM" | "STORY_REPLY";
  inboundAt?: Date | null;
}

export async function upsertConversation(input: UpsertConversationInput) {
  const { inboundAt } = input;
  const provider = providerEnum(input.provider);
  const existing = await prisma.conversation.findUnique({
    where: {
      workspaceId_provider_externalId: {
        workspaceId: input.workspaceId,
        provider,
        externalId: input.externalId,
      },
    },
  });
  if (existing) {
    if (inboundAt) {
      return prisma.conversation.update({
        where: { id: existing.id },
        data: {
          unread: true,
          lastMessageAt: inboundAt,
          lastInboundAt: inboundAt,
          status: "OPEN",
        },
      });
    }
    return existing;
  }
  return prisma.conversation.create({
    data: {
      workspaceId: input.workspaceId,
      socialConnectionId: input.socialConnectionId,
      contactId: input.contactId,
      provider,
      externalId: input.externalId,
      type: input.type,
      unread: true,
      lastMessageAt: inboundAt ?? new Date(),
      lastInboundAt: inboundAt ?? null,
    },
  });
}

export async function addInboundMessage(
  input: {
    workspaceId: string;
    conversationId: string;
    contactId: string;
    socialConnectionId?: string | null;
    provider: ProviderKind;
    kind?: string;
    content: string;
    externalId?: string | null;
    occurredAt: Date;
  },
) {
  const existing = input.externalId
    ? await prisma.message.findFirst({
        where: { workspaceId: input.workspaceId, externalId: input.externalId },
      })
    : null;
  if (existing) return existing;
  const msg = await prisma.message.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      contactId: input.contactId,
      socialConnectionId: input.socialConnectionId ?? null,
      provider: providerEnum(input.provider),
      direction: "INBOUND",
      kind: input.kind ?? "TEXT",
      content: input.content,
      externalId: input.externalId ?? null,
      status: "DELIVERED",
      sentAt: input.occurredAt,
      deliveredAt: input.occurredAt,
    },
  });
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { unread: true, lastMessageAt: input.occurredAt, lastInboundAt: input.occurredAt },
  });
  return msg;
}

export async function addOutboundMessage(
  input: {
    workspaceId: string;
    conversationId: string;
    contactId: string;
    socialConnectionId?: string | null;
    provider: ProviderKind;
    kind?: string;
    content: string;
    externalId?: string | null;
    status?: "PENDING" | "SENT" | "DELIVERED" | "FAILED";
    error?: string | null;
    sentAt?: Date | null;
  },
) {
  const msg = await prisma.message.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      contactId: input.contactId,
      socialConnectionId: input.socialConnectionId ?? null,
      provider: providerEnum(input.provider),
      direction: "OUTBOUND",
      kind: input.kind ?? "TEXT",
      content: input.content,
      externalId: input.externalId ?? null,
      status: input.status ?? "SENT",
      error: input.error ?? null,
      sentAt: input.sentAt ?? new Date(),
      deliveredAt: input.status === "DELIVERED" ? new Date() : null,
    },
  });
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { lastMessageAt: new Date() },
  });
  return msg;
}

export interface ConversationListQuery {
  workspaceId: string;
  status?: string;
  query?: string;
  page?: number;
  pageSize?: number;
}

export async function listConversations(q: ConversationListQuery) {
  const { workspaceId, status, query, page = 1, pageSize = 25 } = q;
  const where: Record<string, unknown> = { workspaceId };
  if (status && status !== "ALL") where.status = status;
  if (query) {
    where.OR = [
      { contact: { username: { contains: query, mode: "insensitive" } } },
      { contact: { name: { contains: query, mode: "insensitive" } } },
      { messages: { some: { content: { contains: query, mode: "insensitive" } } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        contact: { select: { id: true, username: true, name: true, notes: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true, direction: true, createdAt: true, kind: true } },
      },
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.conversation.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getConversation(workspaceId: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    include: {
      contact: {
        include: {
          tags: { include: { tag: true } },
          _count: { select: { messages: true, linkClicks: true } },
        },
      },
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
}

export async function markConversationRead(workspaceId: string, conversationId: string) {
  await prisma.conversation.updateMany({
    where: { id: conversationId, workspaceId },
    data: { unread: false },
  });
}

export async function setConversationStatus(workspaceId: string, conversationId: string, status: "OPEN" | "CLOSED") {
  await prisma.conversation.updateMany({
    where: { id: conversationId, workspaceId },
    data: { status },
  });
}

// ── Messaging window (Meta rule) ─────────────────────────────────────────

export interface WindowVerdict {
  allowed: boolean;
  reason: string;
}

/**
 * Instagram business messaging rule: a business may message a user only
 * inside the 7-day window since the user's last inbound message. A comment
 * trigger with no prior conversation is treated as in-window; Meta enforces
 * the real boundary and we surface its rejection verbatim.
 */
export function messagingWindowVerdict(
  lastInboundAt: Date | null | undefined,
  now = new Date(),
): WindowVerdict {
  if (!lastInboundAt) {
    return { allowed: true, reason: "no prior conversation — first contact" };
  }
  const hours = (now.getTime() - lastInboundAt.getTime()) / (60 * 60 * 1000);
  if (hours <= MESSAGING_WINDOW_HOURS) {
    return { allowed: true, reason: `inside ${MESSAGING_WINDOW_HOURS}-hour window` };
  }
  return {
    allowed: false,
    reason: `outside the ${MESSAGING_WINDOW_HOURS}-hour messaging window (last user message ${Math.floor(hours)}h ago). Instagram blocks business DMs outside the window.`,
  };
}