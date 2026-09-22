import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { queues } from "@/lib/queue";
import { AppError, NotFoundError } from "@/lib/errors";
import { getSocialProvider } from "@/modules/providers/registry";
import { evaluateConditions } from "@/modules/engine/conditions";
import { providerCtx } from "@/modules/engine/execute";
import type { NormalizedEvent, ProviderComment, ProviderMedia } from "@/modules/providers/types";

// Backfill: run a COMMENT automation over comments that already exist on the
// connected account's posts and reels (e.g. comments that arrived before the
// automation was created, or while the app was offline).
//
// Safety properties:
//   - comments the account already answered publicly are skipped
//   - comments that don't pass the automation's own trigger/conditions are
//     skipped up front, so no pile of empty SKIPPED executions
//   - executions are idempotent per (comment id, automation): running the
//     backfill twice never double-sends
//   - everything is enqueued through the normal ingest → engine → action path
//
// Instagram only allows a private reply (DM) to a comment for 7 days after it
// was posted. Older comments can still get the public reply step but the DM
// step will be rejected by Meta and shows up as a failed step.

const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface BackfillOptions {
  workspaceId: string;
  automationId: string;
  /** Count matching comments without enqueueing anything. */
  dryRun?: boolean;
  /** Only comments newer than this many days (default: no age limit). */
  maxAgeDays?: number;
  /** Only this post; default = the automation's selected post, else recent posts. */
  mediaId?: string;
  maxPosts?: number;
  maxCommentsPerPost?: number;
}

export interface BackfillPostSummary {
  mediaId: string;
  caption: string | null;
  permalink: string | null;
  scanned: number;
  eligible: number;
}

export interface BackfillResult {
  dryRun: boolean;
  postsScanned: number;
  commentsScanned: number;
  alreadyReplied: number;
  notMatching: number;
  alreadyProcessed: number;
  eligible: number;
  /** Eligible comments still inside Instagram's 7-day private-reply window. */
  eligibleDmable: number;
  queued: number;
  posts: BackfillPostSummary[];
}

export async function backfillComments(opts: BackfillOptions): Promise<BackfillResult> {
  const automation = await prisma.automation.findFirst({
    where: { id: opts.automationId, workspaceId: opts.workspaceId, archivedAt: null },
    include: { conditions: true },
  });
  if (!automation) throw new NotFoundError("Automation not found");
  if (automation.triggerType !== "COMMENT") {
    throw new AppError("Only comment automations can run on existing comments", 400, "NOT_COMMENT_TRIGGER");
  }
  if (automation.status !== "ACTIVE") {
    throw new AppError("Activate the automation before running it on existing comments", 400, "NOT_ACTIVE");
  }

  const connection = await prisma.socialConnection.findFirst({
    where: { workspaceId: opts.workspaceId, provider: "INSTAGRAM", status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!connection) throw new AppError("Connect an Instagram account first", 400, "NO_CONNECTION");

  const provider = getSocialProvider("instagram");
  if (!provider.listMedia || !provider.listComments) {
    throw new AppError("This provider cannot list existing comments", 400, "UNSUPPORTED");
  }
  const ctx = providerCtx(connection);
  if (ctx.accessToken === "demo-token") {
    throw new AppError("Running on existing comments needs a real connected Instagram account (demo connection has no posts).", 400, "DEMO_CONNECTION");
  }

  const triggerConfig = (automation.triggerConfig ?? {}) as Record<string, unknown>;
  const postRef = typeof triggerConfig.postRef === "string" && triggerConfig.postRef ? triggerConfig.postRef : null;
  const selectedPost = triggerConfig.matchAnyPost === false ? postRef : null;
  const wantedMedia = opts.mediaId ?? selectedPost;

  // 1. Which posts to scan.
  const maxPosts = Math.min(Math.max(opts.maxPosts ?? 25, 1), 100);
  let posts: ProviderMedia[] = await provider.listMedia(ctx, { limit: wantedMedia ? 100 : maxPosts });
  if (wantedMedia) {
    const hit = posts.filter((m) => m.id === wantedMedia || (m.permalink ?? "").includes(wantedMedia));
    posts = hit.length ? hit : /^\d+$/.test(wantedMedia) ? [{ id: wantedMedia }] : [];
  }

  const cutoff = opts.maxAgeDays ? Date.now() - opts.maxAgeDays * 24 * 60 * 60 * 1000 : null;
  const maxComments = Math.min(Math.max(opts.maxCommentsPerPost ?? 200, 1), 1000);
  const result: BackfillResult = {
    dryRun: Boolean(opts.dryRun),
    postsScanned: 0,
    commentsScanned: 0,
    alreadyReplied: 0,
    notMatching: 0,
    alreadyProcessed: 0,
    eligible: 0,
    eligibleDmable: 0,
    queued: 0,
    posts: [],
  };

  const accountId = connection.externalAccountId;
  const now = Date.now();

  for (const media of posts) {
    const comments: ProviderComment[] = await provider.listComments(ctx, media.id, { limit: maxComments });
    result.postsScanned++;
    const summary: BackfillPostSummary = {
      mediaId: media.id,
      caption: media.caption ?? null,
      permalink: media.permalink ?? null,
      scanned: comments.length,
      eligible: 0,
    };
    result.commentsScanned += comments.length;

    // Drop what we can decide without the database.
    const candidates: { comment: ProviderComment; event: NormalizedEvent }[] = [];
    for (const c of comments) {
      if (c.fromId === accountId) continue; // the account's own comment
      const ts = c.timestamp ? Date.parse(c.timestamp) : NaN;
      if (cutoff && Number.isFinite(ts) && ts < cutoff) continue;
      if (c.repliedByOwner) {
        result.alreadyReplied++;
        continue;
      }
      const event: NormalizedEvent = {
        provider: "instagram",
        kind: "COMMENT",
        providerEventId: c.id,
        text: c.text,
        contact: { externalId: c.fromId ?? c.id, username: c.username },
        mediaId: media.id,
        commentId: c.id,
        // Age matters to Meta (7-day private-reply window), so keep the real time.
        occurredAt: Number.isFinite(ts) ? new Date(ts).toISOString() : new Date().toISOString(),
        raw: { backfill: true, id: c.id, media_id: media.id, text: c.text, from: { id: c.fromId, username: c.username } },
      };
      const verdict = evaluateConditions({ conditions: automation.conditions, triggerConfig }, { event });
      if (!verdict.pass) {
        result.notMatching++;
        continue;
      }
      candidates.push({ comment: c, event });
    }
    if (!candidates.length) {
      result.posts.push(summary);
      continue;
    }

    // Idempotency: skip comments this automation already handled.
    const keys = candidates.map((x) => `${x.event.providerEventId}:${automation.id}`);
    const done = await prisma.execution.findMany({
      where: { provider: "INSTAGRAM", providerEventId: { in: keys } },
      select: { providerEventId: true },
    });
    const doneSet = new Set(done.map((d) => d.providerEventId));

    const fresh = candidates.filter((x) => {
      if (doneSet.has(`${x.event.providerEventId}:${automation.id}`)) {
        result.alreadyProcessed++;
        return false;
      }
      return true;
    });
    summary.eligible = fresh.length;
    result.eligible += fresh.length;
    result.eligibleDmable += fresh.filter((x) => now - Date.parse(x.event.occurredAt) <= PRIVATE_REPLY_WINDOW_MS).length;
    result.posts.push(summary);

    if (opts.dryRun) continue;

    // 2. Hand each comment to the normal pipeline, scoped to this automation.
    for (const { event } of fresh) {
      const commentValue = event.raw as { id: string; media_id: string };
      await queues.ingest.add(
        "ingest-instagram-backfill",
        {
          provider: "instagram",
          workspaceId: opts.workspaceId,
          onlyAutomationId: automation.id,
          receivedAt: new Date().toISOString(),
          payload: {
            object: "instagram",
            entry: [
              {
                id: accountId,
                changes: [
                  {
                    field: "comments",
                    value: {
                      id: commentValue.id,
                      media_id: commentValue.media_id,
                      text: event.text,
                      timestamp: Math.floor(Date.parse(event.occurredAt) / 1000),
                      from: { id: event.contact.externalId, username: event.contact.username },
                    },
                  },
                ],
              },
            ],
          },
        },
        { jobId: `backfill-${automation.id}-${commentValue.id}`, removeOnComplete: 500, removeOnFail: 500 },
      );
      result.queued++;
    }
  }

  log.info("comment backfill", {
    workspaceId: opts.workspaceId,
    automationId: automation.id,
    dryRun: result.dryRun,
    posts: result.postsScanned,
    scanned: result.commentsScanned,
    eligible: result.eligible,
    queued: result.queued,
  });
  return result;
}
