import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "../../vitest.setup";
import { createWorkspace } from "@/modules/workspaces/access";
import { createAutomation, setAutomationStatus } from "@/modules/automations/service";
import { encryptSecret } from "@/lib/crypto";
import type { IngestJobData } from "@/lib/queue";

// This exercises runAutomationsForEvent, which enqueues follow-up work via
// @/lib/queue's real BullMQ client (backed by production Upstash Redis per
// .env) — mock it so this test only ever writes to the disposable test
// Postgres database and never touches production Redis or wakes the real
// worker on scheduled/live executions it can't find in its own DB.
vi.mock("@/lib/queue", () => ({
  queues: {
    ingest: { add: vi.fn() },
    execute: { add: vi.fn() },
    actions: { add: vi.fn() },
    webhooks: { add: vi.fn() },
  },
}));

const { processIngestJob } = await import("@/worker/ingest");
// runAutomationsForEvent only enqueues an "automation-execute" job here — the
// Execution row itself is created later, inside the worker process that
// consumes that queue (createAndRunExecution), which this test never runs.
// So the observable signal at this layer is the queue call, not a DB row.
const { queues } = await import("@/lib/queue");

// Regression: Meta redelivers the connected account's own new comments
// (including replies PUBLIC_REPLY itself just posted) as ordinary "comments"
// webhook events — Meta has no is_echo-style flag for comments the way it
// does for messages. Left unfiltered, a comment automation triggers on its
// own reply, tries to reply to a reply (Instagram rejects that), and sends a
// Follow Gate DM to the account itself. See src/worker/ingest.ts.

// Unique per test run — this file does NOT call resetDb(): the disposable
// test database is shared across test files running in parallel forks (only
// integration.test.ts owns truncating it), so unique ids here avoid both
// collisions with concurrently-running files and unique-constraint failures
// on a rerun against leftover data from a previous run.
const RUN_ID = `${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
const ACCOUNT_ID = `1${RUN_ID}`;
const MEDIA_ID = `2${RUN_ID}`;

let workspaceId: string;
let userId: string;

function commentPayload(fromId: string, fromUsername: string, commentId: string) {
  return {
    object: "instagram",
    entry: [
      {
        id: ACCOUNT_ID,
        changes: [
          {
            field: "comments",
            value: {
              id: commentId,
              text: "GUIDE",
              from: { id: fromId, username: fromUsername },
              media: { id: MEDIA_ID, media_product_type: "REELS" },
              timestamp: Math.floor(Date.now() / 1000),
            },
          },
        ],
      },
    ],
  };
}

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `ingest-test-${RUN_ID}@test.local`, emailVerifiedAt: new Date() } });
  userId = user.id;
  workspaceId = (await createWorkspace(userId, { name: "Ingest Test Studio" })).workspaceId;

  await prisma.socialConnection.create({
    data: {
      workspaceId,
      connectedByUserId: userId,
      provider: "INSTAGRAM",
      externalAccountId: ACCOUNT_ID,
      username: "leonyxai",
      accessTokenEnc: encryptSecret("fake-token"),
      status: "ACTIVE",
    },
  });

  const automation = await createAutomation(workspaceId, userId, {
    name: "GUIDE flow",
    description: null,
    triggerType: "COMMENT",
    triggerConfig: { postRef: MEDIA_ID, matchAnyPost: false },
    conditions: [],
    actions: [{ kind: "PUBLIC_REPLY", config: { text: "Sent 👊" }, order: 0, enabled: true, delayMs: 0 }],
  });
  await setAutomationStatus(workspaceId, automation.id, "ACTIVE");
});

afterAll(async () => {
  // Clean up only this file's own rows — never resetDb() here, since the
  // test database is shared with files running concurrently in other forks
  // (see the RUN_ID comment above).
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("ingest: self-authored events", () => {
  it("does not schedule an execution for a comment from the connected account itself", async () => {
    const job: IngestJobData = {
      provider: "instagram",
      receivedAt: new Date().toISOString(),
      payload: commentPayload(ACCOUNT_ID, "leonyxai", "own-reply-comment-1"),
    };
    const result = await processIngestJob(job);
    expect(result.scheduled).toBe(0);
    expect(queues.execute.add).not.toHaveBeenCalled();
  });

  it("still schedules an execution for a real commenter", async () => {
    const job: IngestJobData = {
      provider: "instagram",
      receivedAt: new Date().toISOString(),
      payload: commentPayload("999888777", "a_real_commenter", "real-comment-1"),
    };
    const result = await processIngestJob(job);
    expect(result.scheduled).toBe(1);
    expect(queues.execute.add).toHaveBeenCalledTimes(1);
  });
});
