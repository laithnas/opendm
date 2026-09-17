import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { verifyHubSignature } from "@/lib/security";
import { log } from "@/lib/logger";
import { queues, type IngestJobData } from "@/lib/queue";

export const runtime = "nodejs";

// Meta Instagram webhook endpoint.
//
// GET  — subscription verification (hub.challenge)
// POST — event delivery; verified by X-Hub-Signature-256, then queued.
//        Returns 200 immediately; all work happens in the worker.

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === env.META_VERIFY_TOKEN && challenge) {
    log.info("instagram webhook verified");
    return new Response(challenge, { status: 200 });
  }
  return new Response("Verification failed", { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!env.META_APP_SECRET) {
    log.warn("instagram webhook received but META_APP_SECRET is not configured — ignoring");
    return new Response("Not configured", { status: 200 });
  }
  if (!verifyHubSignature(env.META_APP_SECRET, rawBody, signature)) {
    log.warn("instagram webhook signature mismatch", {
      signaturePresent: Boolean(signature),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  await queues.ingest.add(
    "instagram",
    {
      provider: "instagram",
      payload,
      receivedAt: new Date().toISOString(),
    } satisfies IngestJobData,
    {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 2000,
    },
  );

  log.info("instagram webhook queued");
  return new Response("OK", { status: 200 });
}