import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pingRedis } from "@/lib/redis";
import { workerHeartbeatAgeMs } from "@/worker/index";
import { log } from "@/lib/logger";

// Health endpoints. Public but reveal only operational state.

export const runtime = "nodejs";

export async function GET() {
  const [dbOk, redisOk] = await Promise.all([
    checkDb(),
    pingRedis(),
  ]);
  const workerAge = await workerHeartbeatEnabled();

  const healthy = dbOk && redisOk;
  return NextResponse.json(
    {
      ok: healthy,
      app: "ok",
      db: dbOk ? "ok" : "error",
      redis: redisOk ? "ok" : "error",
      worker: workerAge === null ? "down" : workerAge < 90_000 ? "ok" : "stale",
      workerAgeMs: workerAge,
      ts: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}

async function checkDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    log.error("health db check failed", { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

async function workerHeartbeatEnabled(): Promise<number | null> {
  try {
    return workerHeartbeatAgeMs();
  } catch {
    return null;
  }
}