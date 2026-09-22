import { z } from "zod";
import { apiRoute, json } from "@/lib/api";
import { backfillComments } from "@/modules/automations/backfill";

// POST /api/workspaces/:workspaceId/automations/:automationId/backfill
// Runs a comment automation over comments that already exist on the connected
// account's posts. `dryRun: true` only reports what would be sent.

const bodySchema = z.object({
  dryRun: z.boolean().optional(),
  maxAgeDays: z.number().int().min(1).max(365).optional(),
  mediaId: z.string().min(1).max(200).optional(),
  maxPosts: z.number().int().min(1).max(100).optional(),
});

export const POST = apiRoute({
  workspace: true,
  roles: ["OWNER", "ADMIN"],
  schema: bodySchema,
  handler: async (ctx) => {
    const body = ctx.body as z.infer<typeof bodySchema>;
    const result = await backfillComments({
      workspaceId: ctx.workspace!.workspaceId,
      automationId: ctx.params.automationId!,
      ...body,
    });
    return json({ ok: true, ...result });
  },
});
