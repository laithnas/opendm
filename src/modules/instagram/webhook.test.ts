import { describe, it, expect } from "vitest";
import { parseInstagramWebhook } from "@/modules/instagram/webhook";

// Regression: real Instagram Login webhook deliveries nest the media id as
// `media: { id }`, not a flat `media_id` string. The parser required
// `media_id` and silently dropped every real comment event as a result
// (0 events parsed from every real delivery, while a hand-built test
// payload using the flat shape worked fine and masked the bug for a while).
// This exact payload is a real delivery captured live, byte for byte.

const REAL_COMMENT_PAYLOAD = {
  entry: [
    {
      id: "17841459305172292",
      time: 1790129895,
      changes: [
        {
          value: {
            from: { id: "964000166007401", username: "1aithn" },
            media: { id: "18097101578098507", media_product_type: "REELS" },
            id: "18133114894710506",
            text: "Jev",
          },
          field: "comments",
        },
      ],
    },
  ],
  object: "instagram",
};

describe("parseInstagramWebhook", () => {
  it("parses a real comment delivery with a nested media.id", () => {
    const events = parseInstagramWebhook(REAL_COMMENT_PAYLOAD);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      provider: "instagram",
      kind: "COMMENT",
      providerEventId: "18133114894710506",
      text: "Jev",
      mediaId: "18097101578098507",
      commentId: "18133114894710506",
      contact: { externalId: "964000166007401", username: "1aithn" },
    });
  });

  it("still parses a flat media_id (older/alternate shape, used by backfill's synthetic payloads)", () => {
    const events = parseInstagramWebhook({
      object: "instagram",
      entry: [
        {
          id: "17841459305172292",
          changes: [{ field: "comments", value: { id: "c1", media_id: "m1", text: "hi", from: { id: "u1" } } }],
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.mediaId).toBe("m1");
  });

  it("drops a comment with neither media.id nor media_id", () => {
    const events = parseInstagramWebhook({
      object: "instagram",
      entry: [{ id: "acct", changes: [{ field: "comments", value: { id: "c1", text: "hi" } }] }],
    });
    expect(events).toHaveLength(0);
  });

  // Regression: real messaging deliveries send `entry.messaging` as a
  // top-level array sibling to `changes`, not wrapped in a
  // {field:"messaging", value} change — the parser only looked at `changes`,
  // so every real DM/button-tap event silently parsed to 0 events. Only
  // comments (which do use `changes`) ever actually fired. This exact shape
  // is a real delivery captured live.
  it("parses a real top-level entry.messaging delivery (not wrapped in changes)", () => {
    const events = parseInstagramWebhook({
      object: "instagram",
      entry: [
        {
          time: 1790130266750,
          id: "17841459305172292",
          messaging: [
            {
              sender: { id: "964000166007401", username: "1aithn" },
              recipient: { id: "17841459305172292" },
              timestamp: 1790130266368,
              message: { mid: "mid-1", text: "hi" },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "DM", providerEventId: "mid-1", text: "hi" });
  });

  it("ignores is_echo messages (our own outbound DM delivered back to us)", () => {
    const events = parseInstagramWebhook({
      object: "instagram",
      entry: [
        {
          id: "17841459305172292",
          messaging: [
            {
              sender: { id: "17841459305172292" },
              recipient: { id: "964000166007401" },
              message: { mid: "mid-echo", text: "outbound", is_echo: true },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(0);
  });

  // Regression: messaging timestamps are already epoch-milliseconds, not
  // seconds like comment timestamps. Multiplying by 1000 again landed the
  // Date around the year 58698 and crashed every DB write that touched it —
  // silently broke every real DM, including every follow-gate button tap.
  it("treats messaging timestamps as already-milliseconds, not seconds", () => {
    const events = parseInstagramWebhook({
      object: "instagram",
      entry: [
        {
          id: "17841459305172292",
          messaging: [
            {
              sender: { id: "964000166007401" },
              recipient: { id: "17841459305172292" },
              timestamp: 1790130266368, // real captured value
              message: { mid: "mid-ts", text: "hi" },
            },
          ],
        },
      ],
    });
    const year = new Date(events[0]!.occurredAt).getUTCFullYear();
    expect(year).toBeGreaterThan(2020);
    expect(year).toBeLessThan(2030);
  });

  it("captures a quick-reply button tap as buttonPayload", () => {
    const events = parseInstagramWebhook({
      object: "instagram",
      entry: [
        {
          id: "17841459305172292",
          messaging: [
            {
              sender: { id: "964000166007401" },
              recipient: { id: "17841459305172292" },
              message: { mid: "mid-tap", text: "I Followed", quick_reply: { payload: "fg:abc123" } },
            },
          ],
        },
      ],
    });
    expect(events[0]?.buttonPayload).toBe("fg:abc123");
  });

  // Button-template taps (adapter.ts sendDm's `buttons` option — the format
  // that actually renders attached to the message bubble, matching what the
  // follow gate needs) arrive as a top-level `postback` field, not nested
  // under `message` at all — there's no `message.mid` on this event shape.
  it("captures a button-template tap via the postback field", () => {
    const events = parseInstagramWebhook({
      object: "instagram",
      entry: [
        {
          id: "17841459305172292",
          messaging: [
            {
              sender: { id: "964000166007401", username: "1aithn" },
              recipient: { id: "17841459305172292" },
              timestamp: 1790130266368,
              postback: { payload: "fg:xyz789", title: "I Followed" },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "DM", buttonPayload: "fg:xyz789", contact: { externalId: "964000166007401" } });
  });
});
