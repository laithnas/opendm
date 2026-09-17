import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// Analytics. Everything derives from real execution/message/click rows — no
// synthetic counters, no fake data. Empty states are honest.

export interface DateRange {
  from: Date;
  to: Date;
}

export function parseDateRange(fromRaw?: string | null, toRaw?: string | null, days = 30): DateRange {
  const to = toRaw ? new Date(toRaw) : new Date();
  const from = fromRaw
    ? new Date(fromRaw)
    : new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

export async function dashboardMetrics(workspaceId: string, range: DateRange) {
  const { from, to } = range;
  const whereExec: Prisma.ExecutionWhereInput = { workspaceId, createdAt: { gte: from, lte: to } };

  const [execStatuses, dmsSent, dmsFailed, clicksTotal, uniqueClicks, commentInteractions, conversations] =
    await Promise.all([
      prisma.execution.groupBy({ by: ["status"], where: whereExec, _count: { _all: true } }),
      prisma.message.count({
        where: { workspaceId, direction: "OUTBOUND", status: { in: ["SENT", "DELIVERED"] }, createdAt: { gte: from, lte: to } },
      }),
      prisma.message.count({
        where: { workspaceId, direction: "OUTBOUND", status: "FAILED", createdAt: { gte: from, lte: to } },
      }),
      prisma.linkClick.count({ where: { workspaceId, createdAt: { gte: from, lte: to } } }),
      uniqueClickCount(workspaceId, from, to),
      prisma.interaction.count({ where: { workspaceId, kind: { in: ["COMMENT", "STORY_REPLY"] }, occurredAt: { gte: from, lte: to } } }),
      prisma.conversation.count({ where: { workspaceId } }),
    ]);

  const totalExec = execStatuses.reduce((acc, s) => acc + s._count._all, 0);
  const completedExec = execStatuses.find((s) => s.status === "COMPLETED")?._count._all ?? 0;
  const skippedExec = execStatuses.find((s) => s.status === "SKIPPED")?._count._all ?? 0;
  const failedExec = execStatuses.find((s) => s.status === "FAILED")?._count._all ?? 0;
  const partialExec = execStatuses.find((s) => s.status === "PARTIALLY_COMPLETED")?._count._all ?? 0;

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    executions: {
      total: totalExec,
      completed: completedExec,
      skipped: skippedExec,
      failed: failedExec,
      partial: partialExec,
    },
    messages: {
      sent: dmsSent,
      failed: dmsFailed,
      deliveryRate: dmsSent + dmsFailed > 0 ? dmsSent / (dmsSent + dmsFailed) : null,
    },
    links: {
      clicks: clicksTotal,
      uniqueClicks,
      ctr: dmsSent > 0 ? clicksTotal / dmsSent : null,
    },
    comments: commentInteractions,
    conversations,
  };
}

