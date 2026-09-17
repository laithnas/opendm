import { apiRoute, json } from "@/lib/api";
import { requireWorkspaceRole, revokeInvite } from "@/modules/workspaces/access";
import { audit } from "@/modules/audit/service";

export const DELETE = apiRoute({
  workspace: true,
  roles: ["OWNER", "ADMIN"],
  handler: async (ctx) => {
    await revokeInvite(ctx.workspace!.workspaceId, ctx.params.inviteId!);
    await audit({
      workspaceId: ctx.workspace!.workspaceId,
      actorUserId: ctx.user.id,
      action: "invite.revoked",
      entityType: "invite",
      entityId: ctx.params.inviteId!,
      ip: ctx.clientIp,
    });
    return json({ ok: true });
  },
});