import type { VerificationAttempt } from "@/lib/experiment-runner/verification-attempt";
import { readM4FailedOperations, readM4FailureCampaign, readM4AccountingOperations } from "@/db/experiment-m4-accounting-evidence";
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
import { countVerificationQuery, measurePhase } from "@/lib/experiment-runner/diagnostics";
import { isVerifiedAdvisoryFailure } from "@/db/experiment-advisory-failure";

function invalid(): never { throw new ExperimentRepositoryError("invalid_state", "Balanced completion requires complete attributable accounting."); }

// Read-only exit evidence. Projection omits creative output and prepared context;
// owning completion already checks those against original authenticated output.
export async function verifyM4Accounting(database: Database, session: ClientSession, run: ExperimentRunDocument, reportOperationId?: string, attempt?: VerificationAttempt) {
  if (!hasM4SimulatedImagePolicy(run) || !run.m4 || run.counters.payableImage !== 0) invalid();
  const { policy, hash } = m4PolicySnapshot(JSON.parse(run.m4.policyJson));
  const campaign = await readM4FailureCampaign(database, session, run.m4.campaignId, run._id, attempt);
  if (!campaign || (campaign.state !== "active" && !(campaign.state === "stopped" && run.status === "completed" && run.evaluationStatus === "failed")) || campaign.policyHash !== hash || campaign.policyJson !== run.m4.policyJson ||
      campaign.slots[run.persona] !== run._id || campaign.requests > policy.maxRequests || campaign.judgeRunIds.length > policy.maxJudges ||
      campaign.settledMicrodollars + campaign.reservedMicrodollars > policy.maxMicrodollars) invalid();
  const campaignOperations = await measurePhase({ runId: run._id }, "accounting_campaign_operations_read", async () => {
    countVerificationQuery();
    return database.collections.experiment_operations.find({ "m4Reservation.campaignId": campaign._id },
      { session, projection: { _id: 1, runId: 1, providerKind: 1, reservationCount: 1, m4Reservation: 1 } }).toArray();
  });
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
  const operations = await readM4AccountingOperations(database, session, run._id);
  const failedOperations = attempt ? await readM4FailedOperations(database, session, run._id,
    operations.filter(operation => operation.state === "failed").map(operation => operation._id), attempt) : null;
  let texts = 0; let images = 0;
  await measurePhase({ runId: run._id }, "accounting_operation_validation", async () => {
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
        const failed = failedOperations ? failedOperations.get(operation._id) :
          await database.collections.experiment_operations.findOne({ _id: operation._id, runId: run._id }, { session });
        if (failed && run.status === "completed" && run.evaluationStatus === "failed" &&
            await isVerifiedAdvisoryFailure(database, session, run, failed, run.updatedAtMs, attempt)) {
          texts += failed.reservationCount;
          continue;
        }
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
              run, failed, provenance.resumedAtMs, attempt)) invalid();
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
  });
  if (texts !== run.counters.logicalText || texts !== run.counters.payableText || images !== run.counters.logicalImage ||
      texts !== campaign.requestCounts[run.persona] || texts + images !== run.counters.steps) invalid();
}
