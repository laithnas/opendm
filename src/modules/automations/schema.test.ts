import { describe, it, expect } from "vitest";
import { automationInputSchema, exportPayloadSchema, validateActionConfig } from "@/modules/automations/schema";

const validAutomation = {
  name: "Comment GUIDE",
  description: "Send the guide",
  triggerType: "COMMENT",
  triggerConfig: {},
  conditions: [
    { kind: "KEYWORD_MATCH", config: { keywords: ["GUIDE"], matchAny: false, caseInsensitive: true, wholeWord: true }, order: 0, enabled: true },
  ],
  actions: [
    { kind: "PUBLIC_REPLY", config: { text: "Sent it 👊" }, order: 0, enabled: true, delayMs: 0 },
    { kind: "SEND_DM", config: { text: "Here you go {{link}}", ctaButtons: [{ title: "Open" }] }, order: 1, enabled: true, delayMs: 0 },
  ],
};

describe("automation input schema", () => {
  it("accepts a valid automation", () => {
    expect(automationInputSchema.safeParse(validAutomation).success).toBe(true);
  });

  it("rejects unknown root keys (strict)", () => {
    expect(automationInputSchema.safeParse({ ...validAutomation, hacker: true }).success).toBe(false);
  });

  it("rejects unknown keys inside conditions and actions", () => {
    expect(automationInputSchema.safeParse({ ...validAutomation, conditions: [{ ...validAutomation.conditions[0], evil: 1 }] }).success).toBe(false);
    expect(automationInputSchema.safeParse({ ...validAutomation, actions: [{ ...validAutomation.actions[0], evil: 1 }] }).success).toBe(false);
  });

  it("rejects more than 3 CTA buttons at the boundary validator", () => {
    expect(() =>
      validateActionConfig("SEND_DM", {
        text: "x",
        ctaButtons: [{ title: "1" }, { title: "2" }, { title: "3" }, { title: "4" }],
      }),
    ).toThrow();
    expect(() =>
      validateActionConfig("SEND_DM", {
        text: "x",
        ctaButtons: [{ title: "1" }, { title: "2" }, { title: "3" }],
      }),
    ).not.toThrow();
  });

  it("rejects empty names and invalid trigger types", () => {
    expect(automationInputSchema.safeParse({ ...validAutomation, name: "" }).success).toBe(false);
    expect(automationInputSchema.safeParse({ ...validAutomation, triggerType: "EMAIL" }).success).toBe(false);
  });
});

describe("action config validation", () => {
  it("requires text for SEND_DM", () => {
    expect(() => validateActionConfig("SEND_DM", {})).toThrow();
    expect(() => validateActionConfig("SEND_DM", { text: "hi" })).not.toThrow();
  });

  it("requires a valid URL for CALL_WEBHOOK", () => {
    expect(() => validateActionConfig("CALL_WEBHOOK", { url: "javascript:alert(1)" })).toThrow();
    expect(() => validateActionConfig("CALL_WEBHOOK", { url: "https://hooks.example.com/x" })).not.toThrow();
  });
});

describe("export payload schema", () => {
  it("accepts a versioned payload", () => {
    const payload = {
      schema: "leonyx.flow.automation",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      automation: validAutomation,
    };
    expect(exportPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects the wrong schema marker and future versions", () => {
    expect(exportPayloadSchema.safeParse({ schema: "other.tool", schemaVersion: 1, automation: validAutomation }).success).toBe(false);
    expect(exportPayloadSchema.safeParse({ schema: "leonyx.flow.automation", schemaVersion: 99, automation: validAutomation }).success).toBe(false);
  });

  it("rejects trailing junk keys", () => {
    const payload = { schema: "leonyx.flow.automation", schemaVersion: 1, automation: validAutomation, extra: "x" };
    expect(exportPayloadSchema.safeParse(payload).success).toBe(false);
  });
});