import { createDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { GenerationService } from "@/lib/application/generation-service";

const RUNNER_STATE = Symbol.for("kids-booklet-poc.job-runner");

type RunnerState = { promise: Promise<void> };

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runLoop(): Promise<void> {
  const database = createDatabase();
  const repositories = createRepositories(database);
  await repositories.conversation.recoverInterruptedFollowups();
  await repositories.jobs.recoverInterrupted();
  const generation = new GenerationService({ database, repositories });

  for (;;) {
    const jobs = await repositories.jobs.listRunnable();
    for (const job of jobs) {
      if (job.jobType === "references") await generation.runReferenceJob(job.bookletId, job.id);
      if (job.jobType === "pages") await generation.runPageJob(job.bookletId, job.id);
    }
    await delay(jobs.length ? 25 : 500);
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
