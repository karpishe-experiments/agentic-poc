import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentRunDocument } from "@/db/documents";
import { createExecutionAllowanceLedger } from "@/db/experiment-execution-allowance";
import { hasExperimentSimulatedImagePolicy } from "@/db/experiment-m4-state";
import { executionMaximumTextCharge, executionOperationTokenPolicy,
  executionPolicySnapshot } from "@/lib/experiment-runner/execution-policy";
import { assessM4ProviderResult, m4RetainedProviderWrapper } from "@/lib/experiment-runner/m4-provider-result";
import { m4Hash, m4CanonicalJson } from "@/lib/experiment-runner/m4-request";
import { realImageCharge, realImageResultSchema, verifyRealImageRequest } from "@/lib/experiment-runner/real-image-contract";
import { assessRealReportProviderResult } from "@/lib/experiment-runner/real-report-provider-result";

function invalid(): never { throw new Error("Execution accounting or ownership is incomplete."); }

// New-profile exit proof. Historical M4 campaigns continue to use their
// original verifier, including their exact recovery exceptions.
export async function verifyExecutionAccounting(database: Database, session: ClientSession,
  run: ExperimentRunDocument, reportOperationId?: string) {
  if (!run.execution || run.mode === "balanced" && (!hasExperimentSimulatedImagePolicy(run) || run.counters.payableImage !== 0) ||
      run.mode === "real" && run.counters.payableImage !== run.counters.logicalImage) invalid();
  const campaign = await createExecutionAllowanceLedger(database).current(session, run.execution.campaignId, run);
  const snapshot = executionPolicySnapshot(JSON.parse(run.execution.profileJson));
  if (snapshot.hash !== campaign.profileHash || snapshot.json !== campaign.profileJson ||
      campaign.settledMicrodollars + campaign.reservedMicrodollars > campaign.allowance.maxMicrodollars) invalid();
  const operations = await database.collections.experiment_operations.find({ runId: run._id }, { session }).toArray();
  let text = 0, images = 0, reserved = 0, settled = 0;
  for (const operation of operations) {
    if (operation.executionAllowanceCancellation) {
      const proofDigest = m4Hash(m4CanonicalJson({ kind: "undispatched_allowance_v1", runId: run._id,
        operationId: operation._id, profileHash: campaign.profileHash,
        preparation: operation.m4Preparation ?? null,
        ...(run.mode === "real" ? { realImagePreparation: operation.realImagePreparation ?? null } : {}),
        inputFingerprint: operation.inputFingerprint,
        configurationHash: run.configurationHash }));
      if (operation.state !== "failed" || operation.safeFailure !== null || operation.reservationCount !== 0 ||
          operation.dispatchStartedAtMs != null || operation.workflowRunId != null || operation.m4Reservation ||
          operation.realImageReservation ||
          operation.resultJson || operation.materializationJson ||
          operation.executionAllowanceCancellation.proofDigest !== proofDigest) invalid();
      continue;
    }
    if (operation.state === "prepared" && operation.reservationCount === 0 && run.activeOperationId === operation._id) {
      if (run.status !== "paused" && run.status !== "running" && run.status !== "queued") invalid();
      continue;
    }
    if (operation.state === "failed" && operation.reservationCount === 0 &&
        operation.dispatchStartedAtMs == null && !operation.workflowRunId && !operation.m4Reservation) continue;
    const resolvedRealImageFailure = run.mode === "real" && operation.providerKind === "image" &&
      operation.state === "failed" && operation.lifecycle?.unresolved === false && !!operation.realImageObservation;
    const resolvedFailure = operation.state === "failed" && operation.safeFailure === "definite_failure" &&
      operation.lifecycle?.unresolved === false &&
      ["failed", "stopped"].includes(operation.remoteStatus ?? "") &&
      !operation.resultJson && !operation.materializationJson;
    if (operation.state !== "succeeded" && !resolvedFailure && !resolvedRealImageFailure && !(operation._id === reportOperationId &&
        ["tester", "judge"].includes(operation.role) && ["started", "unknown"].includes(operation.state))) invalid();
    if (operation.reservationCount !== 1 || operation.mode !== run.mode || !operation.workflowRunId ||
        !operation.verifiedWorkflowId) invalid();
    if (operation.providerKind === "image") {
      if (operation.m4Reservation || operation.role !== "image") invalid();
      if (run.mode === "real") {
        const prepared = operation.realImagePreparation, reservation = operation.realImageReservation;
        const observation = operation.realImageObservation;
        if (!prepared || !reservation || !observation || !snapshot.policy.realImage ||
            prepared.logicalFingerprint !== operation.inputFingerprint ||
            prepared.requestDigest !== verifyRealImageRequest(JSON.parse(prepared.requestJson)).requestDigest ||
            reservation.campaignId !== campaign._id || reservation.profileHash !== snapshot.hash ||
            reservation.requestDigest !== prepared.requestDigest ||
            reservation.evidenceDigest !== observation.resultDigest ||
            observation.resultDigest !== m4Hash(observation.resultJson) ||
            !Number.isSafeInteger(reservation.planningHoldMicrodollars) ||
            reservation.planningHoldMicrodollars <= 0) invalid();
        const request = verifyRealImageRequest(JSON.parse(prepared.requestJson));
        if (request.requestDigest !== prepared.requestDigest) invalid();
        const result = realImageResultSchema.parse(JSON.parse(observation.resultJson));
        const charge = realImageCharge(result, snapshot.policy.realImage.price);
        if (result.requestDigest !== request.requestDigest || !charge ||
            charge.microdollars !== reservation.settledMicrodollars ||
            charge.basis !== observation.chargeBasis || reservation.unsettledMicrodollars !== 0 ||
            reservation.overrunMicrodollars !== Math.max(0, charge.microdollars - reservation.planningHoldMicrodollars) ||
            result.status === "succeeded" && (operation.state !== "succeeded" || !result.output ||
              operation.imageCompletionDigest !== result.output.sha256) ||
            result.status !== "succeeded" && operation.state !== "failed") invalid();
        reserved += reservation.unsettledMicrodollars;
        settled += charge.microdollars;
      } else if (operation.realImageReservation || operation.realImageObservation || operation.realImagePreparation) invalid();
      images++;
      continue;
    }
    text++;
    const reservation = operation.m4Reservation, prep = operation.m4Preparation, observation = operation.m4Observation;
    if (!reservation || !prep || !observation && !resolvedFailure ||
        observation && observation.issue || observation && observation.remoteStatus !== "succeeded" && !resolvedFailure ||
        observation && !observation.evidenceJson && !resolvedFailure ||
        reservation.campaignId !== campaign._id || reservation.policyHash !== snapshot.hash ||
        prep.policyHash !== snapshot.hash || prep.configurationHash !== run.configurationHash ||
        prep.publishedWorkflowId !== operation.verifiedWorkflowId || prep.requestDigest !== m4Hash(prep.requestJson) ||
        reservation.requestDigest !== prep.requestDigest ||
        reservation.maximumMicrodollars !== executionMaximumTextCharge(snapshot.policy, reservation.bucket) ||
        !resolvedFailure && (observation!.evidenceDigest !== m4Hash(observation!.evidenceJson!) ||
          reservation.evidenceDigest !== observation!.evidenceDigest)) invalid();
    executionOperationTokenPolicy(snapshot.policy, operation);
    if (!resolvedFailure) {
      const assessed = run.mode === "real" && operation.realReportPreparation
        ? assessRealReportProviderResult({ schemaVersion: "booklet_provider_v3", content: observation!.content ?? "",
          providerEvidence: JSON.parse(observation!.evidenceJson!) }, snapshot.policy, operation)
        : assessM4ProviderResult(m4RetainedProviderWrapper("", JSON.parse(observation!.evidenceJson!)),
          snapshot.policy, operation);
      if (!assessed.canMaterialize || assessed.chargeUpperMicrodollars !== reservation.settledMicrodollars ||
          reservation.unsettledMicrodollars !== (snapshot.policy.countChargeStatus === "assumed" ?
            snapshot.policy.countChargeCeilingMicrodollars : 0)) invalid();
    } else if (reservation.evidenceDigest !== null || reservation.settledMicrodollars !== null ||
        reservation.unsettledMicrodollars !== reservation.maximumMicrodollars) invalid();
    reserved += reservation.unsettledMicrodollars;
    settled += reservation.settledMicrodollars ?? 0;
  }
  if (text !== run.counters.logicalText || text !== run.counters.payableText ||
      images !== run.counters.logicalImage || text + images !== run.counters.steps ||
      campaign.textRequests !== text || campaign.imageRequests !== images ||
      campaign.reservedMicrodollars !== reserved ||
      campaign.settledMicrodollars !== settled ||
      text > campaign.allowance.textCalls || images > campaign.allowance.imageCalls ||
      run.counters.steps > campaign.allowance.steps ||
      run.textRevisions > campaign.allowance.textRevisions || run.imageRevisions > campaign.allowance.imageRevisions) invalid();
}
