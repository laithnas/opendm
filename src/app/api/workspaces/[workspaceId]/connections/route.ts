import { apiRoute, json } from "@/lib/api";
import { requireWorkspaceRole } from "@/modules/workspaces/access";
import { listConnections, connectDemoInstagram, revokeConnection, checkConnectionHealth } from "@/modules/providers/connections";
import { instagramOAuthUrl } from "@/modules/providers/connections";
import { env } from "@/lib/env";
import { audit } from "@/modules/audit/service";

export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const connections = await listConnections(ctx.workspace!.workspaceId);
    return json({ connections });
  },
});

// POST {action: "demo"} — connect the mock account (demo mode / dev only).
export const POST = apiRoute({
  workspace: true,
  roles: ["OWNER", "ADMIN"],
  handler: async (ctx) => {
    const { action } = (ctx.body ?? {}) as { action?: string };
    if (action === "demo") {
      const allowed = env.NODE_ENV === "development" || process.env.DEMO_MODE === "true";
      if (!allowed) return json({ error: "Demo connections are disabled" }, 404);
      const connection = await connectDemoInstagram(ctx.workspace!.workspaceId, ctx.user.id);
      await audit({
        workspaceId: ctx.workspace!.workspaceId,
        actorUserId: ctx.user.id,
        action: "connection.added",
        entityType: "connection",
        entityId: connection.id,
        meta: { provider: "instagram", demo: true },
        ip: ctx.clientIp,
      });
      return json({ connection }, 201);
    }
    // OAuth flow — build the redirect URL (throws when META_APP_ID missing).
    const url = instagramOAuthUrl(ctx.workspace!.workspaceId, ctx.user.id);
    return json({ oauthUrl: url });
  },
});