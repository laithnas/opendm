// Demo seed — populates a fully worked example workspace so the product can
// be demoed without Meta credentials. Every piece of data is explicitly
// marked demo (workspace + user isDemo). Safe to re-run: resets the demo
// workspace to a clean state.
//
//   npm run db:seed

import { PrismaClient } from "@prisma/client";
import { encryptSecret } from "../src/lib/crypto";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@leonyx.local";
const DEMO_USERNAME = "the.barbershop.demo";

function daysAgo(days: number, hour = 12): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, Math.floor(Math.random() * 50), 0, 0);
  return d;
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

interface ContactSeedDef {
  username: string;
  name: string | null;
  tags: string[];
  follower: boolean;
  source: string;
  note?: string;
}

async function main() {
  console.log("Seeding demo workspace…");

  // Reset: remove prior demo workspace + user.
  const existingWs = await prisma.workspace.findFirst({ where: { slug: "demo-studio" } });
  if (existingWs) {
    await prisma.workspace.delete({ where: { id: existingWs.id } });
  }
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
  await prisma.user.deleteMany({ where: { isDemo: true } });

  const user = await prisma.user.create({
    data: { email: DEMO_EMAIL, name: "Demo User", isDemo: true, emailVerifiedAt: new Date() },
  });

  const ws = await prisma.workspace.create({
    data: {
      name: "Demo Studio",
      slug: "demo-studio",
      settings: { demo: true },
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  const workspaceId = ws.id;

  const connection = await prisma.socialConnection.create({
    data: {
      workspaceId,
      connectedByUserId: user.id,
      provider: "INSTAGRAM",
      externalAccountId: "demo-ig-account",
      username: DEMO_USERNAME,
      displayName: "Demo Studio",
      accessTokenEnc: encryptSecret("demo-token"),
      tokenExpiresAt: daysAgo(-350),
      status: "ACTIVE",
      scopes: ["instagram_business_basic", "instagram_business_manage_messages", "instagram_business_manage_comments"],
      meta: { demo: true, followers: 12480 },
    },
  });

  // Tags
  const tagNames = ["Guide Lead", "Price Inquiry", "Newsletter", "Real Estate", "Agency Lead", "Story Reply", "Launch Interest"];
  const tags = new Map<string, string>();
  for (const name of tagNames) {
    const tag = await prisma.contactTag.create({ data: { workspaceId, name, color: tagColor(name) } });
    tags.set(name, tag.id);
  }

  // Tracked links
  const links = new Map<string, { id: string; slug: string }>();
  const linkDefs = [
    { key: "guide", name: "SEO Checklist", destination: "https://www.leonyx-ai.com/demo/seo-checklist" },
    { key: "price", name: "Pricing Page", destination: "https://www.leonyx-ai.com/demo/pricing" },
    { key: "newsletter", name: "Newsletter Signup", destination: "https://www.leonyx-ai.com/demo/newsletter" },
    { key: "booking", name: "Book Now", destination: "https://www.leonyx-ai.com/demo/booking" },
  ];
  for (const def of linkDefs) {
    const link = await prisma.trackedLink.create({
      data: { workspaceId, name: def.key, destination: def.destination, slug: `demo-${def.key}` },
    });
    links.set(def.key, { id: link.id, slug: link.slug });
  }

  // Automations
  const automationDefs = [
    {
      key: "guide",
      name: "Comment GUIDE",
      description: "Anyone commenting GUIDE gets the SEO checklist in DMs.",
      triggerType: "COMMENT" as const,
      triggerConfig: {},
      status: "ACTIVE" as const,
      conditions: [
        { kind: "KEYWORD_MATCH" as const, config: { keywords: ["GUIDE"], matchAny: false, caseInsensitive: true, wholeWord: true }, order: 0 },
      ],
      actions: [
        { kind: "PUBLIC_REPLY" as const, config: { text: "Sent! Check your DMs 👊" }, order: 0, delayMs: 0 },
        { kind: "SEND_LINK" as const, config: { text: "Hey {{username}} — here's the SEO checklist you asked for: {{link}}", linkSlug: "demo-guide", linkName: "SEO Checklist", linkDestination: "https://www.leonyx-ai.com/demo/seo-checklist" }, order: 1, delayMs: 0 },
        { kind: "ADD_TAG" as const, config: { tag: "Guide Lead" }, order: 2, delayMs: 0 },
      ],
    },
    {
      key: "price",
      name: "Comment PRICE",
      description: "Price inquiries get the pricing page and a tag.",
      triggerType: "COMMENT" as const,
      triggerConfig: {},
      status: "ACTIVE" as const,
      conditions: [
        { kind: "KEYWORD_MATCH" as const, config: { keywords: ["PRICE", "COST", "HOW MUCH"], matchAny: true, caseInsensitive: true, wholeWord: true }, order: 0 },
      ],
      actions: [
        { kind: "PUBLIC_REPLY" as const, config: { text: "Pricing coming your way 💬" }, order: 0, delayMs: 0 },
        { kind: "SEND_LINK" as const, config: { text: "Hi {{username}}! Here's our pricing: {{link}}\n\nWant me to walk you through options?", linkSlug: "demo-price", linkName: "Pricing Page", linkDestination: "https://www.leonyx-ai.com/demo/pricing" }, order: 1, delayMs: 0 },
        { kind: "ADD_TAG" as const, config: { tag: "Price Inquiry" }, order: 2, delayMs: 0 },
      ],
    },
    {
      key: "newsletter",
      name: "Newsletter signup",
      description: "Subscribe comments get the newsletter link.",
      triggerType: "COMMENT" as const,
      triggerConfig: {},
      status: "ACTIVE" as const,
      conditions: [
        { kind: "KEYWORD_MATCH" as const, config: { keywords: ["NEWSLETTER", "SUBSCRIBE"], matchAny: true, caseInsensitive: true, wholeWord: false }, order: 0 },
      ],
      actions: [
        { kind: "PUBLIC_REPLY" as const, config: { text: "Subscribe link in your DMs ✉️" }, order: 0, delayMs: 0 },
        { kind: "SEND_LINK" as const, config: { text: "Join the newsletter here: {{link}}", linkSlug: "demo-newsletter", linkName: "Newsletter Signup", linkDestination: "https://www.leonyx-ai.com/demo/newsletter" }, order: 1, delayMs: 0 },
        { kind: "ADD_TAG" as const, config: { tag: "Newsletter" }, order: 2, delayMs: 0 },
      ],
    },
    {
      key: "agency",
      name: "Agency inbound triage",
      description: "DM keywords route agency interest into the pipeline.",
      triggerType: "DM" as const,
      triggerConfig: {},
      status: "ACTIVE" as const,
      conditions: [
        { kind: "KEYWORD_MATCH" as const, config: { keywords: ["PRICING", "PACKAGE", "WORK WITH", "HELP"], matchAny: true, caseInsensitive: true, wholeWord: false }, order: 0 },
        { kind: "EXCLUDE_KEYWORDS" as const, config: { keywords: ["no thanks", "not interested"], matchAny: true, caseInsensitive: true, wholeWord: false }, order: 1 },
      ],
      actions: [
        { kind: "SEND_DM" as const, config: { text: "Thanks for reaching out {{username}}! Here's what we can do: {{link}}\nWhat does your business need?" }, order: 0, delayMs: 0 },
        { kind: "ADD_TAG" as const, config: { tag: "Agency Lead" }, order: 1, delayMs: 0 },
        { kind: "CALL_WEBHOOK" as const, config: { url: "https://example.com/hooks/leonyx" }, order: 2, delayMs: 0, enabled: false },
      ],
    },
    {
      key: "story",
      name: "Story YES/ME replies",
      description: "Story replies with YES or ME get the booking link (currently paused).",
      triggerType: "STORY_REPLY" as const,
      triggerConfig: {},
      status: "PAUSED" as const,
      conditions: [
        { kind: "KEYWORD_MATCH" as const, config: { keywords: ["YES", "ME"], matchAny: true, caseInsensitive: true, wholeWord: true }, order: 0 },
      ],
      actions: [
        { kind: "SEND_LINK" as const, config: { text: "Awesome — book your slot here: {{link}}", linkSlug: "demo-booking", linkName: "Book Now", linkDestination: "https://www.leonyx-ai.com/demo/booking" }, order: 0, delayMs: 0 },
        { kind: "ADD_TAG" as const, config: { tag: "Story Reply" }, order: 1, delayMs: 0 },
      ],
    },
    {
      key: "launch-draft",
      name: "Product launch (draft)",
      description: "Draft automation for an upcoming launch — not active.",
      triggerType: "COMMENT" as const,
      triggerConfig: {},
      status: "DRAFT" as const,
      conditions: [
        { kind: "KEYWORD_MATCH" as const, config: { keywords: ["LAUNCH", "WAITLIST"], matchAny: true, caseInsensitive: true, wholeWord: false }, order: 0 },
      ],
      actions: [{ kind: "PUBLIC_REPLY" as const, config: { text: "We love the hype! 🔥" }, order: 0, delayMs: 0 }],
    },
  ];

  const automationIds = new Map<string, string>();
  const autoByKey: Record<string, { id: string; actions: { kind: string; order: number; config: Record<string, unknown> }[] }> = {};

  for (const def of automationDefs) {
    const created = await prisma.automation.create({
      data: {
        workspaceId,
        createdById: user.id,
        name: def.name,
        description: def.description,
        triggerType: def.triggerType,
        triggerConfig: def.triggerConfig as object,
        status: def.status,
        conditions: { create: def.conditions.map((c) => ({ kind: c.kind, config: c.config as object, order: c.order, enabled: true })) },
        actions: { create: def.actions.map((a) => ({ kind: a.kind, config: a.config as object, order: a.order, delayMs: a.delayMs, enabled: (a as {enabled?: boolean}).enabled !== false })) },
      },
      include: { actions: { orderBy: { order: "asc" } } },
    });
    automationIds.set(def.key, created.id);
    autoByKey[def.key] = { id: created.id, actions: created.actions.map((a) => ({ kind: a.kind, order: a.order, config: a.config as Record<string, unknown> })) };
  }

  // Contacts
  const contactDefs: ContactSeedDef[] = [
    { username: "barber.mike", name: "Mike Johnson", tags: ["Guide Lead", "Newsletter"], follower: true, source: "COMMENT" },
    { username: "sarah.waves", name: "Sarah K.", tags: ["Guide Lead"], follower: true, source: "COMMENT" },
    { username: "fade.hunter", name: null, tags: ["Price Inquiry"], follower: true, source: "COMMENT" },
    { username: "dreads.dana", name: "Dana Lee", tags: ["Guide Lead", "Price Inquiry"], follower: false, source: "COMMENT" },
    { username: "trim.tom", name: "Tom A.", tags: ["Newsletter"], follower: true, source: "COMMENT" },
    { username: "grow.biz.ro", name: "Rosa Mendez", tags: ["Agency Lead"], follower: true, source: "DM" },
    { username: "launch.lu", name: "Luis P.", tags: ["Launch Interest"], follower: true, source: "COMMENT", note: "Asked about beta access" },
    { username: "kc.cuts", name: "Kayla C.", tags: [], follower: true, source: "DM" },
    { username: "mop.top.matt", name: null, tags: ["Price Inquiry"], follower: false, source: "COMMENT" },
    { username: "theo.trim", name: "Theo N.", tags: ["Story Reply"], follower: true, source: "STORY" },
    { username: "nina.naps", name: "Nina R.", tags: ["Newsletter"], follower: true, source: "COMMENT" },
    { username: "vic.fade", name: "Vic Torres", tags: ["Guide Lead"], follower: true, source: "COMMENT" },
    { username: "young.harris", name: null, tags: [], follower: false, source: "DM" },
    { username: "beard.brooks", name: "Brooks E.", tags: ["Agency Lead"], follower: true, source: "DM" },
  ];

  const contactIds: string[] = [];
  for (const [i, def] of contactDefs.entries()) {
    const contact = await prisma.contact.create({
      data: {
        workspaceId,
        provider: "INSTAGRAM",
        externalId: `ig-${1000 + i}`,
        username: def.username,
        name: def.name,
        notes: def.note ?? null,
        source: def.source,
        isFollower: def.follower,
        firstSeenAt: daysAgo(25 - i),
        lastSeenAt: daysAgo(Math.max(0, 4 - i)),
      },
    });
    contactIds.push(contact.id);
    for (const tag of def.tags) {
      const tagId = tags.get(tag);
      if (tagId) {
        await prisma.contactTagLink.create({ data: { contactId: contact.id, tagId } });
      }
    }
  }

  // Conversations + messages
  const convoDefs = [
    { contactIdx: 0, lines: [["in", "hey! just commented GUIDE on your reel 🙌"], ["out", "Hey Mike! Here's the SEO checklist: {{link}}"]], unread: false },
    { contactIdx: 1, lines: [["in", "GUIDE please!"], ["out", "Sent! Enjoy the checklist 👊"]], unread: false },
    { contactIdx: 5, lines: [["in", "hi! saw you work with barbershops. what's pricing for a package?"], ["out", "Thanks for reaching out Rosa! Here's what we can do: {{link}} What does your business need?"]], unread: false },
    { contactIdx: 7, lines: [["in", "do you do walk-ins on saturdays?"]], unread: true },
    { contactIdx: 10, lines: [["in", "newsletter link?"], ["out", "Join the newsletter here: {{link}}"], ["in", "thanks!"]], unread: true },
    { contactIdx: 3, lines: [["in", "how much for a full service?"], ["out", "Hi Dana! Here's our pricing: {{link}}"]], unread: false },
    { contactIdx: 13, lines: [["in", "we run 3 salons, could you automate our booking dms?"], ["out", "Absolutely — happy to walk through it. What's your stack?"]], unread: true },
  ];

  for (const [i, def] of convoDefs.entries()) {
    const contact = contactIds[def.contactIdx];
    if (!contact) continue;
    const conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        socialConnectionId: connection.id,
        contactId: contact,
        provider: "INSTAGRAM",
        externalId: `demo-convo-${i}`,
        type: "DM",
        status: "OPEN",
        unread: def.unread,
        lastMessageAt: daysAgo(i + 1, 10),
        lastInboundAt: daysAgo(i + 1, 10),
      },
    });
    for (const [j, line] of def.lines.entries()) {
      const [direction, raw] = line as ["in" | "out", string];
      // resolve {{link}} to a real tracked URL for realism
      const content = raw.replace("{{link}}", linkUrl("demo-price"));
      await prisma.message.create({
        data: {
          workspaceId,
          conversationId: conversation.id,
          contactId: contact,
          socialConnectionId: connection.id,
          provider: "INSTAGRAM",
          direction: direction === "in" ? "INBOUND" : "OUTBOUND",
          kind: "TEXT",
          content,
          status: "DELIVERED",
          sentAt: daysAgo(i + 1, 9 + j),
          deliveredAt: daysAgo(i + 1, 9 + j),
          externalId: `demo-msg-${i}-${j}`,
        },
      });
    }
  }

  // Executions with steps across the last 30 days
  const executionSpecs = buildExecutionSpecs();
  for (const spec of executionSpecs) {
    const auto = autoByKey[spec.autoKey];
    if (!auto) continue;
    const contactId = contactIds[spec.contactIdx];
    if (!contactId) continue;
    const createdAt = daysAgo(spec.daysAgo, spec.hour);
    const kind = spec.trace.keyword ? spec.trace.keyword : "";

    // Match actions to statuses: completed / failed / skipped
    const statuses = spec.stepStatuses;
    const steps = [];
    for (let s = 0; s < auto.actions.length; s++) {
      const action = auto.actions[s];
      if (!action) continue;
      const st = statuses[s] ?? "COMPLETED";
      steps.push({
        actionType: action.kind as never,
        label: actionLabel(action.kind),
        order: action.order,
        status: st as never,
        payload: {},
        result: st === "COMPLETED" ? { ok: true } : undefined,
        error: st === "FAILED" ? "Mock provider: injectable failure" : st === "SKIPPED" ? "outside the 168-hour messaging window" : undefined,
        attempts: st === "FAILED" ? 3 : 1,
        startedAt: new Date(createdAt.getTime() + 1000),
        completedAt: new Date(createdAt.getTime() + 5000),
      });
    }

    const execStatus =
      steps.some((x) => x.status === "FAILED") && steps.some((x) => x.status === "COMPLETED")
        ? "PARTIALLY_COMPLETED"
        : steps.some((x) => x.status === "FAILED")
          ? "FAILED"
          : steps.some((x) => x.status === "COMPLETED")
            ? "COMPLETED"
            : "SKIPPED";

    const execution = await prisma.execution.create({
      data: {
        workspaceId,
        automationId: auto.id,
        contactId,
        socialConnectionId: connection.id,
        provider: "INSTAGRAM",
        providerEventId: uid("evt"),
        triggerType: (spec.trace.type ?? "COMMENT") as "COMMENT" | "DM" | "STORY_REPLY",
        triggerPayload: { kind: spec.trace.type ?? "COMMENT", text: spec.trace.text, contact: { username: contactUsername(contactId, contactDefs, contactIds) } },
        status: execStatus,
        startedAt: createdAt,
        completedAt: createdAt,
        error: execStatus === "FAILED" || execStatus === "PARTIALLY_COMPLETED" ? "one or more actions failed" : null,
        createdAt,
        steps: { create: steps },
      },
    });

    await prisma.interaction.create({
      data: {
        workspaceId,
        contactId,
        automationId: auto.id,
        executionId: execution.id,
        kind: (spec.trace.type === "DM" ? "DM_INBOUND" : spec.trace.type ?? "COMMENT") as never,
        payload: { text: spec.trace.text, matchedKeyword: kind || null },
        occurredAt: createdAt,
      },
    });
  }

  // Link clicks
  const clickSpecs = [
    { link: "demo-guide", days: 0, count: 14 },
    { link: "demo-guide", days: 1, count: 8 },
    { link: "demo-guide", days: 3, count: 5 },
    { link: "demo-guide", days: 5, count: 6 },
    { link: "demo-guide", days: 8, count: 3 },
    { link: "demo-price", days: 0, count: 6 },
    { link: "demo-price", days: 2, count: 4 },
    { link: "demo-price", days: 6, count: 2 },
    { link: "demo-newsletter", days: 1, count: 7 },
    { link: "demo-newsletter", days: 4, count: 5 },
    { link: "demo-newsletter", days: 9, count: 2 },
    { link: "demo-booking", days: 2, count: 3 },
  ];
  let clickIdx = 0;
  for (const spec of clickSpecs) {
    const link = links.get(spec.link);
    if (!link) continue;
    for (let c = 0; c < spec.count; c++) {
      const contactId = contactIds[clickIdx % contactIds.length];
      clickIdx++;
      await prisma.linkClick.create({
        data: {
          workspaceId,
          linkId: link.id,
          contactId,
          uniqueKey: `seed:${spec.link}:${clickIdx}`,
          ipHash: null,
          userAgent: "Instagram Internal / demo",
          createdAt: daysAgo(spec.days, 8 + (c % 10)),
        },
      });
    }
    await prisma.trackedLink.update({
      where: { id: link.id },
      data: { clickCount: { increment: spec.count }, uniqueClickCount: { increment: Math.min(spec.count, 10) } },
    });
  }

  // AI usage + audit rows for realism
  for (let i = 0; i < 6; i++) {
    await prisma.aIUsage.create({
      data: {
        workspaceId,
        userId: user.id,
        provider: "anthropic",
        model: "claude-3-5-haiku-latest",
        feature: i % 2 === 0 ? "rewrite" : "campaign-gen",
        inputTokens: 300 + i * 50,
        outputTokens: 120 + i * 30,
        createdAt: daysAgo(i * 2),
      },
    });
  }
  await prisma.auditLog.create({
    data: {
      workspaceId,
      actorUserId: user.id,
      action: "demo.seeded",
      entityType: "workspace",
      entityId: workspaceId,
      meta: { note: "Demo data generated by prisma/seed.ts" },
    },
  });

  console.log("Demo workspace ready:");
  console.log(`  workspace: ${workspaceId}`);
  console.log(`  user: ${DEMO_EMAIL}`);
  console.log(`  automations: ${automationDefs.length}, contacts: ${contactDefs.length}, executions: ~${executionSpecs.length}`);
}

