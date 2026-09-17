import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { getTemplate, templates } from "@/modules/templates/catalog";
import { importAutomation } from "@/modules/automations/service";
import { AppError, NotFoundError } from "@/lib/errors";

// Automation templates — GET lists them, POST /[templateId]/instantiate
// creates an editable automation from a template.

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

const instantiateSchema = z.object({ nameOverride: z.string().max(120).optional() });

export const POST = apiRoute({
  workspace: true,
  schema: instantiateSchema,
  handler: async (ctx) => {
    const template = getTemplate(ctx.params.templateId!);
    if (!template) throw new NotFoundError("Template not found");
    if (!template.payload.automation.actions.length) {
      throw new AppError("Template has no actions and cannot be instantiated", 422, "TEMPLATE_INVALID");
    }
    const result = await importAutomation(ctx.workspace!.workspaceId, ctx.user.id, template.payload, {
      nameOverride: (ctx.body as { nameOverride?: string }).nameOverride,
    });
    return json(result, 201);
  },
});