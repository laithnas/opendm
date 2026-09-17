import { apiRoute, json } from "@/lib/api";
import { z } from "zod";
import { queues, type IngestJobData } from "@/lib/queue";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

// Test-webhook endpoint: simulates a Meta Instagram event for the current
// workspace. Used by the demo "simulate trigger" flow and by E2E tests.
// Deliberately restricted to demo mode + development.

const eventSchema = z
  .object({
    kind: z.enum(["COMMENT", "DM", "STORY_REPLY"]),
    text: z.string().min(1).max(1000),
    username: z.string().max(200).optional(),
    externalUserId: z.string().max(200).optional(),
    mediaId: z.string().max(200).nullable().optional(),
    commentId: z.string().max(200).nullable().optional(),
    isFollower: z.boolean().nullable().optional(),
  })
  .strict();

export const POST = apiRoute({
  workspace: true,
  schema: eventSchema,
  handler: async (ctx) => {
    const { NODE_ENV } = process.env;
    const isDevOrDemo = NODE_ENV === "development" || process.env.DEMO_MODE === "true";
    if (!isDevOrDemo) {
      throw new AppError("Test webhook is disabled outside development/demo mode", 404, "TEST_WEBHOOK_DISABLED");
    }
    const body = ctx.body as z.infer<typeof eventSchema>;
    const wsId = ctx.workspace!.workspaceId;
    const connection = await prisma.socialConnection.findFirst({
      where: { workspaceId: wsId, status: "ACTIVE", provider: "INSTAGRAM" },
      orderBy: { createdAt: "asc" },
    });
    if (!connection) throw new AppError("No connected Instagram account in this workspace", 400, "NO_CONNECTION");

    const eventId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Meta always includes the comment id + media id for comment events.
    const mediaId = body.mediaId ?? (body.kind === "COMMENT" ? `test-media-${eventId}` : null);
    const commentId = body.commentId ?? (body.kind === "COMMENT" ? `test-comment-${eventId}` : null);
    await queues.ingest.add(
      "test",
      {
        provider: "instagram",
        workspaceId: wsId,
        payload: {
          events: [
            {
              provider: "instagram",
              kind: body.kind,
              providerEventId: eventId,
              text: body.text,
              contact: {
                externalId: body.externalUserId ?? `test-user-${Math.random().toString(36).slice(2, 8)}`,
                username: body.username ?? "demo.follower",
                name: null,
              },
              mediaId: mediaId,
              commentId: commentId,
              conversationExternalId: `test-convo-${eventId}`,
              occurredAt: new Date().toISOString(),
              raw: { socialConnectionId: connection.id, isFollower: body.isFollower ?? null },
            },
          ],
        },
        receivedAt: new Date().toISOString(),
      } satisfies IngestJobData,
      { attempts: 3, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 500, removeOnFail: 500 },
    );

    return json({ ok: true, eventId });
  },
});