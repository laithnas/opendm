import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { importAutomation } from "@/modules/automations/service";
import { AppError } from "@/lib/errors";
import { audit } from "@/modules/audit/service";

const importSchema = z.object({
  payload: z.unknown(), // strict schema run inside importAutomation
  nameOverride: z.string().max(120).optional(),
});

export const POST = apiRoute({
  workspace: true,
  schema: importSchema,
  handler: async (ctx) => {
    const body = ctx.body as { payload: unknown; nameOverride?: string };
    try {
      const result = await importAutomation(ctx.workspace!.workspaceId, ctx.user.id, body.payload, {
        nameOverride: body.nameOverride,
      });
      await audit({
        workspaceId: ctx.workspace!.workspaceId,
        actorUserId: ctx.user.id,
        action: "automation.imported",
        entityType: "automation",
        entityId: result.automationId,
        meta: { name: result.name, rewroteLinks: result.rewroteLinks },
        ip: ctx.clientIp,
      });
      return json(result, 201);
    } catch (err) {
      if (
        err instanceof Error &&
        "issues" in (err as { issues?: unknown[] }) &&
        typeof (err as { issues?: unknown[] }).issues === "object"
      ) {
        throw new AppError("Import failed schema validation — the file may be corrupt or from a newer version", 422, "IMPORT_INVALID");
      }
      if (err instanceof AppError) throw err;
      throw new AppError(err instanceof Error ? err.message : "Import failed", 422, "IMPORT_FAILED");
    }
  },
});