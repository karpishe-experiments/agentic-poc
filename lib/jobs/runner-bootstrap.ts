import { getDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { GenerationService } from "@/lib/application/generation-service";
import { getServerEnv, resolveDataRoot } from "@/lib/config/env";
import { describeGenerationError, GenerationDiagnostics } from "@/lib/jobs/generation-diagnostics";

const RUNNER_STATE = Symbol.for("kids-booklet-poc.job-runner");

type RunnerState = { promise: Promise<void> };

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runLoop(): Promise<void> {
  const database = getDatabase();
  const repositories = createRepositories(database);
  const diagnostics = new GenerationDiagnostics(resolveDataRoot(getServerEnv()));
  await diagnostics.record({ event: "runner_started" });
  await repositories.conversation.recoverInterruptedFollowups();
  const recoveredItems = await repositories.jobs.recoverInterrupted();
  await diagnostics.record({ event: "runner_recovered_interrupted_work", recoveredItems });
  const generation = new GenerationService({ database, repositories, diagnostics });

  for (;;) {
    try {
      const jobs = await repositories.jobs.listRunnable();
      for (const job of jobs) {
        await diagnostics.record({ event: "runner_job_started", bookletId: job.bookletId, jobId: job.id });
        try {
          if (job.jobType === "references") await generation.runReferenceJob(job.bookletId, job.id);
          if (job.jobType === "pages") await generation.runPageJob(job.bookletId, job.id);
        } catch (error) {
          await diagnostics.record({ event: "runner_job_failed", bookletId: job.bookletId, jobId: job.id, error: describeGenerationError(error) });
        }
      }
      await delay(jobs.length ? 25 : 500);
    } catch (error) {
      await diagnostics.record({ event: "runner_cycle_failed", error: describeGenerationError(error) });
      await delay(500);
    }
  }
}

export function ensureRunnerStarted(): boolean {
  const state = globalThis as typeof globalThis & { [RUNNER_STATE]?: RunnerState };
  if (state[RUNNER_STATE]) return false;
  if (process.env.VITEST) {
    state[RUNNER_STATE] = { promise: Promise.resolve() };
    return true;
  }
  state[RUNNER_STATE] = { promise: runLoop().catch((error) => {
    console.error("Kids Booklet job runner stopped:", error);
  }) };
  return true;
}
