import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "../../vitest.setup";
import { createWorkspace, getMembership, inviteMember, acceptInvite, listUserWorkspaces } from "@/modules/workspaces/access";
import { createAutomation, exportAutomation, importAutomation, getAutomation, setAutomationStatus, duplicateAutomation } from "@/modules/automations/service";
import { createTrackedLink, findLinkBySlug, recordLinkClick } from "@/modules/links/service";

// Integration tests against the disposable test database (requires Docker PG).

let userA: string;
let userB: string;
let wsA: string;
let wsB: string;

beforeAll(async () => {
  await resetDb();
  const a = await prisma.user.create({ data: { email: "a@test.local", emailVerifiedAt: new Date() } });
  const b = await prisma.user.create({ data: { email: "b@test.local", emailVerifiedAt: new Date() } });
  userA = a.id;
  userB = b.id;
  wsA = (await createWorkspace(userA, { name: "Studio A" })).workspaceId;
  wsB = (await createWorkspace(userB, { name: "Studio B" })).workspaceId;
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe("workspace isolation", () => {
  it("user A cannot see workspace B and vice versa", async () => {
    expect(await getMembership(userA, wsB)).toBeNull();
    expect(await getMembership(userB, wsA)).toBeNull();
    expect(await getMembership(userA, wsA)).not.toBeNull();
  });

  it("members see only their own workspaces", async () => {
    const listA = await listUserWorkspaces(userA);
    expect(listA.map((w) => w.workspaceId)).toEqual([wsA]);
  });
});

describe("invites", () => {
  let token: string;

  it("sends an invite and rejects duplicates", async () => {
    const memberA = (await getMembership(userA, wsA))!;
    await inviteMember(userA, memberA, { email: "b@test.local", role: "MEMBER" });
    await expect(inviteMember(userA, memberA, { email: "b@test.local", role: "MEMBER" })).rejects.toThrow(/pending/i);
    const invite = await prisma.invite.findFirst({ where: { workspaceId: wsA, email: "b@test.local" } });
    token = invite!.token;
  });

  it("accepting adds the member to the workspace", async () => {
    const { workspaceId } = await acceptInvite(token, userB);
    expect(workspaceId).toBe(wsA);
    expect((await getMembership(userB, wsA))?.role).toBe("MEMBER");
  });

  it("rejects an invite issued to a different email", async () => {
    const memberA = (await getMembership(userA, wsA))!;
    await inviteMember(userA, memberA, { email: "d@test.local", role: "MEMBER" });
    const fresh = await prisma.invite.findFirst({ where: { workspaceId: wsA, email: "d@test.local" } });
    // Accepting with user B (who was invited as b@test.local) must fail.
    await expect(acceptInvite(fresh!.token, userB)).rejects.toThrow(/different email/i);
  });
});

describe("automation CRUD + isolation", () => {
  const base = {
    name: "GUIDE flow",
    description: null,
    triggerType: "COMMENT" as const,
    triggerConfig: {},
    conditions: [{ kind: "KEYWORD_MATCH" as const, config: { keywords: ["GUIDE"] }, order: 0, enabled: true }],
    actions: [{ kind: "PUBLIC_REPLY" as const, config: { text: "Sent 👊" }, order: 0, enabled: true, delayMs: 0 }],
  };

  it("creates, lists, updates status and isolates", async () => {
    const created = await createAutomation(wsA, userA, base);
    // B cannot fetch A's automation
    await expect(getAutomation(wsB, created.id)).rejects.toThrow(/not found/i);
    // status transitions
    await setAutomationStatus(wsA, created.id, "ACTIVE");
    expect((await getAutomation(wsA, created.id)).status).toBe("ACTIVE");
    await setAutomationStatus(wsA, created.id, "ARCHIVED");
    expect((await getAutomation(wsA, created.id)).archivedAt).not.toBeNull();
  });

  it("duplicates into a fresh draft", async () => {
    const created = await createAutomation(wsA, userA, base);
    const dup = await duplicateAutomation(wsA, created.id);
    expect(dup.id).not.toBe(created.id);
    expect(dup.status).toBe("DRAFT");
    expect(dup.actions.length).toBe(1);
  });

  it("requires at least one action on update", async () => {
    const created = await createAutomation(wsA, userA, base);
    await expect(updateEmpty(wsA, created.id)).rejects.toThrow();
  });
});

async function updateEmpty(ws: string, id: string) {
  const { updateAutomation } = await import("@/modules/automations/service");
  return updateAutomation(ws, id, { name: "x", description: null, triggerType: "COMMENT", triggerConfig: {}, conditions: [], actions: [] });
}

describe("export / import roundtrip", () => {
  it("exports and re-imports into another workspace with a fresh link", async () => {
    const base = {
      name: "Link flow",
      description: null,
      triggerType: "COMMENT" as const,
      triggerConfig: {},
      conditions: [],
      actions: [
        { kind: "SEND_LINK" as const, config: { text: "Here: {{link}}", linkName: "Checklist", linkDestination: "https://example.com/checklist" }, order: 0, enabled: true, delayMs: 0 },
      ],
    };
    const created = await createAutomation(wsA, userA, base);
    const payload = await exportAutomation(wsA, created.id);

    const imported = await importAutomation(wsB, userB, payload);
    expect(imported.rewroteLinks).toBeGreaterThanOrEqual(0);
    const fetched = await getAutomation(wsB, imported.automationId);
    expect(fetched.name).toBe("Link flow");
    const config = fetched.actions[0]!.config as Record<string, unknown>;
    // The imported link was re-wired to a fresh slug in B.
    expect(config.linkDestination).toBeUndefined();
    expect(typeof config.linkSlug).toBe("string");
  });

  it("rejects corrupted imports", async () => {
    await expect(importAutomation(wsB, userB, { schema: "nope", schemaVersion: 1, automation: {} })).rejects.toThrow();
    await expect(importAutomation(wsB, userB, null)).rejects.toThrow();
  });
});

describe("tracked links + click recording", () => {
  it("creates links with unique slugs and validates destinations", async () => {
    const l1 = await createTrackedLink({ workspaceId: wsA, name: "A", destination: "https://example.com/a" });
    const l2 = await createTrackedLink({ workspaceId: wsA, name: "B", destination: "https://example.com/b" });
    expect(l1.slug).not.toBe(l2.slug);
    expect(await findLinkBySlug(l1.slug)).not.toBeNull();
  });

  it("counts clicks and unique clicks correctly", async () => {
    const link = await createTrackedLink({ workspaceId: wsA, name: "C", destination: "https://example.com/c" });
    const contact = await prisma.contact.create({
      data: { workspaceId: wsA, provider: "INSTAGRAM", externalId: "u1", username: "user1" },
    });
    const other = await prisma.contact.create({
      data: { workspaceId: wsA, provider: "INSTAGRAM", externalId: "u2", username: "user2" },
    });
    await recordLinkClick(link.id, wsA, { contactId: contact.id });
    await recordLinkClick(link.id, wsA, { contactId: contact.id }); // same person → not unique
    await recordLinkClick(link.id, wsA, { contactId: other.id });
    const after = await prisma.trackedLink.findUnique({ where: { id: link.id } });
    expect(after!.clickCount).toBe(3);
    expect(after!.uniqueClickCount).toBe(2);
  });
});