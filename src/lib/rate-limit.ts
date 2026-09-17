import { redis } from "@/lib/redis";

// Small sliding-window rate limiter on Redis for non-queue paths
// (auth endpoints, webhook APIs). Queue-based account limits live in BullMQ.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
}

const WINDOW_MS = 60_000;

export async function rateLimit(
  key: string,
  max: number,
  windowMs = WINDOW_MS,
): Promise<RateLimitResult> {
  const now = Date.now();
  const rk = `rl:${key}:${Math.floor(now / windowMs)}`;
  const count = await redis.incr(rk);
  if (count === 1) await redis.expire(rk, Math.ceil(windowMs / 1000));
  const resetAt = (Math.floor(now / windowMs) + 1) * windowMs;
  return {
    allowed: count <= max,
    remaining: Math.max(0, max - count),
    resetAtMs: resetAt,
  };
}

export function rateLimitKey(scope: string, subject: string, extra = ""): string {
  return `${scope}:${subject}:${extra}`;
}

// Unit-testable pure decision (used by the queue monitor endpoint).
export function isRateLimited(result: RateLimitResult): boolean {
  return !result.allowed;
}