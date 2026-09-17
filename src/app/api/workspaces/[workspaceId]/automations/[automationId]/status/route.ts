import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { setAutomationStatus } from "@/modules/automations/service";
import { audit } from "@/modules/audit/service";

export const PATCH = apiRoute({
  workspace: true,
  schema: z.object({ status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]) }),
  handler: async (ctx) => {
    const status = (ctx.body as { status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED" }).status;
    await setAutomationStatus(ctx.workspace!.workspaceId, ctx.params.automationId!, status);
    await audit({
      workspaceId: ctx.workspace!.workspaceId,
      actorUserId: ctx.user.id,
      action: `automation.${status.toLowerCase()}`,
      entityType: "automation",
      entityId: ctx.params.automationId!,
      ip: ctx.clientIp,
    });
    return json({ ok: true });
  },
});