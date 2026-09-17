import { apiRoute, json } from "@/lib/api";
import { listAuditLogs } from "@/modules/audit/service";

export const GET = apiRoute({
  workspace: true,
  roles: ["OWNER", "ADMIN"],
  handler: async (ctx) => {
    const logs = await listAuditLogs(ctx.workspace!.workspaceId, 100);
    return json({ logs });
  },
});