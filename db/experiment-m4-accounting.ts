import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentRunDocument } from "@/db/documents";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { hasM4SimulatedImagePolicy } from "@/db/experiment-m4-state";
import { assessM4ProviderResult } from "@/lib/experiment-runner/m4-provider-result";
import { m4MaximumCharge, m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { m4Hash } from "@/lib/experiment-runner/m4-request";
import { hasM4KnownFailure } from "@/db/experiment-provider-failure";
import { m4UnclaimedFailureDigest } from "@/db/experiment-unclaimed-failure";
import { validateLegacyCountFailureProof } from "@/lib/experiment-runner/m4-legacy-count-failure";

function invalid(): never { throw new ExperimentRepositoryError("invalid_state", "Balanced completion requires complete attributable accounting."); }

// Read-only exit evidence. Projection omits creative output and prepared context;
// owning completion already checks those against original authenticated output.
export async function verifyM4Accounting(database: Database, session: ClientSession, run: ExperimentRunDocument, reportOperationId?: string) {
  if (!hasM4SimulatedImagePolicy(run) || !run.m4 || run.counters.payableImage !== 0) invalid();
  const { policy, hash } = m4PolicySnapshot(JSON.parse(run.m4.policyJson));
  const campaign = await database.collections.experiment_campaigns.findOne({ _id: run.m4.campaignId }, { session });
  if (!campaign || campaign.state !== "active" || campaign.policyHash !== hash || campaign.policyJson !== run.m4.policyJson ||
      campaign.slots[run.persona] !== run._id || campaign.requests > policy.maxRequests || campaign.judgeRunIds.length > policy.maxJudges ||
      campaign.settledMicrodollars + campaign.reservedMicrodollars > policy.maxMicrodollars) invalid();
  const campaignOperations = await database.collections.experiment_operations.find({ "m4Reservation.campaignId": campaign._id },
    { session, projection: { _id: 1, runId: 1, providerKind: 1, reservationCount: 1, m4Reservation: 1 } }).toArray();
  let reserved = 0; let settled = 0;
  const counts = Object.fromEntries(Object.keys(campaign.slots).map((persona) => [persona, 0]));
  const judges: string[] = [];
  for (const operation of campaignOperations) {
    const reservation = operation.m4Reservation!;
    const persona = Object.keys(campaign.slots).find((key) => campaign.slots[key as keyof typeof campaign.slots] === operation.runId);
    if (!persona || operation.providerKind !== "text" || operation.reservationCount !== 1 || reservation.policyHash !== hash ||
        reservation.maximumMicrodollars !== m4MaximumCharge(policy, reservation.bucket) ||
        !Number.isSafeInteger(reservation.unsettledMicrodollars) || reservation.unsettledMicrodollars < 0 ||
        reservation.settledMicrodollars !== null && (!Number.isSafeInteger(reservation.settledMicrodollars) || reservation.settledMicrodollars < 0)) invalid();
    counts[persona]++; reserved += reservation.unsettledMicrodollars; settled += reservation.settledMicrodollars ?? 0;
    if (reservation.bucket === "judge") judges.push(operation.runId);
  }
  if (campaign.requests !== campaignOperations.length || campaign.reservedMicrodollars !== reserved || campaign.settledMicrodollars !== settled ||
      Object.keys(counts).some((key) => counts[key] !== campaign.requestCounts[key as keyof typeof campaign.requestCounts]) ||
      new Set(judges).size !== judges.length || judges.length !== campaign.judgeRunIds.length || judges.some((id) => !campaign.judgeRunIds.includes(id))) invalid();
  const operations = await database.collections.experiment_operations.find({ runId: run._id }, { session, projection: {
    _id: 1, role: 1, taskId: 1, mode: 1, providerKind: 1, state: 1, reservationCount: 1, workflowRunId: 1, verifiedWorkflowId: 1,
    safeFailure: 1, remoteStatus: 1, resultJson: 1, materializationJson: 1, imageCompletionDigest: 1,
    authorizationClaim: 1, resultFinalizationClaim: 1, imageCompletionClaim: 1,
    m4Reservation: 1, "m4Preparation.policyHash": 1, "m4Preparation.configurationHash": 1, "m4Preparation.requestDigest": 1,
    "m4Preparation.publishedWorkflowId": 1, "m4Observation.evidenceJson": 1, "m4Observation.evidenceDigest": 1,
    "m4Observation.remoteStatus": 1, "m4Observation.issue": 1,
  } }).toArray();
  let texts = 0; let images = 0;
  for (const operation of operations) {
    // Pause may close a published workflow before it claims any provider action.
    // Preserve that history without inventing a request or reservation for it.
    if (operation.mode === "balanced" && operation.state === "failed" && operation.safeFailure === null &&
        operation.reservationCount === 0 && operation.remoteStatus === "succeeded" && operation.workflowRunId && operation.verifiedWorkflowId &&
        !operation.m4Reservation && !operation.m4Observation && !operation.resultJson && !operation.materializationJson &&
        !operation.imageCompletionDigest && !operation.authorizationClaim && !operation.resultFinalizationClaim && !operation.imageCompletionClaim) continue;
    if (operation.state === "failed") {
      // Only inspected, explicitly continued terminal failures count as retained
      // paid history. Load their full proof on this exceptional path only.
      const failed = await database.collections.experiment_operations.findOne({ _id: operation._id, runId: run._id }, { session });
      const provenance = failed?.m4Continuation;
      const unclaimedDigest = failed ? m4UnclaimedFailureDigest({ policy,
        grant: { campaignId: campaign._id, reference: campaign.grantReference } }, run, failed) : null;
      if (!failed || !provenance || failed.safeFailure !== "definite_failure" || !["manager", "specialist"].includes(failed.role) ||
          failed.lifecycle?.phase !== "finished" || failed.lifecycle.unresolved !== false ||
          failed.lifecycle.stop && !validateLegacyCountFailureProof(policy, run, failed) ||
          provenance.evidenceDigest !== (unclaimedDigest ?? failed.m4PreGenerationRecovery?.proofDigest ?? failed.m4Observation?.evidenceDigest) ||
          provenance.requestDigest !== (unclaimedDigest ? failed.m4Preparation?.requestDigest : failed.m4Reservation?.requestDigest) ||
          !provenance.reference || !Number.isSafeInteger(provenance.resumedAtMs) ||
          !await hasM4KnownFailure(database, session, { policy, grant: { campaignId: campaign._id, reference: campaign.grantReference } },
            run, failed, provenance.resumedAtMs)) invalid();
      if (!unclaimedDigest) texts++;
      continue;
    }
    if (operation.mode !== "balanced" || operation.reservationCount !== 1 || !operation.workflowRunId || !operation.verifiedWorkflowId ||
        operation.state !== "succeeded" && !(operation._id === reportOperationId && ["tester", "judge"].includes(operation.role) && ["started", "unknown"].includes(operation.state))) invalid();
    if (operation.providerKind === "image") {
      if (operation.m4Reservation || operation.role !== "image") invalid();
      images++; continue;
    }
    texts++;
    const observation = operation.m4Observation; const reservation = operation.m4Reservation; const prep = operation.m4Preparation;
    if (!observation || observation.issue || observation.remoteStatus !== "succeeded" || !observation.evidenceJson ||
        !reservation || !prep || prep.configurationHash !== run.configurationHash || prep.publishedWorkflowId !== operation.verifiedWorkflowId ||
        reservation.campaignId !== campaign._id || reservation.policyHash !== hash || prep.policyHash !== hash ||
        observation.evidenceDigest !== m4Hash(observation.evidenceJson) || reservation.evidenceDigest !== observation.evidenceDigest) invalid();
    const evidence = JSON.parse(observation.evidenceJson) as unknown;
    const assessed = assessM4ProviderResult({ schemaVersion: "booklet_provider_v1", content: "", providerEvidence: evidence }, policy, operation);
    if (!assessed.canMaterialize || assessed.chargeUpperMicrodollars !== reservation.settledMicrodollars ||
        reservation.unsettledMicrodollars !== (policy.countChargeStatus === "assumed" ? policy.countChargeCeilingMicrodollars : 0)) invalid();
  }
  if (texts !== run.counters.logicalText || texts !== run.counters.payableText || images !== run.counters.logicalImage ||
      texts !== campaign.requestCounts[run.persona] || texts + images !== run.counters.steps) invalid();
}
