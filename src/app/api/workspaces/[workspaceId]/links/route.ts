import { apiRoute, json } from "@/lib/api";
import { getLinksForWorkspace, createTrackedLink, linkUrl } from "@/modules/links/service";
import { z } from "zod";

export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const links = await getLinksForWorkspace(ctx.workspace!.workspaceId);
    return json({
      links: links.map((l) => ({ ...l, url: linkUrl(l.slug) })),
    });
  },
});

export const POST = apiRoute({
  workspace: true,
  schema: z.object({ name: z.string().min(1).max(200), destination: z.string().url().max(2048) }),
  handler: async (ctx) => {
    const body = ctx.body as { name: string; destination: string };
    const link = await createTrackedLink({
      workspaceId: ctx.workspace!.workspaceId,
      name: body.name,
      destination: body.destination,
      createdById: ctx.user.id,
    });
    return json({ link: { ...link, url: linkUrl(link.slug) } }, 201);
  },
});