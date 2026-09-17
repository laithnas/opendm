import { env } from "@/lib/env";
import { log } from "@/lib/logger";

// Outbound HTTP with timeout, size caps and never-logged bodies.

export interface HttpResult {
  ok: boolean;
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface HttpOptions {
  timeoutMs?: number;
  maxBodyBytes?: number;
  headers?: Record<string, string>;
  redirect?: "follow" | "manual";
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BODY = 256 * 1024;

export async function httpFetch(
  url: string,
  init: RequestInit & { body?: BodyInit | null },
  opts: HttpOptions = {},
): Promise<HttpResult> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxBodyBytes = DEFAULT_MAX_BODY } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: opts.redirect ?? "follow",
    });
    const raw = await res.arrayBuffer();
    const body = Buffer.from(raw).subarray(0, maxBodyBytes).toString("utf8");
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return { ok: res.ok, status: res.status, body, headers };
  } catch (err) {
    log.warn("http fetch failed", { url, error: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}