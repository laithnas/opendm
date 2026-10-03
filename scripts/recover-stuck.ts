// Replays automations that failed while the Instagram connection was broken.
//   npx tsx scripts/recover-stuck.ts --since 2026-10-02T13:17:00Z          (dry run, prints the plan)
//   npx tsx scripts/recover-stuck.ts --since 2026-10-02T13:17:00Z --send   (actually sends)
//
// A) People who tapped "Yes! Send It" / "I Followed" (or typed yes/send) and got
//    nothing: their follow gate is advanced one step, exactly as if the tap had
//    worked. Only if Instagram's 24-hour messaging window is still open.
// B) Comments whose automation failed: the failed run is retired and the
//    comment is re-run through the normal backfill (private replies are allowed
//    for 7 days after a comment).
import { prisma } from "@/lib/db";
import { advanceFollowGate } from "@/modules/followgate/service";
import { backfillComments } from "@/modules/automations/backfill";
import { windowVerdictFor } from "@/modules/engine/execute";

const args = process.argv.slice(2);
const SEND = args.includes("--send");
const sinceArg = args[args.indexOf("--since") + 1];
if (!args.includes("--since") || !sinceArg) throw new Error("pass --since <ISO time the outage started>");
const SINCE = new Date(sinceArg);
const YES = /yes|send|follow/i;

async function partA() {
  const runs = await prisma.followGateRun.findMany({
    where: { step: { lt: 2 } },
    include: { contact: true, socialConnection: true },
    orderBy: { createdAt: "desc" },
  });
  const seenContacts = new Set<string>();
  let advanced = 0, skippedWindow = 0, skippedText = 0;
  for (const run of runs) {
    if (seenContacts.has(run.contactId)) continue; // only the person's latest open run
    const tap = await prisma.message.findFirst({
      where: { contactId: run.contactId, direction: "INBOUND" as never, createdAt: { gte: SINCE } },
      orderBy: { createdAt: "desc" },
    });
    if (!tap) continue;
    seenContacts.add(run.contactId);
    // Skip people already moved on after the tap (e.g. handled manually).
    const outboundAfter = await prisma.message.count({
      where: { contactId: run.contactId, direction: "OUTBOUND" as never, status: "SENT" as never, createdAt: { gt: tap.createdAt } },
    });
    if (outboundAfter > 0) continue;
    const who = `@${run.contact.username ?? run.contact.externalId} (step ${run.step}, said "${tap.content.slice(0, 30)}")`;
    if (!YES.test(tap.content) && tap.content !== "(tapped a button)") {
      skippedText++;
      console.log("  skip (not a yes):", who);
      continue;
    }
    const conv = await prisma.conversation.findFirst({ where: { contactId: run.contactId }, orderBy: { lastInboundAt: "desc" } });
    const verdict = windowVerdictFor(conv?.lastInboundAt);
    if (!verdict.allowed) {
      skippedWindow++;
      console.log("  skip (24h window closed):", who);
      continue;
    }
    console.log(SEND ? "  sending next step:" : "  would send next step:", who);
    if (!SEND) { advanced++; continue; }
    await advanceFollowGate(
      {
        provider: "instagram",
        kind: "DM",
        providerEventId: `recovery-${run.id}-${run.step}`,
        text: "(recovered tap)",
        contact: { externalId: run.contact.externalId, username: run.contact.username ?? undefined },
        conversationExternalId: conv?.externalId ?? null,
        buttonPayload: run.pendingButtonPayload,
        occurredAt: tap.createdAt.toISOString(), // the real tap time: never extends the window
        raw: { recovery: true },
      },
      run.socialConnection,
    );
    const after = await prisma.followGateRun.findUnique({ where: { id: run.id }, select: { step: true } });
    if (after && after.step > run.step) advanced++;
    else console.log("    did not advance (check worker log)");
  }
  console.log(`A) follow gates: ${advanced} ${SEND ? "advanced" : "to advance"}, ${skippedWindow} past the 24h window, ${skippedText} not a yes`);
}

async function partB() {
  const failed = await prisma.execution.findMany({
    where: { createdAt: { gte: SINCE }, triggerType: "COMMENT", status: { in: ["FAILED", "PARTIALLY_COMPLETED"] as never } },
    select: { id: true, automationId: true, workspaceId: true, providerEventId: true },
  });
  const byAutomation = new Map<string, { workspaceId: string; ids: string[] }>();
  for (const f of failed) {
    if (!f.automationId) continue;
    const e = byAutomation.get(f.automationId) ?? { workspaceId: f.workspaceId, ids: [] };
    e.ids.push(f.id);
    byAutomation.set(f.automationId, e);
  }
  console.log(`B) ${failed.length} failed comment runs across ${byAutomation.size} automations`);
  for (const [automationId, { workspaceId, ids }] of byAutomation) {
    const a = await prisma.automation.findUnique({ where: { id: automationId }, select: { name: true, triggerConfig: true, status: true } });
    const media = (a?.triggerConfig as { postRef?: string } | null)?.postRef ?? undefined;
    console.log(`  ${a?.name} (${a?.status}): ${ids.length} failed`);
    if (!SEND || a?.status !== "ACTIVE") continue;
    // Retire the failed runs so the backfill treats those comments as new.
    for (const id of ids) {
      const ex = await prisma.execution.findUnique({ where: { id }, select: { providerEventId: true } });
      await prisma.execution.update({
        where: { id },
        data: { status: "FAILED" as never, providerEventId: `${ex?.providerEventId}:retired-${Date.now()}` },
      });
    }
    const r = await backfillComments({ workspaceId, automationId, dryRun: false, mediaId: media });
    console.log("    re-queued:", JSON.stringify({ ...r, posts: undefined }));
  }
}

async function main() {
  console.log(SEND ? "SENDING" : "DRY RUN (add --send to send)", "· outage since", SINCE.toISOString());
  await partA();
  await partB();
}

main()
  .catch((e) => console.error(String(e).slice(0, 800)))
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
