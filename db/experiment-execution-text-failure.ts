import type { ClientSession } from "mongodb";
import { withMongoTransaction, type Database } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { createExecutionAllowanceLedger } from "@/db/experiment-execution-allowance";
import { failTerminalPageBatchItems } from "@/db/experiment-page-batch-failure";
import { m4OperationFingerprint } from "@/db/experiment-text-sources";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";
import { executionMaximumTextCharge, executionPolicySnapshot } from "@/lib/experiment-runner/execution-policy";
import { assessM4ProviderResult, m4RetainedProviderWrapper } from "@/lib/experiment-runner/m4-provider-result";
import { assessRealReportProviderResult } from "@/lib/experiment-runner/real-report-provider-result";
import { m4ModelBucket } from "@/lib/experiment-runner/m4-policy";
import { m4Hash } from "@/lib/experiment-runner/m4-request";
import { m4ObservedRoleResult } from "@/lib/experiment-runner/m4-observed-result";
import { M4CreativeOutputError } from "@/lib/experiment-runner/m4-output";

// A terminal workflow can succeed while its provider returns incomplete/refused
// output. Close only attributable, settled failures; uncertainty stays owned.
export async function hasExecutionTextFailure(database: Database, session: ClientSession,
  run: ExperimentRunDocument, op: ExperimentOperationDocument, nowMs: number): Promise<boolean> {
  const prep = op.m4Preparation, reservation = op.m4Reservation, observation = op.m4Observation;
  if (!run.execution || !["balanced", "real"].includes(run.mode) || op.runId !== run._id || op.mode !== run.mode ||
      op.providerKind !== "text" || op.role === "image" || !["started", "unknown", "failed"].includes(op.state) ||
      op.reservationCount !== 1 || op.dispatchStartedAtMs == null || !op.workflowRunId || !op.lifecycle ||
      !prep || !reservation || !observation || !["provider_failure", "creative_invalid"].includes(observation.issue ?? "") ||
      !["succeeded", "failed", "stopped"].includes(observation.remoteStatus) ||
      observation.workflowRunId !== op.workflowRunId || observation.publishedWorkflowId !== op.verifiedWorkflowId ||
      observation.publishedWorkflowId !== prep.publishedWorkflowId || !observation.wrapperDigest ||
      observation.content === null || !observation.evidenceJson || observation.evidenceDigest !== m4Hash(observation.evidenceJson) ||
      prep.configurationHash !== run.configurationHash || prep.operationFingerprint !== m4OperationFingerprint(op) ||
      prep.requestDigest !== m4Hash(prep.requestJson) || prep.requestDigest !== reservation.requestDigest ||
      prep.parentWorkflowRunId !== op.parentWorkflowRunId ||
      op.resultJson !== null || op.resultDigest !== null || op.materializationJson !== null || op.imageCompletionDigest != null ||
      [op.authorizationClaim, op.resultFinalizationClaim, op.imageCompletionClaim].some(claim => claim && claim.expiresAtMs > nowMs)) return false;
  try {
    const campaign = await createExecutionAllowanceLedger(database).current(session, run.execution.campaignId, run);
    const snapshot = executionPolicySnapshot(JSON.parse(run.execution.profileJson));
    const expected = snapshot.policy.publications.find(item => item.role === op.role && item.taskId === op.taskId &&
      item.persona === (op.role === "tester" ? run.persona : null));
    const saved = savedConfigurationSchema.parse(JSON.parse(run.configurationJson)).find(item => item.role === op.role && item.taskId === op.taskId);
    if (snapshot.hash !== campaign.profileHash || snapshot.json !== campaign.profileJson ||
        prep.policyHash !== snapshot.hash || reservation.policyHash !== snapshot.hash || reservation.campaignId !== campaign._id ||
        reservation.bucket !== m4ModelBucket(op.role, run.generationCompletedAtMs != null) ||
        reservation.maximumMicrodollars !== executionMaximumTextCharge(snapshot.policy, reservation.bucket, op.role) ||
        !expected || !saved || expected.publishedWorkflowId !== prep.publishedWorkflowId ||
        saved.appId !== expected.appId || saved.publishedWorkflowId !== expected.publishedWorkflowId ||
        saved.toolProviderId !== expected.toolProviderId || saved.finalPageIllustration !== expected.finalPageIllustration) return false;
    const evidence = JSON.parse(observation.evidenceJson) as { status?: unknown };
    if (!["completed", "incomplete", "failed", "cancelled"].includes(String(evidence?.status))) return false;
    const assessed = run.mode === "real" && op.realReportPreparation
      ? assessRealReportProviderResult({ schemaVersion: "booklet_provider_v3", content: observation.content, providerEvidence: evidence }, snapshot.policy, op)
      : assessM4ProviderResult(m4RetainedProviderWrapper(observation.content, evidence), snapshot.policy, op);
    if (assessed.violations.length || assessed.chargeUpperMicrodollars === null ||
        assessed.evidenceJson !== observation.evidenceJson || assessed.evidenceDigest !== observation.evidenceDigest ||
        reservation.evidenceDigest !== assessed.evidenceDigest || reservation.settledMicrodollars !== assessed.chargeUpperMicrodollars ||
        reservation.unsettledMicrodollars !== (snapshot.policy.countChargeStatus === "assumed" ? snapshot.policy.countChargeCeilingMicrodollars : 0)) return false;
    if (observation.issue === "provider_failure") {
      if (observation.remoteStatus === "succeeded" && assessed.canMaterialize) return false;
    } else {
      // A label alone cannot close valid work. Re-run the exact saved creative
      // parser after attribution and settlement have independently been proved.
      if (observation.remoteStatus !== "succeeded" || !assessed.canMaterialize) return false;
      try {
        m4ObservedRoleResult(run, { ...op, m4Observation: { ...observation, issue: null } });
        return false;
      } catch (error) {
        if (!(error instanceof M4CreativeOutputError)) return false;
      }
    }
    if (await database.collections.artifact_versions.findOne({ sourceOperationId: op._id }, { session, projection: { _id: 1 } }) ||
        await database.collections.messages.findOne({ operationId: op._id }, { session, projection: { _id: 1 } }) ||
        await database.collections.assets.findOne({ _id: op._id }, { session, projection: { _id: 1 } })) return false;
    return true;
  } catch { return false; }
}

