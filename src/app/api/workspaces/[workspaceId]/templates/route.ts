import { apiRoute, json } from "@/lib/api";
import { templates } from "@/modules/templates/catalog";

// GET /api/workspaces/:workspaceId/templates — list the template catalog.
export const GET = apiRoute({
  workspace: true,
  handler: async () => {
    return json({
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        triggerLabel: t.triggerLabel,
        actionCount: t.payload.automation.actions.length,
      })),
    });
  },
});