interface ExecSpec {
  autoKey: string;
  contactIdx: number;
  daysAgo: number;
  hour: number;
  stepStatuses: string[];
  trace: { type?: "COMMENT" | "DM" | "STORY_REPLY"; text: string; keyword?: string };
}

function buildExecutionSpecs(): ExecSpec[] {
  const specs: ExecSpec[] = [];
  const c = (autoKey: string, contactIdx: number, daysAgo: number, hour: number, stepStatuses: string[], trace: ExecSpec["trace"]) =>
    specs.push({ autoKey, contactIdx, daysAgo, hour, stepStatuses, trace });

  // GUIDE automation (SEND_LINK + PUBLIC_REPLY + ADD_TAG → 3 actions, but
  // seed execution uses automation actions by count — actions ordered:
  // PUBLIC_REPLY, SEND_LINK, ADD_TAG)
  c("guide", 0, 0, 10, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "GUIDE pls!", keyword: "GUIDE" });
  c("guide", 1, 0, 14, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "Need this GUIDE 🙏", keyword: "GUIDE" });
  c("guide", 11, 0, 18, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "GUIDE", keyword: "GUIDE" });
  c("guide", 3, 1, 9, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "send guide!!", keyword: "GUIDE" });
  c("guide", 8, 2, 11, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "GUIDE", keyword: "GUIDE" });
  c("guide", 11, 2, 19, ["COMPLETED", "COMPLETED", "SKIPPED"], { type: "COMMENT", text: "guide", keyword: "GUIDE" });
  c("guide", 2, 3, 10, ["COMPLETED", "FAILED", "COMPLETED"], { type: "COMMENT", text: "GUIDE please", keyword: "GUIDE" });
  c("guide", 6, 4, 12, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "GUIDE", keyword: "GUIDE" });
  c("guide", 4, 5, 16, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "Can I get the GUIDE?", keyword: "GUIDE" });
  c("guide", 9, 6, 9, ["COMPLETED", "SKIPPED", "COMPLETED"], { type: "COMMENT", text: "GUIDE", keyword: "GUIDE" });
  c("guide", 1, 7, 13, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "GUIDE", keyword: "GUIDE" });
  c("guide", 12, 8, 17, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "send it", keyword: "GUIDE" });
  c("guide", 2, 10, 10, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "GUIDE", keyword: "GUIDE" });
  c("guide", 4, 13, 15, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "GUIDE", keyword: "GUIDE" });
  c("guide", 7, 16, 11, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "GUIDE??", keyword: "GUIDE" });
  c("guide", 12, 22, 12, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "the guide pls", keyword: "GUIDE" });
  c("guide", 5, 27, 10, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "GUIDE", keyword: "GUIDE" });
  c("guide", 9, 28, 16, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "GUIDE", keyword: "GUIDE" });

  // PRICE automation (PUBLIC_REPLY + SEND_LINK + ADD_TAG)
  c("price", 2, 1, 15, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "PRICE?", keyword: "PRICE" });
  c("price", 8, 3, 12, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "how much?", keyword: "HOW MUCH" });
  c("price", 3, 4, 10, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "whats the cost", keyword: "COST" });
  c("price", 9, 7, 17, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "PRICE", keyword: "PRICE" });
  c("price", 2, 12, 11, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "price?", keyword: "PRICE" });
  c("price", 13, 20, 14, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "how much is a fade", keyword: "HOW MUCH" });

  // Newsletter (PUBLIC_REPLY + SEND_LINK + ADD_TAG)
  c("newsletter", 4, 2, 10, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "newsletter?", keyword: "NEWSLETTER" });
  c("newsletter", 10, 5, 11, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "subscribe me!", keyword: "SUBSCRIBE" });
  c("newsletter", 0, 9, 12, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "newsletter link", keyword: "NEWSLETTER" });
  c("newsletter", 9, 15, 10, ["COMPLETED", "COMPLETED", "COMPLETED"], { type: "COMMENT", text: "newsletter", keyword: "NEWSLETTER" });

  // Agency DM (SEND_DM + ADD_TAG [+ webhook disabled])
  c("agency", 5, 0, 12, ["COMPLETED", "COMPLETED"], { type: "DM", text: "hi! what's your pricing for agencies?" });
  c("agency", 13, 3, 13, ["COMPLETED", "COMPLETED"], { type: "DM", text: "we need help with dm automation" });
  c("agency", 12, 18, 9, ["COMPLETED", "COMPLETED"], { type: "DM", text: "do you work with salons?" });
  c("agency", 7, 29, 15, ["SKIPPED"], { type: "DM", text: "no thanks" });

  // Story replies (SEND_LINK + ADD_TAG) — paused automation, so these are
  // skipped executions (paused automations don't run; seed shows old ones
  // from when it was active)
  c("story", 9, 6, 18, ["COMPLETED", "COMPLETED"], { type: "STORY_REPLY", text: "YES" });
  c("story", 4, 14, 19, ["COMPLETED", "COMPLETED"], { type: "STORY_REPLY", text: "me!" });
  c("story", 8, 21, 17, ["COMPLETED", "COMPLETED"], { type: "STORY_REPLY", text: "YES" });

  return specs;
}

function actionLabel(kind: string): string {
  const labels: Record<string, string> = {
    SEND_DM: "Send DM",
    SEND_LINK: "Send tracked link",
    PUBLIC_REPLY: "Public comment reply",
    ADD_TAG: "Tag contact",
    CALL_WEBHOOK: "Call webhook",
    DELAY: "Wait",
  };
  return labels[kind] ?? kind;
}

function tagColor(name: string): string {
  const colors: Record<string, string> = {
    "Guide Lead": "#E5322D",
    "Price Inquiry": "#F59E0B",
    Newsletter: "#3B82F6",
    "Real Estate": "#10B981",
    "Agency Lead": "#8B5CF6",
    "Story Reply": "#EC4899",
    "Launch Interest": "#06B6D4",
  };
  return colors[name] ?? "#6B7280";
}

function linkUrl(slug: string): string {
  return `http://localhost:3000/l/${slug}`;
}

function contactUsername(contactId: string, contactDefs: ContactSeedDef[], contactIds: string[]): string {
  const idx = contactIds.indexOf(contactId);
  return contactDefs[idx]?.username ?? "user";
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });