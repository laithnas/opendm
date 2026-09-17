import { prisma } from "@/lib/db";
import { withContext, log } from "@/lib/logger";

// Append-only audit trail. Never stores secrets; meta is deliberately small.

export async function audit(
  input: {
    workspaceId: string;
    actorUserId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    meta?: Record<string, unknown>;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  const { workspaceId, actorUserId, action, entityType, entityId, meta, ip, userAgent } = input;
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId,
        actorUserId: actorUserId ?? null,
        action,
        entityType,
        entityId,
        meta: (meta ?? {}) as object,
        ip: ip ?? undefined,
        userAgent: userAgent?.slice(0, 512) ?? undefined,
      },
    });
  } catch (err) {
    // Audit must never break the primary operation.
    log.error("audit write failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

export function auditForRequest(ctx: { workspace: { workspaceId: string }; user: { id: string }; clientIp: string | null; req: { headers: Headers } }) {
  return (action: string, entityType?: string, entityId?: string, meta?: Record<string, unknown>) =>
    audit({
      workspaceId: ctx.workspace.workspaceId,
      actorUserId: ctx.user.id,
      action,
      entityType,
      entityId,
      meta,
      ip: ctx.clientIp,
      userAgent: ctx.req.headers.get("user-agent"),
    });
}

export async function listAuditLogs(workspaceId: string, limit = 50) {
  return prisma.auditLog.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}