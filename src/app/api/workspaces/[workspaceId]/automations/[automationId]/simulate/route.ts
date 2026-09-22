import { apiRoute, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { queues } from "@/lib/queue";

// POST /api/workspaces/:workspaceId/automations/:automationId/simulate
// Fires a REAL simulated event scoped to this automation: the event travels
// through the ingest queue and worker and produces a live, observable
// execution (the "money shot" of the demo). Only the targeted automation
// runs — no other automations are triggered by the sample event.

const TRIGGER_REPLACEMENTS: Record<string, [string, string]> = {
  COMMENT: ["GUIDE", "comment"],
  DM: ["hi, what's your pricing?", "dm"],
  STORY_REPLY: ["YES", "story reply"],
};

export const POST = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const automationId = ctx.params.automationId!;
    const workspaceId = ctx.workspace!.workspaceId;

    const automation = await prisma.automation.findFirst({
      where: { id: automationId, workspaceId },
      select: { id: true, name: true, triggerType: true, status: true },
    });
    if (!automation) {
      return json({ error: "Automation not found" }, 404);
    }
    if (automation.status === "ARCHIVED") {
      return json({ error: "Archived automations cannot be simulated", code: "ARCHIVED" }, 400);
    }

    const [text, kindLabel] = TRIGGER_REPLACEMENTS[automation.triggerType] ?? ["GUIDE", "event"];
    const username = `demo.sim-${Math.random().toString(36).slice(2, 7)}`;
    const eventId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await queues.ingest.add(
      "ingest-instagram-payload",
      {
        provider: "instagram",
        workspaceId,
        onlyAutomationId: automation.id,
        payload: {
          events: [
            {
              provider: "instagram",
              kind: automation.triggerType,
              eventId,
              providerEventId: `sim.${eventId}`,
              text,
              username,
              contact: { externalId: `ig-${username}`, username, name: null },
              commentId: automation.triggerType === "COMMENT" ? `sim-comment-${eventId}` : null,
              mediaId: automation.triggerType === "COMMENT" ? `sim-media-${eventId}` : null,
              mediaCaption: text,
              occurredAt: new Date().toISOString(),
            },
          ],
        },
      },
      { jobId: `sim-${eventId}`, removeOnComplete: 200, removeOnFail: 200 },
    );

    return json({
      ok: true,
      eventId,
      automation: { id: automation.id, name: automation.name, triggerType: automation.triggerType },
      username,
      note: `Simulated ${kindLabel} queued. Watch it run live.`,
    });
  },
});