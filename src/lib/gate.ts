// Shared with src/middleware.ts (edge runtime) and the /api/gate route (node
// runtime) — Web Crypto's `crypto.subtle` is available in both, unlike
// Node's `crypto` module, which the edge runtime doesn't have.

export async function hashGateToken(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
