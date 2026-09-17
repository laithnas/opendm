import { exportAutomation } from "@/modules/automations/service";
import { apiRoute } from "@/lib/api";

// GET export → downloadable portable JSON (schema "leonyx.flow.automation").
export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const payload = await exportAutomation(ctx.workspace!.workspaceId, ctx.params.automationId!);
    const filename =
      payload.automation.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "automation";
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}-automation.json"`,
      },
    });
  },
});