import type { ClientSession } from "mongodb";
import type { ExperimentOperationDocument } from "@/db/documents";
import type { Database } from "@/db/client";
import type { VerificationAttempt } from "@/lib/experiment-runner/verification-attempt";
import { countVerificationQuery } from "@/lib/experiment-runner/diagnostics";

// Cache documents only within the caller's transaction-local verification attempt.
// These reads do not cache a proof verdict or authorize continuation.
export function readM4FailureCampaign(database: Database, session: ClientSession, campaignId: string, attempt?: VerificationAttempt) {
  const load = async () => {
    countVerificationQuery();
    return database.collections.experiment_campaigns.findOne({ _id: campaignId }, { session });
  };
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
  countVerificationQuery();
  const failed = await database.collections.experiment_operations.find({ runId, _id: { $in: failedIds } }, { session }).toArray();
  countVerificationQuery();
  // Global scope is intentional: even a wrongly owned materialization rejects a failure.
  const versions = await database.collections.artifact_versions.find({ sourceOperationId: { $in: failedIds } },
    { session, projection: { _id: 1, sourceOperationId: 1 } }).toArray();
  for (const operationId of failedIds) {
    await attempt.metadata(`m4-failure-source:${operationId}`, async () => versions.find(version => version.sourceOperationId === operationId) ?? null);
  }
  return new Map(failed.map(operation => [operation._id, operation]));
}
