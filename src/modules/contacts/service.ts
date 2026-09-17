import { prisma } from "@/lib/db";
import type { Prisma, $Enums } from "@prisma/client";
import type { SocialProvider, NormalizedEvent } from "@/modules/providers/types";

// Contacts / mini-CRM service. Storage is deliberately minimal: only data a
// business legitimately has from the platform API is kept.

export interface UpsertContactInput {
  workspaceId: string;
  provider: string;
  externalId: string;
  username?: string;
  name?: string;
  source?: string;
  isFollower?: boolean | null;
  meta?: Record<string, unknown>;
}

export async function upsertContact(input: UpsertContactInput) {
  const now = new Date();
  // Normalize: engine events carry lowercase provider kinds ("instagram"),
  // the DB stores the enum uppercase ("INSTAGRAM").
  const provider = input.provider.toUpperCase() as unknown as $Enums.SocialProvider;
  const existing = await prisma.contact.findUnique({
    where: {
      workspaceId_provider_externalId: {
        workspaceId: input.workspaceId,
        provider,
        externalId: input.externalId,
      },
    },
  });
  if (existing) {
    return prisma.contact.update({
      where: { id: existing.id },
      data: {
        username: input.username ?? existing.username,
        name: input.name ?? existing.name,
        isFollower: input.isFollower !== undefined ? input.isFollower : existing.isFollower,
        lastSeenAt: now,
        meta: { ...(existing.meta as Record<string, unknown>), ...(input.meta ?? {}) } as Prisma.InputJsonValue,
      },
    });
  }
  return prisma.contact.create({
    data: {
      workspaceId: input.workspaceId,
      provider,
      externalId: input.externalId,
      username: input.username ?? input.externalId,
      name: input.name,
      source: input.source ?? "SOCIAL",
      isFollower: input.isFollower ?? null,
      meta: (input.meta ?? {}) as Prisma.InputJsonValue,
      firstSeenAt: now,
      lastSeenAt: now,
    },
  });
}

export async function getContact(workspaceId: string, provider: string, externalId: string) {
  return prisma.contact.findUnique({
    where: {
      workspaceId_provider_externalId: {
        workspaceId,
        provider: provider.toUpperCase() as unknown as $Enums.SocialProvider,
        externalId,
      },
    },
  });
}

export async function getContactById(workspaceId: string, contactId: string) {
  return prisma.contact.findFirst({ where: { id: contactId, workspaceId } });
}

/** Tag a contact; creates the tag row when it does not exist yet. */
export async function tagContact(workspaceId: string, contactId: string, tagName: string, color?: string) {
  const tag = await prisma.contactTag.upsert({
    where: { workspaceId_name: { workspaceId, name: tagName } },
    create: { workspaceId, name: tagName, color: color ?? defaultTagColor(tagName) },
    update: {},
  });
  await prisma.contactTagLink.upsert({
    where: { contactId_tagId: { contactId, tagId: tag.id } },
    create: { contactId, tagId: tag.id },
    update: {},
  });
  return tag;
}

function defaultTagColor(_name: string): string {
  return "#E5322D";
}

export async function listContactTags(workspaceId: string) {
  return prisma.contactTag.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
}

export async function removeContactTag(workspaceId: string, contactId: string, tagId: string) {
  const tag = await prisma.contactTag.findFirst({ where: { id: tagId, workspaceId } });
  if (!tag) return;
  await prisma.contactTagLink.deleteMany({ where: { contactId, tagId } });
}

export async function setContactNotes(workspaceId: string, contactId: string, notes: string) {
  return prisma.contact.updateMany({ where: { id: contactId, workspaceId }, data: { notes } });
}

export async function listContacts(workspaceId: string, opts: { query?: string; tagId?: string; page?: number; pageSize?: number }) {
  const { query, tagId, page = 1, pageSize = 25 } = opts;
  const where: Record<string, unknown> = { workspaceId };
  if (query) {
    where.OR = [
      { username: { contains: query, mode: "insensitive" } },
      { name: { contains: query, mode: "insensitive" } },
      { notes: { contains: query, mode: "insensitive" } },
    ];
  }
  if (tagId) {
    where.tags = { some: { tagId } };
  }
  const [items, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        tags: { include: { tag: { select: { id: true, name: true, color: true } } }, take: 8 },
        _count: { select: { messages: true, linkClicks: true, executions: true } },
      },
      orderBy: { lastSeenAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contact.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function recordInteraction(
  input: {
    workspaceId: string;
    contactId: string;
    kind: string;
    payload?: Record<string, unknown>;
    automationId?: string | null;
    executionId?: string | null;
  },
) {
  return prisma.interaction.create({
    data: {
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      automationId: input.automationId ?? null,
      executionId: input.executionId ?? null,
      kind: input.kind as never,
      payload: (input.payload ?? {}) as object,
    },
  });
}

export async function contactTimeline(contactId: string, workspaceId: string, limit = 50) {
  return prisma.interaction.findMany({
    where: { contactId, workspaceId },
    include: { automation: { select: { id: true, name: true } } },
    orderBy: { occurredAt: "desc" },
    take: limit,
  });
}

export async function linkContactToPlatform(contact: { id: string }, _provider: SocialProvider, _event: NormalizedEvent) {
  // Extension point: fetch richer public profile data via provider APIs
  // where legally available. v1 keeps contact data to what webhooks supply.
  return contact;
}