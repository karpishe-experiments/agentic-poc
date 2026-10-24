import type { ClientSession } from "mongodb";
import type { ExperimentOperationDocument } from "@/db/documents";
import type { Database } from "@/db/client";
import type { VerificationAttempt } from "@/lib/experiment-runner/verification-attempt";
import { countVerificationQuery, measurePhase } from "@/lib/experiment-runner/diagnostics";

// Cache documents only within the caller's transaction-local verification attempt.
// These reads do not cache a proof verdict or authorize continuation.
export function readM4FailureCampaign(database: Database, session: ClientSession, campaignId: string, runId: string, attempt?: VerificationAttempt) {
  const load = () => measurePhase({ runId }, "accounting_campaign_read", async () => {
    countVerificationQuery();
    return database.collections.experiment_campaigns.findOne({ _id: campaignId }, { session });
  });
  return attempt ? attempt.metadata(`m4-campaign:${campaignId}`, load) : load();
}

export function readM4FailureSourceVersion(database: Database, session: ClientSession, operationId: string, attempt?: VerificationAttempt) {
  const load = async () => {
    countVerificationQuery();
    return database.collections.artifact_versions.findOne({ sourceOperationId: operationId }, { session, projection: { _id: 1, sourceOperationId: 1 } });
  };
  return attempt ? attempt.metadata(`m4-failure-source:${operationId}`, load) : load();
}

export async function readM4FailedOperations(database: Database, session: ClientSession, runId: string,
  failedIds: string[], attempt: VerificationAttempt) {
  if (!failedIds.length) return new Map<string, ExperimentOperationDocument>();
  const failed = await measurePhase({ runId }, "accounting_failed_proofs_read", async () => {
    countVerificationQuery();
    return database.collections.experiment_operations.find({ runId, _id: { $in: failedIds } }, { session }).toArray();
  });
  // Global scope is intentional: even a wrongly owned materialization rejects a failure.
  const versions = await measurePhase({ runId }, "accounting_failure_sources_read", async () => {
    countVerificationQuery();
    return database.collections.artifact_versions.find({ sourceOperationId: { $in: failedIds } },
      { session, projection: { _id: 1, sourceOperationId: 1 } }).toArray();
  });
  for (const operationId of failedIds) {
    await attempt.metadata(`m4-failure-source:${operationId}`, async () => versions.find(version => version.sourceOperationId === operationId) ?? null);
  }
  return new Map(failed.map(operation => [operation._id, operation]));
}

// Successful bodies are not accounting inputs. Failed bodies remain exact so the
// unclaimed-Pause exclusion cannot hide a saved result or materialization.
export function readM4AccountingOperations(database: Database, session: ClientSession, runId: string) {
  return measurePhase({ runId }, "accounting_run_operations_read", async () => {
    countVerificationQuery();
    return database.collections.experiment_operations.find({ runId }, { session, projection: {
      _id: 1, role: 1, taskId: 1, mode: 1, providerKind: 1, state: 1, reservationCount: 1, workflowRunId: 1, verifiedWorkflowId: 1,
      safeFailure: 1, remoteStatus: 1, imageCompletionDigest: 1,
      resultJson: { $cond: [{ $eq: ["$state", "failed"] }, "$resultJson", null] },
      materializationJson: { $cond: [{ $eq: ["$state", "failed"] }, "$materializationJson", null] },
      authorizationClaim: 1, resultFinalizationClaim: 1, imageCompletionClaim: 1,
      m4Reservation: 1, "m4Preparation.policyHash": 1, "m4Preparation.configurationHash": 1, "m4Preparation.requestDigest": 1,
      "m4Preparation.publishedWorkflowId": 1, "m4Observation.evidenceJson": 1, "m4Observation.evidenceDigest": 1,
      "m4Observation.remoteStatus": 1, "m4Observation.issue": 1,
    } }).toArray();
  });
}
