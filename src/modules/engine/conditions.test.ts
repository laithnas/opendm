import { describe, it, expect } from "vitest";
import { keywordMatches, evaluateSingleCondition, evaluateConditions } from "@/modules/engine/conditions";
import type { AutomationCondition } from "@prisma/client";

describe("keywordMatches", () => {
  it("matches a simple keyword (case-insensitive default)", () => {
    expect(keywordMatches("I need the GUIDE please", { keywords: ["guide"], matchAny: false, caseInsensitive: true, wholeWord: true })).toBe("guide");
  });

  it("is case-sensitive when configured", () => {
    expect(keywordMatches("guide", { keywords: ["GUIDE"], matchAny: false, caseInsensitive: false, wholeWord: true })).toBeNull();
    expect(keywordMatches("GUIDE", { keywords: ["GUIDE"], matchAny: false, caseInsensitive: false, wholeWord: true })).toBe("GUIDE");
  });

  it("respects whole-word boundaries", () => {
    expect(keywordMatches("guides welcome", { keywords: ["guide"], matchAny: false, caseInsensitive: true, wholeWord: true })).toBeNull();
    expect(keywordMatches("guide", { keywords: ["guide"], matchAny: false, caseInsensitive: true, wholeWord: true })).toBe("guide");
  });

  it("requires ALL keywords when matchAny=false", () => {
    expect(keywordMatches("price guide", { keywords: ["price", "guide"], matchAny: false, caseInsensitive: true, wholeWord: true })).toBe("price");
    expect(keywordMatches("price only", { keywords: ["price", "guide"], matchAny: false, caseInsensitive: true, wholeWord: true })).toBeNull();
  });

  it("matches ANY keyword when matchAny=true and returns the first hit", () => {
    expect(keywordMatches("guide here", { keywords: ["cost", "guide"], matchAny: true, caseInsensitive: true, wholeWord: true })).toBe("guide");
    expect(keywordMatches("nothing", { keywords: ["cost", "guide"], matchAny: true, caseInsensitive: true, wholeWord: true })).toBeNull();
  });

  it("handles empty keyword lists", () => {
    expect(keywordMatches("anything", { keywords: [], matchAny: false, caseInsensitive: true, wholeWord: true })).toBeNull();
  });
});

function cond(kind: string, config: Record<string, unknown>, enabled = true): AutomationCondition {
  return { id: "c1", automationId: "a1", kind: kind as never, config, order: 0, enabled } as AutomationCondition;
}

const event = {
  provider: "instagram",
  kind: "COMMENT",
  providerEventId: "evt-1",
  text: "GUIDE price",
  contact: { externalId: "u1", username: "user" },
  mediaId: "media-1",
  commentId: "comment-1",
  occurredAt: new Date().toISOString(),
  raw: {},
} as never;

describe("evaluateSingleCondition", () => {
  it("keyword condition passes on match", () => {
    const v = evaluateSingleCondition(cond("KEYWORD_MATCH", { keywords: ["GUIDE"], matchAny: false, caseInsensitive: true, wholeWord: true }), { event });
    expect(v.pass).toBe(true);
    expect(v.keyword).toBe("guide");
  });

  it("keyword condition fails on no match", () => {
    const v = evaluateSingleCondition(cond("KEYWORD_MATCH", { keywords: ["XYZ"], matchAny: false, caseInsensitive: true, wholeWord: true }), { event });
    expect(v.pass).toBe(false);
    expect(v.reason).toContain("no keyword");
  });

  it("exclude condition fails when excluded keyword present", () => {
    const v = evaluateSingleCondition(cond("EXCLUDE_KEYWORDS", { keywords: ["price"], matchAny: true, caseInsensitive: true, wholeWord: true }), { event });
    expect(v.pass).toBe(false);
  });

  it("post match (any) always passes", () => {
    const v = evaluateSingleCondition(cond("POST_MATCH", { postSelection: "any", postRef: null }), { event });
    expect(v.pass).toBe(true);
  });

  it("post match (specific) checks media id", () => {
    expect(evaluateSingleCondition(cond("POST_MATCH", { postSelection: "specific", postRef: "media-1" }), { event }).pass).toBe(true);
    expect(evaluateSingleCondition(cond("POST_MATCH", { postSelection: "specific", postRef: "media-2" }), { event }).pass).toBe(false);
  });

  it("followers-only passes for followers", () => {
    const v = evaluateSingleCondition(cond("FOLLOWERS_ONLY", { requireFollow: true }), { event, isFollower: true });
    expect(v.pass).toBe(true);
  });

  it("followers-only fails closed when status unknown", () => {
    const v = evaluateSingleCondition(cond("FOLLOWERS_ONLY", { requireFollow: true }), { event, isFollower: null });
    expect(v.pass).toBe(false);
    expect(v.reason).toContain("advanced access");
  });
});

describe("evaluateConditions", () => {
  it("passes when all conditions pass", () => {
    const v = evaluateConditions(
      {
        conditions: [cond("KEYWORD_MATCH", { keywords: ["GUIDE"] })],
        triggerConfig: {},
      },
      { event },
    );
    expect(v.pass).toBe(true);
  });

  it("fails when any condition fails", () => {
    const v = evaluateConditions(
      {
        conditions: [
          cond("KEYWORD_MATCH", { keywords: ["GUIDE"] }),
          cond("FOLLOWERS_ONLY", { requireFollow: true }),
        ],
        triggerConfig: {},
      },
      { event, isFollower: false },
    );
    expect(v.pass).toBe(false);
  });

  it("ignores disabled conditions", () => {
    const v = evaluateConditions(
      {
        conditions: [cond("KEYWORD_MATCH", { keywords: ["NOPE"] }, false)],
        triggerConfig: {},
      },
      { event },
    );
    expect(v.pass).toBe(true);
  });

  it("applies legacy triggerConfig keywords", () => {
    const v = evaluateConditions(
      { conditions: [], triggerConfig: { keywords: ["GUIDE"] } },
      { event },
    );
    expect(v.pass).toBe(true);
  });
});