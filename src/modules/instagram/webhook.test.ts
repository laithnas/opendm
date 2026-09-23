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
});
