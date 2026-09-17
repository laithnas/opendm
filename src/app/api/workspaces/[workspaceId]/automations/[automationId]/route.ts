import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { getAutomation, updateAutomation, setAutomationStatus } from "@/modules/automations/service";
import { automationInputSchema } from "@/modules/automations/schema";
import { audit } from "@/modules/audit/service";

export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const automation = await getAutomation(ctx.workspace!.workspaceId, ctx.params.automationId!);
    return json({ automation });
  },
});

export const PATCH = apiRoute({
  workspace: true,
  schema: automationInputSchema,
  handler: async (ctx) => {
    const input = ctx.body as z.infer<typeof automationInputSchema>;
    const automation = await updateAutomation(ctx.workspace!.workspaceId, ctx.params.automationId!, input);
    await audit({
      workspaceId: ctx.workspace!.workspaceId,
      actorUserId: ctx.user.id,
      action: "automation.updated",
      entityType: "automation",
      entityId: automation.id,
      meta: { name: automation.name },
      ip: ctx.clientIp,
    });
    return json({ automation });
  },
});

// Delete = soft archive (executions/history stay intact).
export const DELETE = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    await setAutomationStatus(ctx.workspace!.workspaceId, ctx.params.automationId!, "ARCHIVED");
    await audit({
      workspaceId: ctx.workspace!.workspaceId,
      actorUserId: ctx.user.id,
      action: "automation.archived",
      entityType: "automation",
      entityId: ctx.params.automationId!,
      ip: ctx.clientIp,
    });
    return json({ ok: true });
  },
});