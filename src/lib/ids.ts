import { randomBytes, randomUUID } from "node:crypto";

export const newId = () => randomUUID();

/** URL-safe random code (magic links, invites). */
export function randomCode(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** Short non-guessable slug for tracked links (10 chars ≈ 60 bits). */
export function newSlug(size = 10): string {
  return randomBytes(size).toString("base64url").replace(/-/g, "a").replace(/_/g, "b");
}