async function uniqueClickCount(workspaceId: string, from: Date, to: Date): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT "uniqueKey")::bigint AS n
    FROM "LinkClick"
    WHERE "workspaceId" = ${workspaceId}
      AND "createdAt" >= ${from} AND "createdAt" <= ${to}
  `;
  return Number(rows[0]?.n ?? 0);
}

export async function activitySeries(workspaceId: string, range: DateRange) {
  const { from, to } = range;
  const rows = await prisma.$queryRaw<{ day: Date; kind: string; n: bigint }[]>`
      SELECT
        DATE_TRUNC('day', "createdAt")::date AS day,
        'execution' AS kind,
        COUNT(*)::bigint AS n
      FROM "Execution"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY 1
      UNION ALL
      SELECT
        DATE_TRUNC('day', "createdAt")::date AS day,
        'dm_sent' AS kind,
        COUNT(*)::bigint AS n
      FROM "Message"
      WHERE "workspaceId" = ${workspaceId} AND direction = 'OUTBOUND'
        AND "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY 1
      UNION ALL
      SELECT
        DATE_TRUNC('day', "createdAt")::date AS day,
        'click' AS kind,
        COUNT(*)::bigint AS n
      FROM "LinkClick"
      WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY 1
      ORDER BY day ASC
    `; 
  // BigInt is not JSON-serializable — normalize before it reaches the API.
  return (rows ?? []).map((r) => ({ day: r.day, kind: r.kind, n: Number(r.n) }));
}

export async function topAutomations(workspaceId: string, range: DateRange, limit = 5) {
  const { from, to } = range;
  const rows = await prisma.$queryRaw<
    { automationId: string; name: string; executions: bigint; completed: bigint; clicks: bigint }[]
  >`
    SELECT
      a.id AS "automationId", a.name AS name,
      COUNT(DISTINCT e.id)::bigint AS executions,
      COUNT(DISTINCT CASE WHEN e.status = 'COMPLETED' THEN e.id END)::bigint AS completed,
      (SELECT COUNT(*)::bigint FROM "LinkClick" lc WHERE lc."workspaceId" = ${workspaceId}
        AND lc."createdAt" >= ${from} AND lc."createdAt" <= ${to}
        AND lc."linkId" IN (SELECT id FROM "TrackedLink" tl WHERE tl."automationId" = a.id)) AS clicks
    FROM "Automation" a
    LEFT JOIN "Execution" e ON e."automationId" = a.id AND e."workspaceId" = ${workspaceId}
      AND e."createdAt" >= ${from} AND e."createdAt" <= ${to}
    WHERE a."workspaceId" = ${workspaceId} AND a."archivedAt" IS NULL
    GROUP BY a.id
    HAVING COUNT(e.id) > 0
    ORDER BY executions DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    automationId: r.automationId,
    name: r.name,
    executions: Number(r.executions),
    completed: Number(r.completed),
    clicks: Number(r.clicks),
    conversion: Number(r.executions) > 0 ? Number(r.completed) / Number(r.executions) : 0,
  }));
}

export async function topKeywords(workspaceId: string, range: DateRange, limit = 6) {
  const { from, to } = range;
  const rows = await prisma.$queryRaw<{ keyword: string; n: bigint }[]>`
    SELECT payload->>'matchedKeyword' AS keyword, COUNT(*)::bigint AS n
    FROM "Interaction"
    WHERE "workspaceId" = ${workspaceId}
      AND payload->>'matchedKeyword' IS NOT NULL
      AND "occurredAt" >= ${from} AND "occurredAt" <= ${to}
    GROUP BY 1
    ORDER BY n DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ keyword: r.keyword, count: Number(r.n) }));
}

export async function conversionFunnel(workspaceId: string, range: DateRange) {
  const { from, to } = range;
  const [comments, dmsSent, clicks] = await Promise.all([
    prisma.interaction.count({
      where: { workspaceId, kind: { in: ["COMMENT", "STORY_REPLY"] }, occurredAt: { gte: from, lte: to } },
    }),
    prisma.message.count({
      where: { workspaceId, direction: "OUTBOUND", status: { in: ["SENT", "DELIVERED"] }, createdAt: { gte: from, lte: to } },
    }),
    prisma.linkClick.count({ where: { workspaceId, createdAt: { gte: from, lte: to } } }),
  ]);
  return {
    comments,
    dmsSent,
    clicks,
    commentToDm: comments > 0 ? dmsSent / comments : null,
    dmToClick: dmsSent > 0 ? clicks / dmsSent : null,
  };
}

export async function accountHealth(workspaceId: string) {
  const connections = await prisma.socialConnection.findMany({
    where: { workspaceId },
    select: { id: true, provider: true, username: true, displayName: true, status: true, lastCheckedAt: true, lastError: true, tokenExpiresAt: true },
  });
  const byStatus = connections.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  return { connections, byStatus };
}

export async function failedExecutions(workspaceId: string, range: DateRange, limit = 10) {
  return prisma.execution.findMany({
    where: { workspaceId, status: { in: ["FAILED", "PARTIALLY_COMPLETED"] }, createdAt: { gte: range.from, lte: range.to } },
    include: { automation: { select: { name: true } }, steps: { where: { status: "FAILED" }, select: { label: true, error: true, actionType: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}