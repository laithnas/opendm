import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "@/lib/env";

// Structured JSON logger with request-scoped correlation ids.
//
// Usage:
//   log.info("job started", { jobId, executionId })
//
// Secrets are redacted by key name at the top level of the payload.

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Keys (case-insensitive, substring) never written to logs.
const SECRET_KEYS = [
  "token",
  "secret",
  "password",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "session",
  "encryptionkey",
  "signed",
  "signature",
  "x-hub",
];

const als = new AsyncLocalStorage<Record<string, string>>();

/** Set correlation fields for the remainder of this async context. */
export function withContext<T>(fields: Record<string, string>, fn: () => T): T {
  const parent = als.getStore() ?? {};
  return als.run({ ...parent, ...fields }, fn);
}

export function currentContext(): Record<string, string> {
  return als.getStore() ?? {};
}

function redact(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (SECRET_KEYS.some((k) => key.toLowerCase().includes(k))) {
      return value.length > 8 ? "[REDACTED]" : "***";
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, key));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redact(v, k);
    }
    return out;
  }
  return value;
}

function write(level: Level, message: string, fields?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[env.LOG_LEVEL]) return;
  const safeFields = redact(fields ?? {});
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...currentContext(),
    ...(safeFields && typeof safeFields === "object" ? (safeFields as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};