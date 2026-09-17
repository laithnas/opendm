import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { rewriteMessage, generateCampaign, automationSuggestions, analyticsInsight, classifyMessage, type RewriteTone } from "@/modules/ai/features";
import { isAIEnabled } from "@/modules/ai/provider";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";

export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const recent = await prisma.aIUsage.findMany({
      where: { workspaceId: ctx.workspace!.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    return json({ enabled: isAIEnabled(), provider: process.env.AI_PROVIDER ?? null, recent });
  },
});

export const POST = apiRoute({
  workspace: true,
  schema: z.object({
    feature: z.enum(["rewrite", "campaign", "suggest", "insight", "classify"]),
    text: z.string().max(4000).optional(),
    tone: z.enum(["shorter", "friendlier", "professional", "higher-conversion", "creator"]).optional(),
    situation: z.string().max(4000).optional(),
    metrics: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (ctx) => {
    const body = ctx.body as {
      feature: "rewrite" | "campaign" | "suggest" | "insight" | "classify";
      text?: string;
      tone?: RewriteTone;
      situation?: string;
      metrics?: Record<string, unknown>;
    };
    try {
      switch (body.feature) {
        case "rewrite": {
          if (!body.text) throw new AppError("text is required", 422, "VALIDATION_ERROR");
          const result = await rewriteMessage({
            workspaceId: ctx.workspace!.workspaceId,
            userId: ctx.user.id,
            text: body.text,
            tone: body.tone ?? "shorter",
          });
          return json(result);
        }
        case "campaign": {
          if (!body.situation) throw new AppError("situation is required", 422, "VALIDATION_ERROR");
          const result = await generateCampaign({
            workspaceId: ctx.workspace!.workspaceId,
            userId: ctx.user.id,
            situation: body.situation,
          });
          return json(result);
        }
        case "suggest": {
          const count = await prisma.automation.count({ where: { workspaceId: ctx.workspace!.workspaceId } });
          const result = await automationSuggestions({
            workspaceId: ctx.workspace!.workspaceId,
            userId: ctx.user.id,
            context: { automationCount: count },
          });
          return json({ suggestions: result });
        }
        case "insight": {
          const result = await analyticsInsight({
            workspaceId: ctx.workspace!.workspaceId,
            userId: ctx.user.id,
            metrics: body.metrics ?? {},
          });
          return json({ insight: result });
        }
        case "classify": {
          if (!body.text) throw new AppError("text is required", 422, "VALIDATION_ERROR");
          const result = await classifyMessage({ workspaceId: ctx.workspace!.workspaceId, userId: ctx.user.id, text: body.text });
          return json(result);
        }
      }
    } catch (err) {
      log.warn("ai feature failed", { feature: body.feature, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
    return json({ error: "Unsupported feature" }, 422);
  },
});