export async function closeExecutionTextFailure(database: Database,
  input: { runId: string; operationId: string; nowMs: number; expectedRevision?: number;
    validate?: (session: ClientSession, run: ExperimentRunDocument, op: ExperimentOperationDocument) => Promise<void>;
    validateAfter?: (session: ClientSession, run: ExperimentRunDocument) => Promise<void> }): Promise<boolean> {
  return withMongoTransaction(database, async session => {
    const run = await database.collections.experiment_runs.findOne({ _id: input.runId }, { session });
    const op = await database.collections.experiment_operations.findOne({ _id: input.operationId, runId: input.runId }, { session });
    if (!run || !op || !await hasExecutionTextFailure(database, session, run, op, input.nowMs)) return false;
    if (input.expectedRevision !== undefined && run.revision !== input.expectedRevision) return false;
    await input.validate?.(session, run, op);
    if (op.state === "failed" && op.safeFailure === "definite_failure" && op.lifecycle?.unresolved === false &&
        op.lifecycle.phase === "finished") return true;
    if (!["started", "unknown"].includes(op.state) || run.activeOperationId !== op._id ||
        ["completed", "failed"].includes(run.status)) return false;
    const changed = await database.collections.experiment_operations.updateOne({ _id: op._id, state: op.state }, { $set: {
      state: "failed", safeFailure: "definite_failure", remoteStatus: op.m4Observation!.remoteStatus, updatedAtMs: input.nowMs,
      lifecycle: { ...op.lifecycle!, phase: "finished", attemptOutcome: "failed", unresolved: false,
        endedAtMs: op.lifecycle!.endedAtMs ?? input.nowMs, lastProgressAtMs: input.nowMs },
    } }, { session });
    if (changed.modifiedCount !== 1) throw new Error("Execution failure changed during closure.");
    const blocked = await database.collections.experiment_runs.findOneAndUpdate({ _id: run._id, revision: run.revision, activeOperationId: op._id },
      { $set: { status: "blocked", safeFailure: "definite_failure", pauseRequested: true, activeOperationId: null, updatedAtMs: input.nowMs },
        $inc: { revision: 1 } }, { session, returnDocument: "after" });
    if (!blocked) throw new Error("Execution failure ownership changed during closure.");
    await input.validateAfter?.(session, blocked);
    await failTerminalPageBatchItems(database, blocked, session, input.nowMs);
    return true;
  });
}
