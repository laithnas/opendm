import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { requireWorkspaceRole, updateMemberRole, removeMember } from "@/modules/workspaces/access";
import { audit } from "@/modules/audit/service";

export const PATCH = apiRoute({
  workspace: true,
  roles: ["OWNER", "ADMIN"],
  schema: z.object({ role: z.enum(["OWNER", "ADMIN", "MEMBER"]) }),
  handler: async (ctx) => {
    const memberId = ctx.params.memberId!;
    const role = (ctx.body as { role: "OWNER" | "ADMIN" | "MEMBER" }).role;
    await updateMemberRole(ctx.user.id, ctx.workspace!.workspaceId, memberId, role);
    await audit({
      workspaceId: ctx.workspace!.workspaceId,
      actorUserId: ctx.user.id,
      action: "member.role_changed",
      entityType: "member",
      entityId: memberId,
      meta: { role },
      ip: ctx.clientIp,
      userAgent: ctx.req.headers.get("user-agent"),
    });
    return json({ ok: true });
  },
});

export const DELETE = apiRoute({
  workspace: true,
  roles: ["OWNER", "ADMIN"],
  handler: async (ctx) => {
    const memberId = ctx.params.memberId!;
    await removeMember(ctx.user.id, ctx.workspace!.workspaceId, memberId);
    await audit({
      workspaceId: ctx.workspace!.workspaceId,
      actorUserId: ctx.user.id,
      action: "member.removed",
      entityType: "member",
      entityId: memberId,
      ip: ctx.clientIp,
    });
    return json({ ok: true });
  },
});