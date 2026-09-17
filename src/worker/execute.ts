import type { ExecuteJobData } from "@/lib/queue";
import { createAndRunExecution } from "@/modules/engine/execute";
import { log } from "@/lib/logger";

export async function processExecuteJob(job: ExecuteJobData): Promise<void> {
  log.info("execute job started", { executionJob: true, automationId: job.automationId, workspaceId: job.workspaceId });
  await createAndRunExecution(job);
}