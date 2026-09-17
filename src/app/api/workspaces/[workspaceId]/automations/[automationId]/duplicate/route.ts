import { apiRoute, json } from "@/lib/api";
import { duplicateAutomation } from "@/modules/automations/service";

export const POST = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const automation = await duplicateAutomation(ctx.workspace!.workspaceId, ctx.params.automationId!);
    return json({ automation }, 201);
  },
});