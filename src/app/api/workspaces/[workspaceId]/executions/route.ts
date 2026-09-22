import { apiRoute, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const status = ctx.req.nextUrl.searchParams.get("status") ?? "ALL";
    const page = Number(ctx.req.nextUrl.searchParams.get("page") ?? "1");
    const pageSize = 25;
    const where: Prisma.ExecutionWhereInput = { workspaceId: ctx.workspace!.workspaceId };
    if (status && status !== "ALL") where.status = status as Prisma.ExecutionWhereInput["status"];
    const username = ctx.req.nextUrl.searchParams.get("username");
    if (username) where.contact = { username };

    const [items, total] = await Promise.all([
      prisma.execution.findMany({
        where,
        include: {
          automation: { select: { id: true, name: true } },
          contact: { select: { id: true, username: true, name: true } },
          _count: { select: { steps: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.execution.count({ where }),
    ]);
    return json({ executions: items, total, page, pageSize });
  },
});