import { describe, it, expect } from "vitest";
import { verifyHmac, hmacSha256, verifyHubSignature, verifyCsrf, safeRedirect } from "@/lib/security";

describe("HMAC signing (outbound webhooks)", () => {
  const secret = "s3cret-value";
  const body = JSON.stringify({ event: "execution.completed", id: "x" });

  it("produces a stable signature", () => {
    expect(hmacSha256(secret, body)).toBe(hmacSha256(secret, body));
    expect(hmacSha256(secret, body)).toHaveLength(64);
  });

  it("verifies a valid signature", () => {
    expect(verifyHmac(secret, body, hmacSha256(secret, body))).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = hmacSha256(secret, body);
    expect(verifyHmac(secret, body + "x", sig)).toBe(false);
  });

  it("rejects a signature from a different secret", () => {
    expect(verifyHmac("other-secret", body, hmacSha256(secret, body))).toBe(false);
  });

  it("rejects wrong-length signatures without throwing", () => {
    expect(verifyHmac(secret, body, "short")).toBe(false);
    expect(verifyHmac(secret, body, "")).toBe(false);
  });
});

describe("Meta hub signature (X-Hub-Signature-256)", () => {
  it("verifies the sha256= prefix format", () => {
    const appSecret = "app-secret";
    const body = '{"entry":[]}';
    const expected = "sha256=" + hmacSha256(appSecret, body);
    expect(verifyHubSignature(appSecret, body, expected)).toBe(true);
  });

  it("rejects a missing header and a wrong body", () => {
    const appSecret = "app-secret";
    const body = '{"entry":[]}';
    expect(verifyHubSignature(appSecret, body, null)).toBe(false);
    expect(verifyHubSignature(appSecret, body, "sha256=" + hmacSha256(appSecret, '{"entry":[1]}'))).toBe(false);
  });
});

describe("CSRF token pairing", () => {
  it("accepts a matching cookie/header pair", () => {
    expect(verifyCsrf("tok-123", "tok-123")).toBe(true);
  });

  it("rejects mismatches and empties", () => {
    expect(verifyCsrf("tok-123", "tok-124")).toBe(false);
    expect(verifyCsrf(undefined, "tok-123")).toBe(false);
    expect(verifyCsrf("tok-123", null)).toBe(false);
  });
});

describe("safeRedirect", () => {
  it("keeps same-origin paths", () => {
    process.env.APP_URL = "http://localhost:3000";
    expect(safeRedirect("/app/onboarding", "/app")).toBe("/app/onboarding");
    expect(safeRedirect(null, "/app")).toBe("/app");
    expect(safeRedirect("", "/app")).toBe("/app");
  });

  it("falls back for cross-origin targets (open redirect protection)", () => {
    process.env.APP_URL = "http://localhost:3000";
    expect(safeRedirect("https://evil.example.com", "/app")).toBe("/app");
    expect(safeRedirect("https://evil.example.com/phish", "/app")).toBe("/app");
  });
});