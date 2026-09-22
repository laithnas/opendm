import { z } from "zod";
import { apiRoute, json } from "@/lib/api";
import { requireWorkspaceRole } from "@/modules/workspaces/access";
import { revokeConnection, checkConnectionHealth } from "@/modules/providers/connections";
import { audit } from "@/modules/audit/service";
import { env } from "@/lib/env";

export const DELETE = apiRoute({
  workspace: true,
  roles: ["OWNER", "ADMIN"],
  handler: async (ctx) => {
    await revokeConnection(ctx.workspace!.workspaceId, ctx.params.connectionId!);
    await audit({
      workspaceId: ctx.workspace!.workspaceId,
      actorUserId: ctx.user.id,
      action: "connection.revoked",
      entityType: "connection",
      entityId: ctx.params.connectionId!,
      ip: ctx.clientIp,
    });
    return json({ ok: true });
  },
});

// POST {action:"health"} — run a live token health check.
export const POST = apiRoute({
  workspace: true,
  schema: z.object({ action: z.string() }),
  handler: async (ctx) => {
    const { action } = ctx.body as { action: string };
    if (action === "health") {
      const result = await checkConnectionHealth(ctx.workspace!.workspaceId, ctx.params.connectionId!);
      return json(result);
    }
    return json({ error: "Unknown action" }, 422);
  },
});

