import { apiRoute, json } from "@/lib/api";
import { getContactById, setContactNotes, contactTimeline, tagContact, recordInteraction, removeContactTag } from "@/modules/contacts/service";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { NotFoundError, ConflictError } from "@/lib/errors";

export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const contact = await getContactById(ctx.workspace!.workspaceId, ctx.params.contactId!);
    if (!contact) throw new NotFoundError("Contact not found");
    const [timeline, conversations, tags, clicks] = await Promise.all([
      contactTimeline(contact.id, ctx.workspace!.workspaceId),
      prisma.conversation.findMany({
        where: { contactId: contact.id, workspaceId: ctx.workspace!.workspaceId },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
      }),
      prisma.contactTagLink.findMany({
        where: { contactId: contact.id },
        include: { tag: true },
      }),
      prisma.linkClick.findMany({
        where: { contactId: contact.id, workspaceId: ctx.workspace!.workspaceId },
        include: { link: { select: { name: true, destination: true, slug: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);
    return json({ contact, timeline, conversations, tags: tags.map((t) => t.tag), clicks });
  },
});

export const PATCH = apiRoute({
  workspace: true,
  schema: z.object({ notes: z.string().max(2000).optional() }),
  handler: async (ctx) => {
    const contact = await getContactById(ctx.workspace!.workspaceId, ctx.params.contactId!);
    if (!contact) throw new NotFoundError("Contact not found");
    const { notes } = ctx.body as { notes?: string };
    if (notes !== undefined) {
      await setContactNotes(ctx.workspace!.workspaceId, contact.id, notes);
      await recordInteraction({
        workspaceId: ctx.workspace!.workspaceId,
        contactId: contact.id,
        kind: "NOTE_ADDED",
        payload: { note: notes.slice(0, 200) },
      });
    }
    return json({ ok: true });
  },
});

export const POST = apiRoute({
  workspace: true,
  schema: z.object({ action: z.enum(["addTag", "removeTag"]), tag: z.string().max(50).optional(), tagId: z.string().optional() }),
  handler: async (ctx) => {
    const contact = await getContactById(ctx.workspace!.workspaceId, ctx.params.contactId!);
    if (!contact) throw new NotFoundError("Contact not found");
    const body = ctx.body as { action: "addTag" | "removeTag"; tag?: string; tagId?: string };
    if (body.action === "addTag") {
      if (!body.tag?.trim()) throw new NotFoundError("Tag name required");
      const tag = await tagContact(ctx.workspace!.workspaceId, contact.id, body.tag.trim());
      await recordInteraction({
        workspaceId: ctx.workspace!.workspaceId,
        contactId: contact.id,
        kind: "TAG_ADDED",
        payload: { tag: tag.name },
      });
      return json({ ok: true, tag });
    }
    if (!body.tagId) throw new NotFoundError("Tag id required");
    await removeContactTag(ctx.workspace!.workspaceId, contact.id, body.tagId);
    return json({ ok: true });
  },
});

