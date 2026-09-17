import { apiRoute, json } from "@/lib/api";
import { acceptInvite } from "@/modules/workspaces/access";
import { setWorkspaceCookie } from "@/auth/session";

// POST /api/invites/:token — accept an invitation as the signed-in user.
export const POST = apiRoute({
  handler: async (ctx) => {
    const { workspaceId } = await acceptInvite(ctx.params.token!, ctx.user.id);
    setWorkspaceCookie(workspaceId);
    return json({ workspaceId });
  },
});