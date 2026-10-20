import { describe, expect, it } from "vitest";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { operationRecoveryOutcome } from "@/lib/operations/operation-recovery-outcome";

function fixture() {
  const run = { _id: "run", mode: "balanced", status: "blocked", safeFailure: "definite_failure", activeOperationId: "op" } as ExperimentRunDocument;
  const operation = { _id: "op", runId: "run", mode: "balanced", role: "specialist", taskId: "J11", providerKind: "text",
    state: "started", workflowRunId: "execution", verifiedWorkflowId: "publication", resultJson: null, materializationJson: null,
    m4Preparation: { requestDigest: "request" }, m4Observation: { workflowRunId: "execution", publishedWorkflowId: "publication",
      remoteStatus: "succeeded", issue: null, wrapperDigest: "wrapper", evidenceDigest: "evidence", content: "private-content" } } as ExperimentOperationDocument;
  return { run, operation, completionRecoveries: [{ runId: "run", operationId: "op" }] };
}

describe("operation recovery diagnostic", () => {
  it("offers inspection of the exact granted manager without authorizing replay or continuation", () => {
    const input = fixture();
    Object.assign(input.operation, { role: "manager", taskId: null });
    expect(operationRecoveryOutcome(input)).toEqual({ code: "reviewed_completion_recovery_required", providerReplayAllowed: false, continuationAuthorized: false });
    input.completionRecoveries = [];
    expect(operationRecoveryOutcome(input).code).toBe("inspect_existing_execution");
  });
  it("identifies only the exact granted retained J11 without authorizing execution or exposing content", () => {
    const input = fixture();
    expect(operationRecoveryOutcome(input)).toEqual({ code: "reviewed_completion_recovery_required", providerReplayAllowed: false, continuationAuthorized: false });
    expect(JSON.stringify(operationRecoveryOutcome(input))).not.toContain("private-content");
    input.completionRecoveries[0].operationId = "other";
    expect(operationRecoveryOutcome(input).code).toBe("inspect_existing_execution");
  });
  it("does not offer recovery for another task or conflicting retained publication", () => {
    const input = fixture(); input.operation.taskId = "J01";
    expect(operationRecoveryOutcome(input).code).toBe("inspect_existing_execution");
    input.operation.taskId = "J11"; input.operation.m4Observation!.publishedWorkflowId = "different";
    expect(operationRecoveryOutcome(input).code).toBe("inspect_existing_execution");
  });
  it("reports verified saved completion and leaves historical incomplete proof inspectable", () => {
    const input = fixture(); input.run.activeOperationId = null;
    Object.assign(input.operation, { state: "succeeded", resultJson: "{}", materializationJson: "{}", lifecycle: { unresolved: false } });
    expect(operationRecoveryOutcome(input).code).toBe("saved_result");
    delete input.operation.lifecycle;
    expect(operationRecoveryOutcome(input).code).toBe("inspect_existing_execution");
  });
  it.each(["resultFinalizationClaim", "imageCompletionClaim", "authorizationClaim"] as const)("rejects saved output with a contradictory %s", (claim) => {
    const input = fixture(); input.run.activeOperationId = null;
    Object.assign(input.operation, { state: "succeeded", resultJson: "{}", materializationJson: "{}", lifecycle: { unresolved: false }, [claim]: { id: "claim", expiresAtMs: 1 } });
    expect(operationRecoveryOutcome(input).code).toBe("conflicting_evidence");
  });
  it("does not classify failed state with saved output as permission for continuation", () => {
    const input = fixture(); input.run.activeOperationId = null;
    Object.assign(input.operation, { state: "failed", resultJson: "{}", lifecycle: { unresolved: false } });
    expect(operationRecoveryOutcome(input).code).toBe("conflicting_evidence");
    input.operation.resultJson = null;
    expect(operationRecoveryOutcome(input)).toEqual({ code: "explicit_continuation_required", providerReplayAllowed: false, continuationAuthorized: false });
  });
  it("preserves stopped reconciliation and does not clear an expired claim", () => {
    const input = fixture();
    delete input.operation.m4Observation;
    Object.assign(input.operation, { remoteStatus: "stopped", lifecycle: { stop: { requestedAtMs: 1 } }, resultFinalizationClaim: { id: "claim", expiresAtMs: 1 } });
    expect(operationRecoveryOutcome(input).code).toBe("existing_stop_reconciliation_pending");
    expect(input.operation.resultFinalizationClaim).toEqual({ id: "claim", expiresAtMs: 1 });
    input.operation.workflowRunId = null;
    expect(operationRecoveryOutcome(input).code).toBe("unresolved_identity");
  });
  it("requires inspection of contradictory remote outcomes even with an exact grant", () => {
    const input = fixture(); input.operation.remoteStatus = "failed";
    expect(operationRecoveryOutcome(input).code).toBe("conflicting_evidence");
  });
  it("leaves missing identities and historical missing fields unresolved", () => {
    const input = fixture(); input.operation.workflowRunId = null;
    delete input.operation.m4Observation; delete input.operation.m4Preparation;
    expect(operationRecoveryOutcome(input).code).toBe("unresolved_identity");
    expect(operationRecoveryOutcome({ run: input.run, operation: null }).code).toBe("unresolved_identity");
    input.operation.runId = "other";
    expect(operationRecoveryOutcome(input).code).toBe("unresolved_identity");
  });
});
