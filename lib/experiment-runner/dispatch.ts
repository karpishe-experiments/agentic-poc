import { createHash, randomUUID } from "node:crypto";
import type { Database } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { configurationSnapshot, selectBinding, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { createWorkflowRuntime, runtimeCompletion, type RuntimeResult, type WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { runTrackedMutation } from "@/lib/application/deployment-control";
import { configuredNarrativeTasks, currentApprovedSourceIds, isNarrativeTask, type NarrativeTask } from "@/lib/experiment-runner/narrative-tasks";

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
function fingerprint(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }

export function createExperimentDispatcher(deps: {
  database: Database; config: BookletRunnerConfig; runtime?: WorkflowRuntime;
  mutate?: typeof runTrackedMutation; now?: () => number;
}) {
  const repository = createExperimentRepository(deps.database);
  const context = createExperimentContextService(deps.database);
  const runtime = deps.runtime ?? createWorkflowRuntime(deps.config);
  const mutate = deps.mutate ?? runTrackedMutation;
  const now = deps.now ?? Date.now;

  async function observeProgress(runId: string, operation: ExperimentOperationDocument) {
    if (operation.state !== "succeeded") return;
    const view = await context.getRunView(runId);
    if (!view) return;
    await repository.recordProgress({ runId, operationId: operation._id, nowMs: now(), fingerprint64: fingerprint({
      artifacts: view.currentArtifacts.map(({ id, state, currentVersionId, versions }) => ({ id, state, currentVersionId, approvals: versions.map((version) => version.approval?.id ?? null) })),
      delegation: view.activeDelegation?.id ?? null, pending: view.pendingDecision, messages: view.creatorMessages.map((message) => message.id),
    }) });
  }

  async function reconcile(run: ExperimentRunDocument, operation: ExperimentOperationDocument, result: RuntimeResult) {
    const identity = { runId: run._id, operationId: operation._id, parentWorkflowRunId: operation.parentWorkflowRunId, nowMs: now() };
    const current = await repository.getOperation(operation._id);
    if (!current) return;
    const binding = selectBinding(deps.config, operation.role as "manager" | "specialist" | "tester", operation.taskId as NarrativeTask | null, run.persona);
    if (result.kind === "execution") {
      const execution = result.execution;
      if (execution.workflow_id !== binding.publishedWorkflowId || (current.workflowRunId && current.workflowRunId !== execution.id)) {
        await repository.blockRun({ runId: run._id, category: "definite_failure", nowMs: now() });
        return;
      }
      await repository.recordDispatchIdentity({ ...identity, workflowRunId: execution.id });
      await repository.verifyDispatchPublication({ ...identity, workflowRunId: execution.id, workflowId: execution.workflow_id });
      const completion = runtimeCompletion(execution);
      if (completion) {
        if (completion.runId !== run._id || completion.operationId !== operation._id || completion.workflowRunId !== execution.id || completion.parentWorkflowRunId !== operation.parentWorkflowRunId || completion.inputFingerprint !== operation.inputFingerprint) {
          await repository.blockRun({ runId: run._id, category: "definite_failure", nowMs: now() });
          return;
        }
        await repository.completeOperation({ envelope: { runId: completion.runId, operationId: completion.operationId, workflowRunId: completion.workflowRunId, inputFingerprint: completion.inputFingerprint, result: completion.result }, parentWorkflowRunId: completion.parentWorkflowRunId, nowMs: now() });
      } else if (current.state !== "succeeded") {
        if (execution.status === "succeeded" && execution.outputs?.authorization_reason === "paused" && current.reservationCount === 0) {
          await repository.recordDispatchOutcome({ ...identity, category: "paused" });
        } else if (execution.status === "failed" || execution.status === "stopped") {
          await repository.recordDispatchOutcome({ ...identity, category: "definite_failure" });
        } else if (execution.status !== "running" || now() >= (current.deadlineAtMs ?? (current.dispatchStartedAtMs ?? now()) + 600_000)) {
          await repository.recordDispatchOutcome({ ...identity, category: "unknown_outcome" });
        }
      }
    } else if (current.state !== "succeeded") {
      await repository.recordDispatchOutcome({ ...identity, category: result.kind === "rejected" && current.reservationCount === 0 ? "definite_failure" : "unknown_outcome" });
    } else if (!current.verifiedWorkflowId) {
      const recovered = current.workflowRunId ? await runtime.retrieve(binding, current.workflowRunId) : { kind: "unknown" as const };
      if (recovered.kind === "execution") await reconcile(run, current, recovered);
      else await repository.blockRun({ runId: run._id, category: "unknown_outcome", nowMs: now() });
      return;
    }
    const saved = await repository.getOperation(operation._id);
    if (saved) await observeProgress(run._id, saved);
  }

  async function advance(runId: string): Promise<"advanced" | "waiting" | "boundary" | "blocked"> {
    return mutate(async () => {
      let run = await repository.getRun(runId);
      if (!run || run.mode !== "simulated" || run.status === "completed" || run.status === "failed") return "blocked";
      // Completed slice evidence remains complete after a newer suite is bound.
      // This is a saved-state read, not permission to execute an old publication.
      if (!run.activeOperationId && run.status !== "blocked") {
        const savedView = await context.getRunView(runId);
        if (savedView?.nextNarrativeTask === "slice_complete") {
          const last = (await repository.listOperations(runId)).at(-1);
          if (last?.state === "succeeded" && last.verifiedWorkflowId && run.progressOperationId === last._id) return "boundary";
        }
      }
      const expected = configurationSnapshot(deps.config, run.persona);
      if (canonical(expected) !== run.configurationJson) {
        await repository.blockRun({ runId, category: "definite_failure", nowMs: now() });
        return "blocked";
      }
      let operation = run.activeOperationId ? await repository.getOperation(run.activeOperationId) : null;
      if (operation?.dispatchStartedAtMs != null) {
        const binding = selectBinding(deps.config, operation.role as "manager" | "specialist" | "tester", operation.taskId as NarrativeTask | null, run.persona);
        // A retained ID is the only read-back path. Never POST after the marker.
        await reconcile(run, operation, operation.workflowRunId ? await runtime.retrieve(binding, operation.workflowRunId) : { kind: "unknown" });
        return "waiting";
      }
      if (run.pauseRequested || run.status === "paused") return "waiting";
      if (run.status === "blocked") return "blocked";
      let parentWorkflowRunId: string | null = null;
      if (!operation) {
        const latest = (await repository.listOperations(runId)).at(-1);
        if (latest?.state === "succeeded" && !latest.verifiedWorkflowId) {
          const binding = selectBinding(deps.config, latest.role as "manager" | "specialist" | "tester", latest.taskId as NarrativeTask | null, run.persona);
          await reconcile(run, latest, latest.workflowRunId ? await runtime.retrieve(binding, latest.workflowRunId) : { kind: "unknown" });
          run = (await repository.getRun(runId))!;
          if (run.status === "blocked") return "blocked";
        }
        if (latest?.state === "succeeded" && run.progressOperationId !== latest._id) {
          await observeProgress(runId, latest);
          run = (await repository.getRun(runId))!;
          if (run.status === "blocked") return "blocked";
        }
        const view = await context.getRunView(runId);
        if (!view || !view.nextNarrativeTask) return "waiting";
        if (view.nextNarrativeTask === "slice_complete") return "boundary";
        const history = await repository.listOperations(runId);
        const last = history.at(-1);
        const initialDelegation = run.persona !== "professional_creator" && history.length === 0;
        let role: "manager" | "specialist" | "tester" = view.nextNarrativeTask === "tester" || initialDelegation ? "tester" : "manager";
        let taskId: NarrativeTask | null = null;
        if (!initialDelegation && view.nextNarrativeTask !== "tester" && last?.state === "succeeded" && last.role === "manager") {
          const result = JSON.parse(last.resultJson ?? "null") as { kind?: string; payload?: { taskId?: string } } | null;
          const delegated = result?.payload?.taskId;
          const target = view.currentArtifacts.find((item) => item.taskId === delegated);
          const pending = view.pendingDecision as { kind?: string; taskId?: string; artifactVersionId?: string } | null;
          const matchingRevision = pending?.kind === "revision" && pending.taskId === delegated && pending.artifactVersionId === target?.currentVersionId;
          // Both siblings can be ready. Honor the saved manager choice rather
          // than forcing the projection's deterministic display order.
          if (result?.kind === "delegate" && isNarrativeTask(delegated) && configuredNarrativeTasks(run.configurationJson).includes(delegated) &&
              currentApprovedSourceIds(delegated, view.currentArtifacts) !== null && (!pending || matchingRevision) &&
              (!target || target.state === "needs_review" || matchingRevision)) {
            role = "specialist"; taskId = delegated; parentWorkflowRunId = last.workflowRunId;
          }
        }
        operation = await repository.prepareOperation({ runId, operationId: randomUUID(), expectedRevision: run.revision, role, taskId, subjectKind: "book", subjectId: run.bookletId, inputFingerprint: fingerprint({ revision: run.revision, role, taskId, view }), attempt: 1, providerKind: "text", nowMs: now() });
      } else {
        // Before the marker a prepared specialist still needs its saved manager parent.
        if (operation.role === "specialist") {
          const history = await repository.listOperations(runId);
          parentWorkflowRunId = history.filter((item) => item.role === "manager" && item.state === "succeeded").at(-1)?.workflowRunId ?? null;
        }
      }
      const admission = await repository.beginDispatch({ runId, operationId: operation._id, parentWorkflowRunId, nowMs: now() });
      if (!admission.dispatched) return "waiting";
      operation = admission.operation;
      const binding = selectBinding(deps.config, operation.role as "manager" | "specialist" | "tester", operation.taskId as NarrativeTask | null, run.persona);
      await reconcile(run, operation, await runtime.start(binding, { runId, operationId: operation._id, parentWorkflowRunId, mode: "simulated" }));
      return "advanced";
    });
  }

  async function cycle() {
    const runs = (await repository.listRuns()).reverse();
    // Reconcile retained workflow IDs before admitting another persona's POST.
    for (const run of runs) {
      if (run.status === "blocked" && run.safeFailure !== "unknown_outcome") continue;
      if (!run.activeOperationId) continue;
      const operation = await repository.getOperation(run.activeOperationId);
      if (!operation?.workflowRunId || operation.dispatchStartedAtMs == null ||
          now() >= (operation.deadlineAtMs ?? operation.dispatchStartedAtMs + 600_000)) continue;
      await advance(run._id);
      const currentRun = await repository.getRun(run._id);
      const current = currentRun?.activeOperationId ? await repository.getOperation(currentRun.activeOperationId) : null;
      if (current?.workflowRunId && current.dispatchStartedAtMs != null &&
          now() < (current.deadlineAtMs ?? current.dispatchStartedAtMs + 600_000)) return "waiting" as const;
    }
    for (const run of runs) {
      if (run.status === "completed" || run.status === "failed" || (run.status === "paused" && !run.activeOperationId)) continue;
      if (run.status === "blocked" && (run.safeFailure !== "unknown_outcome" || !run.activeOperationId)) continue;
      if (run.status === "blocked" && run.activeOperationId && !(await repository.getOperation(run.activeOperationId))?.workflowRunId) continue;
      if (run.status === "blocked" && run.activeOperationId) {
        const operation = await repository.getOperation(run.activeOperationId);
        if (operation && now() >= (operation.deadlineAtMs ?? (operation.dispatchStartedAtMs ?? now()) + 600_000)) continue;
      }
      const outcome = await advance(run._id);
      if (outcome === "advanced") return outcome;
    }
    return "idle" as const;
  }
  return { advance, cycle };
}
