import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

// Boundary cryptography helpers.
//  - encryptSecret/decryptSecret: AES-256-GCM for provider tokens at rest.
//  - sha256: one-way hashing for session tokens and IP addresses.

function keyBytes(): Buffer {
  // Accepts base64 or raw 32-byte values; derives a fixed 32-byte key.
  const raw = env.ENCRYPTION_KEY;
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) buf = Buffer.from(raw, "utf8");
  } catch {
    buf = Buffer.from(raw, "utf8");
  }
  if (buf.length < 32) return createHash("sha256").update(buf).digest();
  return buf.subarray(0, 32);
}

const KEY = keyBytes();

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Unsupported encrypted payload format");
  }
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Hash a client IP for storage (privacy: no raw IPs kept). */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return sha256(`${ip}:${env.SESSION_SECRET}`).slice(0, 32);
}