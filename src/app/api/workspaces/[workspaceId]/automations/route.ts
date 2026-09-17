import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { listAutomations, createAutomation } from "@/modules/automations/service";
import { automationInputSchema } from "@/modules/automations/schema";
import { audit } from "@/modules/audit/service";
import { AppError } from "@/lib/errors";

export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const status = ctx.req.nextUrl.searchParams.get("status") ?? "ALL";
    const page = Number(ctx.req.nextUrl.searchParams.get("page") ?? "1");
    const result = await listAutomations(ctx.workspace!.workspaceId, { status, page, pageSize: 50 });
    return json(result);
  },
});

export const POST = apiRoute({
  workspace: true,
  schema: automationInputSchema,
  handler: async (ctx) => {
    const input = ctx.body as z.infer<typeof automationInputSchema>;
    // Client sends triggerConfig with keywords for compatibility; builder
    // stores config in conditions — both accepted.
    const automation = await createAutomation(ctx.workspace!.workspaceId, ctx.user.id, input);
    await audit({
      workspaceId: ctx.workspace!.workspaceId,
      actorUserId: ctx.user.id,
      action: "automation.created",
      entityType: "automation",
      entityId: automation.id,
      meta: { name: automation.name },
      ip: ctx.clientIp,
      userAgent: ctx.req.headers.get("user-agent"),
    });
    return json({ automation }, 201);
  },
});

