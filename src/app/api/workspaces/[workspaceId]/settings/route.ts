import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWorkspaceRole } from "@/modules/workspaces/access";

export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const [connections, workspace] = await Promise.all([
      prisma.socialConnection.findMany({
        where: { workspaceId: ctx.workspace!.workspaceId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.workspace.findUnique({
        where: { id: ctx.workspace!.workspaceId },
        select: { plan: true, settings: true, name: true, slug: true },
      }),
    ]);
    return json({
      connections,
      plan: workspace?.plan ?? "free",
      settings: workspace?.settings ?? {},
      workspace: { name: workspace?.name, slug: workspace?.slug },
    });
  },
});

export const PATCH = apiRoute({
  workspace: true,
  roles: ["OWNER", "ADMIN"],
  schema: z.object({
    plan: z.enum(["free", "growth", "agency"]).optional(),
    name: z.string().min(1).max(120).optional(),
  }),
  handler: async (ctx) => {
    const body = ctx.body as { plan?: "free" | "growth" | "agency"; name?: string };
    const data: Record<string, unknown> = {};
    if (body.plan) data.plan = body.plan;
    if (body.name) data.name = body.name;
    if (Object.keys(data).length) {
      await prisma.workspace.update({ where: { id: ctx.workspace!.workspaceId }, data });
    }
    return json({ ok: true });
  },
});

