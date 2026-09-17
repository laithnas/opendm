import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { requireWorkspaceRole, inviteMember, listMembers, listInvites } from "@/modules/workspaces/access";
import { audit } from "@/modules/audit/service";
import { AppError } from "@/lib/errors";

export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const [members, invites] = await Promise.all([
      listMembers(ctx.workspace!.workspaceId),
      listInvites(ctx.workspace!.workspaceId),
    ]);
    return json({ members, invites });
  },
});

export const POST = apiRoute({
  workspace: true,
  roles: ["OWNER", "ADMIN"],
  schema: z.object({ email: z.string().email(), role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER") }),
  handler: async (ctx) => {
    const body = ctx.body as { email: string; role: "OWNER" | "ADMIN" | "MEMBER" };
    const actor = ctx.workspace!;
    if (body.role === "OWNER" && actor.role !== "OWNER") {
      throw new AppError("Only the workspace owner can invite owners", 403, "FORBIDDEN");
    }
    await inviteMember(ctx.user.id, actor, { email: body.email, role: body.role });
    await audit({
      workspaceId: actor.id,
      actorUserId: ctx.user.id,
      action: "member.invited",
      entityType: "invite",
      entityId: actor.id,
      meta: { email: body.email, role: body.role },
      ip: ctx.clientIp,
      userAgent: ctx.req.headers.get("user-agent"),
    });
    return json({ ok: true }, 201);
  },
});