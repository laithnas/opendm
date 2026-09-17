import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";

// Automation dry-run "Test": evaluates conditions against a simulated event
// and reports what WOULD happen — with no provider calls, no sends.
// Live provider availability is checked, messaging window is simulated.

const testSchema = z
  .object({
    text: z.string().min(1).max(1000),
    isFollower: z.boolean().nullable().optional(),
    insideWindow: z.boolean().optional().default(true),
    mediaId: z.string().nullable().optional(),
  })
  .strict();

export const POST = apiRoute({
  workspace: true,
  schema: testSchema,
  handler: async (ctx) => {
    const body = ctx.body as z.infer<typeof testSchema>;
    const automation = await prisma.automation.findFirst({
      where: { id: ctx.params.automationId!, workspaceId: ctx.workspace!.workspaceId, archivedAt: null },
      include: { conditions: true, actions: { orderBy: { order: "asc" } } },
    });
    if (!automation) return json({ error: "Automation not found" }, 404);

    const connection = await prisma.socialConnection.findFirst({
      where: { workspaceId: ctx.workspace!.workspaceId, status: "ACTIVE", provider: "INSTAGRAM" },
    });

    const event = {
      provider: "instagram",
      kind: automation.triggerType,
      providerEventId: `test-run-${Date.now()}`,
      text: body.text,
      contact: { externalId: "test-user", username: "test.user" },
      mediaId: body.mediaId ?? null,
      commentId: "test-comment",
      conversationExternalId: null,
      occurredAt: new Date().toISOString(),
      raw: {},
    } as const;

    const { evaluateConditions } = await import("@/modules/engine/conditions");
    const { renderTemplate } = await import("@/modules/engine/render");

    const verdict = evaluateConditions(
      { conditions: automation.conditions, triggerConfig: (automation.triggerConfig ?? {}) as Record<string, unknown> },
      { event, isFollower: body.isFollower ?? null },
    );

    const steps = automation.actions
      .filter((a) => a.enabled)
      .map((a) => {
        const cfg = (a.config ?? {}) as Record<string, unknown>;
        const text = String(cfg.text ?? "");
        const preview = renderTemplate(text.slice(0, 140), {
          username: "test.user",
          comment: body.text,
          keyword: verdict.keyword,
          link: `https://app.example/l/demo-xyz`,
        });
        return {
          kind: a.kind,
          order: a.order,
          delayMs: a.delayMs,
          preview: preview || cfg.tag || String(cfg.url ?? "") || `${cfg.ms ?? 0}ms`,
        };
      });

    const dmActions = steps.filter((s) => s.kind === "SEND_DM" || s.kind === "SEND_LINK");
    const windowNote =
      dmActions.length && !body.insideWindow
        ? "DM actions would be SKIPPED: outside the 7-day messaging window (Instagram rule)."
        : null;

    log.info("automation tested", { automationId: automation.id, pass: verdict.pass, reason: verdict.reason });
    return json({
      pass: verdict.pass,
      reason: verdict.reason ?? null,
      matchedKeyword: verdict.keyword,
      steps,
      checks: [
        { label: "Trigger conditions", ok: verdict.pass, detail: verdict.reason ?? "all conditions met" },
        { label: "Connected Instagram account", ok: Boolean(connection), detail: connection ? `@${connection.username}` : "no active connection — attach one to send for real" },
        ...(windowNote ? [{ label: "Messaging window", ok: false, detail: windowNote }] : []),
      ],
    });
  },
});