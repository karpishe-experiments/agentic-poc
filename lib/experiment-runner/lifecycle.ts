import { randomUUID } from "node:crypto";
import type { Database } from "@/db/client";
import { withMongoTransaction } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import type { BookletBinding } from "@/lib/experiment-runner/config";
import type { RuntimeResult, WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { operationSignal, remainingOperationMs, withOperationBudget } from "@/lib/operations/budget";
import { cancelOwnedControllers } from "@/lib/operations/controllers";

/** All callers inspect through the normal output verifier before considering stop. */
export function createOperationCoordinator(deps: {
  database: Database; runtime: WorkflowRuntime; now?: () => number;
  binding: (operation: ExperimentOperationDocument, run: ExperimentRunDocument) => BookletBinding;
  reconcile: (run: ExperimentRunDocument, operation: ExperimentOperationDocument, result: RuntimeResult) => Promise<void>;
  // Optional provider-specific proof, never a caller's terminal flag. This must
  // independently revalidate retained authenticated evidence and accounting.
  resolvedFailure?: (run: ExperimentRunDocument, operation: ExperimentOperationDocument) => Promise<boolean>;
}) {
  const now = deps.now ?? Date.now;
  const operations = deps.database.collections.experiment_operations;
  const runs = deps.database.collections.experiment_runs;

  type Inspection = { runId: string; operationId: string; expectedRevision?: number; stop?: "manual" | "deadline" };
  async function finishAttempt(input: Inspection) {
    return withMongoTransaction(deps.database, async (session) => {
      const operation = await operations.findOne({ _id: input.operationId, runId: input.runId }, { session });
      const run = await runs.findOne({ _id: input.runId }, { session });
      if (!operation || !run || run.activeOperationId && run.activeOperationId !== operation._id) {
        throw new ExperimentRepositoryError("conflict", "Operation ownership changed.");
      }
      const succeeded = operation.state === "succeeded" && !!operation.verifiedWorkflowId && run.safeFailure !== "definite_failure";
      const resolved = succeeded || operation.state === "failed" && operation.safeFailure === "definite_failure" &&
        (operation.dispatchStartedAtMs == null || operation.remoteStatus === "failed" || operation.remoteStatus === "stopped");
      const lifecycle = operation.lifecycle ?? { startedAtMs: operation.dispatchStartedAtMs ?? operation.createdAtMs,
        lastProgressAtMs: operation.updatedAtMs, ownerId: randomUUID(), phase: "finished" as const };
      const updated = await operations.findOneAndUpdate({ _id: operation._id, state: operation.state }, { $set: {
        lifecycle: { ...lifecycle, phase: "finished", attemptOutcome: succeeded && lifecycle.attemptOutcome !== "failed" ? "succeeded" : "failed",
          unresolved: !resolved, endedAtMs: lifecycle.endedAtMs ?? now(),
          ...(succeeded && lifecycle.attemptOutcome === "failed" ? { recoveredAtMs: lifecycle.recoveredAtMs ?? now() } : {}),
          ...(!resolved && input.stop === "deadline" ? { timeoutAtMs: lifecycle.timeoutAtMs ?? now() } : {}) },
      } }, { session, returnDocument: "after" });
      if (!resolved && run.status !== "completed" && run.status !== "failed") {
        await runs.updateOne({ _id: run._id, revision: run.revision }, { $set: {
          status: "blocked", pauseRequested: true, activeOperationId: operation._id,
          safeFailure: run.safeFailure === "definite_failure" ? "definite_failure" : "unknown_outcome",
          updatedAtMs: now(),
        }, $inc: { revision: 1 } }, { session });
      }
      return updated!;
    });
  }
  async function inspectWork(input: Inspection) {
    // Recovery gets a bounded observation window, not a renewed execution lease.
    return withOperationBudget(now() + 20_000, async () => {
      let run = await runs.findOne({ _id: input.runId });
      let operation = await operations.findOne({ _id: input.operationId, runId: input.runId });
      if (!run || !operation) throw new ExperimentRepositoryError("not_found", "Operation was not found.");
      if (input.expectedRevision !== undefined && run.revision !== input.expectedRevision) throw new ExperimentRepositoryError("stale_revision", "Run revision changed.");
      if (run.activeOperationId && run.activeOperationId !== operation._id) throw new ExperimentRepositoryError("conflict", "A different operation owns the run.");
      const binding = deps.binding(operation, run);
      const lookup = async (): Promise<RuntimeResult> => {
        try { return operation!.workflowRunId
          ? await deps.runtime.retrieve(binding, operation!.workflowRunId, { signal: operationSignal(), deadlineAtMs: now() + remainingOperationMs(10_000) })
          : { kind: "unknown" }; }
        catch { return { kind: "unknown" }; }
      };
      let observed = await lookup();
      if (observed.kind === "execution" && observed.execution.id === operation.workflowRunId && observed.execution.workflow_id === binding.publishedWorkflowId) {
        await operations.updateOne({ _id: operation._id, workflowRunId: observed.execution.id }, { $set: { remoteStatus: observed.execution.status } });
      }
      if (operation.dispatchStartedAtMs != null) await deps.reconcile(run, operation, observed);
      operation = (await operations.findOne({ _id: operation._id }))!;
      run = (await runs.findOne({ _id: run._id }))!;
      if (await deps.resolvedFailure?.(run, operation)) return operation;
      if (operation.localPreparationCancellation || operation.m4Continuation?.kind === "undispatched_text_v1") {
        throw new ExperimentRepositoryError("invalid_state", "Saved no-dispatch proof could not be verified.");
      }
      if (operation.state === "succeeded" && operation.verifiedWorkflowId && run.safeFailure !== "definite_failure") {
        return operation.lifecycle?.attemptOutcome === "failed" ? finishAttempt(input) : operation;
      }
      if (!input.stop) return operation;

      // Claim delivery before the HTTP call. A crash or lost response leaves
      // pending/unknown evidence and must never cause another blind stop POST.
      const stopClaim = await withMongoTransaction(deps.database, async (session) => {
        const current = await operations.findOne({ _id: operation!._id, runId: run!._id }, { session });
        const owner = await runs.findOne({ _id: run!._id }, { session });
        if (!current || !owner || (owner.activeOperationId && owner.activeOperationId !== current._id)) throw new ExperimentRepositoryError("conflict", "Operation ownership changed.");
        if (input.expectedRevision !== undefined && owner.revision !== run!.revision) throw new ExperimentRepositoryError("stale_revision", "Run revision changed before stop.");
        if (current.lifecycle?.stop || current.state === "succeeded" && current.verifiedWorkflowId && owner.safeFailure !== "definite_failure" ||
            current.state === "failed" && current.safeFailure === "definite_failure" && (current.dispatchStartedAtMs == null || current.remoteStatus === "failed" || current.remoteStatus === "stopped")) return false;
        const lifecycle = current.lifecycle ?? { startedAtMs: current.dispatchStartedAtMs ?? current.createdAtMs, lastProgressAtMs: current.updatedAtMs, ownerId: randomUUID(), phase: "reconciling" as const };
        await operations.updateOne({ _id: current._id, state: current.state }, { $set: { lifecycle: {
          ...lifecycle, phase: "reconciling", stop: { requestedAtMs: now(), reason: input.stop!, delivery: "pending" },
          ...(input.stop === "deadline" ? { timeoutAtMs: now() } : {}),
        } } }, { session });
        await runs.updateOne({ _id: owner._id, revision: owner.revision }, { $set: { pauseRequested: true }, $inc: { revision: 1 } }, { session });
        return true;
      });
      if (stopClaim) cancelOwnedControllers(run._id);
      if (stopClaim) {
        let delivery: "acknowledged" | "unknown" | "rejected" | "unsupported" = "unsupported";
        if (operation.workflowTaskId && deps.runtime.stop) {
          try { delivery = (await deps.runtime.stop(binding, { runId: run._id, taskId: operation.workflowTaskId }, { signal: operationSignal(), deadlineAtMs: now() + remainingOperationMs(5_000) })).kind; }
          catch { delivery = "unknown"; }
        }
        await operations.updateOne({ _id: operation._id, "lifecycle.stop.delivery": "pending" }, { $set: { "lifecycle.stop.delivery": delivery } });
      }
      observed = await lookup();
      if (observed.kind === "execution" && observed.execution.id === operation.workflowRunId && observed.execution.workflow_id === binding.publishedWorkflowId) {
        await operations.updateOne({ _id: operation._id, workflowRunId: observed.execution.id }, { $set: { remoteStatus: observed.execution.status } });
      }
      operation = (await operations.findOne({ _id: operation._id }))!;
      run = (await runs.findOne({ _id: run._id }))!;
      if (operation.dispatchStartedAtMs != null) await deps.reconcile(run, operation, observed);
      operation = (await operations.findOne({ _id: operation._id }))!;
      run = (await runs.findOne({ _id: run._id }))!;
      if (await deps.resolvedFailure?.(run, operation)) return operation;
      // Do not turn an unavailable provider or a callback conflict into proof of
      // failure. Attempt failure is separate from recoverable operation state.
      return finishAttempt(input);
    }, { now });
  }
  async function inspect(input: Inspection) {
    return withOperationBudget(now() + 30_000, async () => {
      try { return await inspectWork(input); }
      catch (error) {
        if (!input.stop || error instanceof ExperimentRepositoryError) throw error;
        // Leave ten seconds for a truthful durable outcome when observation or
        // cancellation failed. Never erase identities or a saved completion.
        const retained = await withMongoTransaction(deps.database, async (session) => {
          const operation = await operations.findOne({ _id: input.operationId, runId: input.runId }, { session });
          const run = await runs.findOne({ _id: input.runId }, { session });
          if (!operation || !run || run.activeOperationId && run.activeOperationId !== operation._id ||
              input.expectedRevision !== undefined && run.revision !== input.expectedRevision && !operation.lifecycle?.stop) throw error;
          return operation;
        });
        if (!retained || retained.localPreparationCancellation || retained.m4Continuation?.kind === "undispatched_text_v1") throw error;
        return finishAttempt(input);
      }
    }, { now });
  }
  return { inspect };
}
