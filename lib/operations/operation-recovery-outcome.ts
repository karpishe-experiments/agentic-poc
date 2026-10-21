import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";

// Role support is not authority. Every caller must still require an exact grant
// and retained authenticated evidence before any completion mutation.
export function isCompletionRecoveryRole(op: Pick<ExperimentOperationDocument, "role" | "taskId">): boolean {
  return op.role === "specialist" && op.taskId === "J11" || op.role === "manager" && op.taskId === null;
}

export type OperationRecoveryCode = "saved_result" | "explicit_continuation_required" | "inspect_existing_execution"
  | "unresolved_identity" | "reviewed_completion_recovery_required" | "existing_stop_reconciliation_pending" | "conflicting_evidence";
export type OperationRecoveryOutcome = {
  code: OperationRecoveryCode;
  providerReplayAllowed: false;
  continuationAuthorized: false;
};

/** A diagnostic next step, never authority to retry, resume, release charges or edit saved results. */
export function operationRecoveryOutcome(input: {
  run: ExperimentRunDocument | null;
  operation: ExperimentOperationDocument | null;
  completionRecoveries?: readonly { runId: string; operationId: string }[];
}): OperationRecoveryOutcome {
  const { run, operation: op } = input;
  const result = (code: OperationRecoveryCode): OperationRecoveryOutcome => ({ code, providerReplayAllowed: false, continuationAuthorized: false });
  if (!run || !op || op.runId !== run._id) return result("unresolved_identity");
  const claimed = Boolean(op.authorizationClaim || op.resultFinalizationClaim || op.imageCompletionClaim);
  const saved = Boolean(op.resultJson || op.materializationJson || op.m4CompletionRecovery);
  const contradictory = (saved && (op.state !== "succeeded" || claimed || op.lifecycle?.unresolved === true
    || op.remoteStatus === "failed" || op.remoteStatus === "stopped" || Boolean(op.safeFailure)))
    || (op.m4Observation?.remoteStatus === "succeeded" && (op.remoteStatus === "failed" || op.remoteStatus === "stopped"));
  if (contradictory) return result("conflicting_evidence");
  if (op.state === "succeeded" && op.resultJson && op.materializationJson && op.verifiedWorkflowId
    && op.lifecycle?.unresolved === false && !claimed && run.activeOperationId !== op._id) return result("saved_result");
  if (op.state === "failed" && op.lifecycle?.unresolved === false && !claimed && !saved && run.activeOperationId !== op._id) {
    return result("explicit_continuation_required");
  }
  if (op.workflowRunId && op.remoteStatus === "stopped" && op.lifecycle?.stop && !saved) return result("existing_stop_reconciliation_pending");
  const observation = op.m4Observation;
  const exactGrant = input.completionRecoveries?.filter((grant) => grant.runId === run._id && grant.operationId === op._id).length === 1;
  if (run.mode === "balanced" && run.status === "blocked" && run.safeFailure === "definite_failure" && run.activeOperationId === op._id
    && op.mode === "balanced" && isCompletionRecoveryRole(op) && op.providerKind === "text" && op.state === "started"
    && !claimed && !saved && !op.lifecycle?.stop && exactGrant && op.workflowRunId && op.verifiedWorkflowId
    && observation?.remoteStatus === "succeeded" && observation.issue === null && observation.wrapperDigest && observation.evidenceDigest
    && observation.workflowRunId === op.workflowRunId && observation.publishedWorkflowId === op.verifiedWorkflowId && op.m4Preparation?.requestDigest) {
    return result("reviewed_completion_recovery_required");
  }
  return result(op.workflowRunId ? "inspect_existing_execution" : "unresolved_identity");
}
