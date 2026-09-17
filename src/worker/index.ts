import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { log, withContext } from "@/lib/logger";
import { QUEUE_NAMES, type IngestJobData, type ExecuteJobData, type ActionJobData, type WebhookDeliveryJobData } from "@/lib/queue";
import { processIngestJob } from "@/worker/ingest";
import { processExecuteJob } from "@/worker/execute";
import { processActionJob } from "@/worker/actions";
import { processWebhookDelivery } from "@/worker/webhooks";

// Background worker. Own process, own lifecycle — independent of Next.js.
//   npm run worker
//
// Graceful shutdown: stop accepting jobs, wait for active jobs, close.

const HEARTBEAT_KEY = "leonyx:worker:heartbeat";

const concurrency = env.WORKER_CONCURRENCY;
const workers = new Map<string, Worker>();

function makeWorker<T>(queueName: string, processor: (job: Job<T>) => Promise<unknown>): Worker<T> {
  const worker = new Worker<T>(
    queueName,
    async (job) => {
      await withContext({ jobId: job.id ?? "?", queue: queueName }, () => processor(job));
    },
    {
      connection: redis,
      prefix: env.QUEUE_PREFIX,
      concurrency,
      lockDuration: 60_000,
      maxStalledCount: 3,
    },
  );
  worker.on("failed", (job, err) => {
    log.error("job failed", { queue: queueName, jobId: job?.id, error: err.message });
  });
  worker.on("error", (err) => {
    log.error("worker error", { queue: queueName, error: err.message });
  });
  workers.set(queueName, worker);
  return worker;
}

async function heartbeat() {
  await redis.set(HEARTBEAT_KEY, String(Date.now()), "EX", 120).catch(() => undefined);
}

export async function startWorker(): Promise<void> {
  makeWorker<IngestJobData>(QUEUE_NAMES.ingest, (job) => processIngestJob(job.data));
  makeWorker<ExecuteJobData>(QUEUE_NAMES.execute, (job) => processExecuteJob(job.data));
  makeWorker<ActionJobData>(QUEUE_NAMES.actions, (job) => processActionJob(job.data));
  makeWorker<WebhookDeliveryJobData>(QUEUE_NAMES.webhooks, (job) => processWebhookDelivery(job.data));

  await heartbeat();
  setInterval(heartbeat, 30_000).unref();

  log.info("worker started", {
    queues: [...workers.keys()],
    concurrency,
    prefix: env.QUEUE_PREFIX,
  });
}

export async function stopWorker(): Promise<void> {
  log.info("worker shutting down…");
  const closing = [...workers.values()].map((w) =>
    w.close().catch((err) => log.error("worker close error", { error: err.message })),
  );
  await Promise.all(closing);
  await redis.set(HEARTBEAT_KEY, "", "EX", 1).catch(() => undefined);
  log.info("worker stopped");
}

// Entrypoint: `npm run worker`
if (require.main === module) {
  startWorker().catch((err) => {
    log.error("worker failed to start", { error: err.message });
    process.exit(1);
  });
  const shutdown = async () => {
    await stopWorker();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export async function workerHeartbeatAgeMs(): Promise<number | null> {
  const raw = await redis.get(HEARTBEAT_KEY);
  if (!raw) return null;
  return Date.now() - Number(raw);
}