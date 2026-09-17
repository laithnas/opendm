import { describe, it, expect } from "vitest";
import { messagingWindowVerdict } from "@/modules/inbox/service";

describe("messaging window (Instagram rule)", () => {
  const now = new Date("2026-01-15T12:00:00Z");

  it("allows when there is no prior inbound message", () => {
    expect(messagingWindowVerdict(null, now).allowed).toBe(true);
    expect(messagingWindowVerdict(undefined, now).allowed).toBe(true);
  });

  it("allows inside the 7-day window", () => {
    const inbound = new Date("2026-01-14T12:00:00Z"); // 24h ago
    expect(messagingWindowVerdict(inbound, now).allowed).toBe(true);
  });

  it("blocks outside the 7-day window with a clear reason", () => {
    const inbound = new Date("2026-01-01T12:00:00Z"); // 14 days ago
    const v = messagingWindowVerdict(inbound, now);
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain("messaging window");
  });

  it("treats exactly 168 hours as inside the window", () => {
    const inbound = new Date(now.getTime() - 168 * 60 * 60 * 1000);
    expect(messagingWindowVerdict(inbound, now).allowed).toBe(true);
  });
});