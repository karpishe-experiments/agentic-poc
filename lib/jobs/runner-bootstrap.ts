import { getDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { AgentRunService } from "@/lib/application/agent-run-service";
import { ImageAgentRunService } from "@/lib/application/image-agent-run-service";
import { GenerationService } from "@/lib/application/generation-service";
import { describeGenerationError, createGenerationDiagnostics } from "@/lib/jobs/generation-diagnostics";
import { readDeploymentControl } from "@/lib/application/deployment-control";

const RUNNER_STATE = Symbol.for("kids-booklet-poc.job-runner");

type RunnerState = { promise: Promise<void>; started: boolean; initialized: boolean; recovered: boolean; heartbeatAtMs: number; fatalError: string | null };

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runLoop(): Promise<void> {
  const database = getDatabase();
  const repositories = createRepositories(database);
  const diagnostics = createGenerationDiagnostics();
  await diagnostics.record({ event: "runner_started" });
  const state = (globalThis as typeof globalThis & { [RUNNER_STATE]?: RunnerState })[RUNNER_STATE];
  let control = await readDeploymentControl();
  if (state) state.initialized = true;
  while (control.maintenance) { if (state) state.heartbeatAtMs = Date.now(); await delay(500); control = await readDeploymentControl(); }
  await repositories.conversation.recoverInterruptedFollowups();
  const generation = new GenerationService({ database, repositories, diagnostics });
  const recoveredTextExecutions = await new AgentRunService({ repositories }).recoverInterrupted();
  const recoveredImageExecutions = await new ImageAgentRunService({
    repositories,
    onMaterialized: async (ready, bookletId) => {
      if (ready.target === "reference") await generation.runReferenceJob(bookletId, ready.jobId);
      else await generation.runPageJob(bookletId, ready.jobId);
    },
  }).recoverInterrupted();
  const recoveredItems = await repositories.jobs.recoverInterrupted();
  if (state) state.recovered = true;
  await diagnostics.record({ event: "runner_recovered_interrupted_work", recoveredItems, recoveredExecutionBatches: recoveredTextExecutions.length + recoveredImageExecutions.length });

  for (;;) {
    try {
      const state = globalThis as typeof globalThis & { [RUNNER_STATE]?: RunnerState };
      if (state[RUNNER_STATE]) state[RUNNER_STATE].heartbeatAtMs = Date.now();
      if ((await readDeploymentControl()).maintenance) { await delay(500); continue; }
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
    state[RUNNER_STATE] = { promise: Promise.resolve(), started: true, initialized: true, recovered: true, heartbeatAtMs: Date.now(), fatalError: null };
    return true;
  }
  const runner: RunnerState = { promise: Promise.resolve(), started: true, initialized: false, recovered: false, heartbeatAtMs: Date.now(), fatalError: null };
  runner.promise = runLoop().catch((error) => {
    runner.fatalError = describeGenerationError(error).message;
    console.error("Kids Booklet job runner stopped:", error);
  });
  state[RUNNER_STATE] = runner;
  return true;
}

export function getRunnerStatus() {
  const state = (globalThis as typeof globalThis & { [RUNNER_STATE]?: RunnerState })[RUNNER_STATE];
  return { started: Boolean(state?.started), initialized: Boolean(state?.initialized), recovered: Boolean(state?.recovered), heartbeatAtMs: state?.heartbeatAtMs ?? null, fatalError: state?.fatalError ?? null };
}
