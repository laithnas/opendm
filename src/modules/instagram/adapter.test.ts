import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProviderCtx } from "@/modules/providers/types";

const httpFetch = vi.fn();
vi.mock("@/lib/http", () => ({ httpFetch: (...a: unknown[]) => httpFetch(...a) }));

import { InstagramProvider } from "@/modules/instagram/adapter";

const ctx = {
  connection: { externalAccountId: "17841400000000000", username: "leonyxai" },
  accessToken: "tok",
  apiVersion: "v21.0",
} as unknown as ProviderCtx;

const sentBody = () => JSON.parse((httpFetch.mock.calls[0]![1] as { body: string }).body);
const ok = (body: unknown) => ({ status: 200, body: JSON.stringify(body) });

describe("InstagramProvider", () => {
  beforeEach(() => httpFetch.mockReset());

  it("sends comment private replies with recipient.comment_id", async () => {
    httpFetch.mockResolvedValue(ok({ message_id: "m1" }));
    await new InstagramProvider().sendDm(ctx, { externalId: "user-1", commentId: "c-9" }, { text: "hi" });
    const sent = sentBody();
    expect(sent.recipient).toEqual({ comment_id: "c-9" });
  });

  it("falls back to recipient.id without a comment id", async () => {
    httpFetch.mockResolvedValue(ok({ message_id: "m1" }));
    await new InstagramProvider().sendDm(ctx, { externalId: "user-1" }, { text: "hi" });
    const sent = sentBody();
    expect(sent.recipient).toEqual({ id: "user-1" });
  });

  it("flags comments the account already replied to", async () => {
    httpFetch.mockResolvedValue(
      ok({
        data: [
          { id: "c1", text: "Jev", username: "a", from: { id: "1" }, replies: { data: [{ id: "r1", username: "LeonyxAI" }] } },
          { id: "c2", text: "Jev", username: "b", from: { id: "2" } },
        ],
      }),
    );
    const rows = await new InstagramProvider().listComments(ctx, "media-1", { limit: 10 });
    expect(rows.map((r) => [r.id, r.repliedByOwner])).toEqual([["c1", true], ["c2", false]]);
  });

  it("follows paging.next until the limit", async () => {
    httpFetch
      .mockResolvedValueOnce(ok({ data: [{ id: "m1" }, { id: "m2" }], paging: { next: "https://graph.facebook.com/next" } }))
      .mockResolvedValueOnce(ok({ data: [{ id: "m3" }] }));
    const rows = await new InstagramProvider().listMedia(ctx, { limit: 10 });
    expect(rows.map((r) => r.id)).toEqual(["m1", "m2", "m3"]);
    expect(httpFetch).toHaveBeenCalledTimes(2);
  });

  it("subscribes the account to comments+messages webhooks", async () => {
    httpFetch.mockResolvedValue(ok({ success: true }));
    const result = await new InstagramProvider().subscribeToWebhooks!(ctx);
    expect(httpFetch.mock.calls[0]![0]).toContain("me/subscribed_apps");
    expect(sentBody().subscribed_fields).toBe("comments,messages");
    expect(result).toEqual({ subscribed: ["comments", "messages"] });
  });

  it("throws when Meta doesn't confirm the subscription", async () => {
    httpFetch.mockResolvedValue(ok({ success: false }));
    await expect(new InstagramProvider().subscribeToWebhooks!(ctx)).rejects.toThrow(/not confirmed/);
  });
});
