import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { requireWorkspaceRole, renameWorkspace } from "@/modules/workspaces/access";
import { setWorkspaceCookie } from "@/auth/session";
import { audit } from "@/modules/audit/service";

export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    setWorkspaceCookie(ctx.workspace!.workspaceId);
    return json({ workspace: ctx.workspace!.workspace });
  },
});

export const PATCH = apiRoute({
  workspace: true,
  roles: ["OWNER", "ADMIN"],
  schema: z.object({ name: z.string().min(1).max(120) }),
  handler: async (ctx) => {
    await renameWorkspace(ctx.workspace!.workspaceId, (ctx.body as { name: string }).name);
    await audit({
      workspaceId: ctx.workspace!.workspaceId,
      actorUserId: ctx.user.id,
      action: "workspace.renamed",
      entityType: "workspace",
      entityId: ctx.workspace!.workspaceId,
      ip: ctx.clientIp,
      userAgent: ctx.req.headers.get("user-agent"),
    });
    return json({ ok: true });
  },
});