import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { dashboardMetrics, activitySeries, topAutomations, topKeywords, conversionFunnel, accountHealth, parseDateRange, failedExecutions } from "@/modules/analytics/service";

const rangeSchema = z.object({ from: z.string().nullish(), to: z.string().nullish() });

export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const { from, to } = rangeSchema.parse({
      from: ctx.req.nextUrl.searchParams.get("from"),
      to: ctx.req.nextUrl.searchParams.get("to"),
    });
    const range = parseDateRange(from, to);
    const [metrics, series, automations, keywords, funnel, health, failures] = await Promise.all([
      dashboardMetrics(ctx.workspace!.workspaceId, range),
      activitySeries(ctx.workspace!.workspaceId, range),
      topAutomations(ctx.workspace!.workspaceId, range),
      topKeywords(ctx.workspace!.workspaceId, range),
      conversionFunnel(ctx.workspace!.workspaceId, range),
      accountHealth(ctx.workspace!.workspaceId),
      failedExecutions(ctx.workspace!.workspaceId, range),
    ]);
    return json({ metrics, series, automations, keywords, funnel, health, failures });
  },
});