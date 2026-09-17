import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { createWorkspace, listUserWorkspaces } from "@/modules/workspaces/access";
import { setWorkspaceCookie } from "@/auth/session";

export const GET = apiRoute({
  handler: async (ctx) => {
    const workspaces = await listUserWorkspaces(ctx.user.id);
    return json({ workspaces: workspaces.map((m) => ({ ...m.workspace, role: m.role })) });
  },
});

export const POST = apiRoute({
  schema: z.object({ name: z.string().min(1).max(120) }),
  handler: async (ctx) => {
    const { workspaceId } = await createWorkspace(ctx.user.id, { name: (ctx.body as { name: string }).name });
    setWorkspaceCookie(workspaceId);
    return json({ workspaceId }, 201);
  },
});