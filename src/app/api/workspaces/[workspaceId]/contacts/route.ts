import { apiRoute, json } from "@/lib/api";
import { listContacts, getContactById, setContactNotes, removeContactTag, listContactTags } from "@/modules/contacts/service";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { recordInteraction } from "@/modules/contacts/service";

export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const query = ctx.req.nextUrl.searchParams.get("q") ?? undefined;
    const tagId = ctx.req.nextUrl.searchParams.get("tag") ?? undefined;
    const page = Number(ctx.req.nextUrl.searchParams.get("page") ?? "1");
    const [result, tags] = await Promise.all([
      listContacts(ctx.workspace!.workspaceId, { query, tagId, page }),
      listContactTags(ctx.workspace!.workspaceId),
    ]);
    return json({ ...result, tags });
  },
});

export const POST = apiRoute({
  workspace: true,
  schema: z.object({ username: z.string().min(1).max(200), name: z.string().max(200).optional(), notes: z.string().max(2000).optional() }),
  handler: async (ctx) => {
    const body = ctx.body as { username: string; name?: string; notes?: string };
    const { upsertContact } = await import("@/modules/contacts/service");
    const contact = await upsertContact({
      workspaceId: ctx.workspace!.workspaceId,
      provider: "instagram",
      externalId: `manual-${body.username}-${Date.now().toString(36)}`,
      username: body.username,
      name: body.name,
      source: "MANUAL",
    });
    if (body.notes) await setContactNotes(ctx.workspace!.workspaceId, contact.id, body.notes);
    return json({ contact }, 201);
  },
});