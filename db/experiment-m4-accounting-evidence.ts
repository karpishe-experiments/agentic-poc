import type { ClientSession } from "mongodb";
import type { ExperimentOperationDocument } from "@/db/documents";
import type { Database } from "@/db/client";
import type { VerificationAttempt } from "@/lib/experiment-runner/verification-attempt";
import { countVerificationQuery, countVerificationRead, measurePhase } from "@/lib/experiment-runner/diagnostics";
import { z } from "zod";
import { assertOperationBudget } from "@/lib/operations/budget";

export type CandidateProofMetrics = { returnedJsonBytes: number; comparisonInputJsonBytes: number;
  selectedRows: number; comparedRows: number; matchedRows: number; fallbackRows: number };
export const candidateProofMetrics = (): CandidateProofMetrics => ({ returnedJsonBytes: 0, comparisonInputJsonBytes: 0,
  selectedRows: 0, comparedRows: 0, matchedRows: 0, fallbackRows: 0 });

export const m4FailedProofProjection = { imageRequestJson: 0, referenceUploadsJson: 0, referenceUploadJournalJson: 0, warningsJson: 0 } as const;

const requestShape = z.object({ input: z.array(z.object({ role: z.string(), content: z.string() })) });

/** Diagnostic candidate only. Each invocation must belong to one snapshot transaction. */
export async function readM4CandidateProofs(database: Database, session: ClientSession, runId: string, ids: string[],
  metrics: CandidateProofMetrics = candidateProofMetrics()): Promise<ExperimentOperationDocument[]> {
  if (!session.inTransaction()) throw new Error("Candidate proof reads require a snapshot transaction.");
  assertOperationBudget();
  if (!ids.length) return [];
  const filter = { runId, _id: { $in: ids } };
  const operations = database.collections.experiment_operations;
  // Guard object conversion: malformed/non-string preparations retain their exact
  // original representation. The envelope is internal and never enters a digest.
  const omitted = { $and: [{ $eq: [{ $type: "$m4Preparation" }, "object"] },
    { $eq: [{ $type: "$m4Preparation.contextJson" }, "string"] }] };
  countVerificationQuery();
  const compact = await operations.aggregate<{ operation: ExperimentOperationDocument; contextOmitted: boolean }>([
    { $match: filter }, { $project: m4FailedProofProjection },
    { $project: { _id: 0, contextOmitted: omitted, operation: { $cond: [omitted,
      { $mergeObjects: ["$$ROOT", { m4Preparation: { $arrayToObject: { $filter: {
        input: { $objectToArray: "$m4Preparation" }, as: "field", cond: { $ne: ["$$field.k", "contextJson"] },
      } } } }] }, "$$ROOT"] } } },
  ], { session }).toArray();
  metrics.returnedJsonBytes += Buffer.byteLength(JSON.stringify(compact), "utf8");
  metrics.selectedRows += compact.length;
  const contexts = new Map<string, string>();
  const fallback = new Set<string>();
  const seen = new Set<string>();
  for (const row of compact) {
    if (!ids.includes(row.operation._id) || seen.has(row.operation._id)) throw new Error("Ambiguous candidate proof identity.");
    seen.add(row.operation._id);
    if (!row.contextOmitted) { fallback.add(row.operation._id); continue; }
    try {
      const request = requestShape.parse(JSON.parse(row.operation.m4Preparation!.requestJson));
      const users = request.input.filter(item => item.role === "user");
      if (users.length !== 1 || Buffer.from(users[0].content, "utf8").toString("utf8") !== users[0].content) throw new Error();
      contexts.set(row.operation._id, users[0].content);
    } catch { fallback.add(row.operation._id); }
  }
  if (seen.size !== new Set(ids).size) throw new Error("Candidate proof records are missing.");
  if (contexts.size) {
    assertOperationBudget();
    const comparison = [
      { $match: { runId, _id: { $in: [...contexts.keys()] } } },
      { $project: { _id: 1, matches: { $and: [
        { $eq: [{ $type: "$m4Preparation.contextJson" }, "string"] },
        { $eq: ["$m4Preparation.contextJson", { $switch: { branches: [...contexts].map(([id, value]) => ({
          case: { $eq: ["$_id", { $literal: id }] }, then: { $literal: value },
        })), default: null } }] },
      ] } } },
    ];
    metrics.comparisonInputJsonBytes += Buffer.byteLength(JSON.stringify(comparison), "utf8");
    countVerificationQuery();
    const checked = await operations.aggregate<{ _id: string; matches: boolean }>(comparison,
      { session, collation: { locale: "simple" } }).toArray();
    metrics.returnedJsonBytes += Buffer.byteLength(JSON.stringify(checked), "utf8");
    metrics.comparedRows += checked.length;
    const checkedIds = new Set<string>();
    for (const row of checked) {
      if (!contexts.has(row._id) || checkedIds.has(row._id)) throw new Error("Ambiguous context comparison identity.");
      checkedIds.add(row._id);
      if (row.matches === true) metrics.matchedRows++; else fallback.add(row._id);
    }
    if (checkedIds.size !== contexts.size) throw new Error("Context comparison records are missing.");
  }
  let originals: ExperimentOperationDocument[] = [];
  if (fallback.size) {
    assertOperationBudget(); countVerificationQuery();
    originals = await operations.find({ runId, _id: { $in: [...fallback] } }, { session, projection: m4FailedProofProjection }).toArray();
    metrics.returnedJsonBytes += Buffer.byteLength(JSON.stringify(originals), "utf8");
    metrics.fallbackRows += fallback.size;
    if (originals.length !== fallback.size || new Set(originals.map(row => row._id)).size !== fallback.size ||
        originals.some(row => !fallback.has(row._id))) throw new Error("Original proof fallback is incomplete.");
  }
  assertOperationBudget();
  const originalById = new Map(originals.map(row => [row._id, row]));
  return compact.map(({ operation }) => {
    if (fallback.has(operation._id)) return originalById.get(operation._id)!;
    return { ...operation, m4Preparation: { ...operation.m4Preparation!, contextJson: contexts.get(operation._id)! } };
  });
}

// Exact existing accounting exclusion: an unclaimed Pause has no attributable
// provider work. Share it with proof selection so no excluded body is loaded.
export function isUnclaimedPauseFailure(operation: ExperimentOperationDocument) {
  return operation.mode === "balanced" && operation.state === "failed" && operation.safeFailure === null &&
    operation.reservationCount === 0 && operation.remoteStatus === "succeeded" && !!operation.workflowRunId && !!operation.verifiedWorkflowId &&
    !operation.m4Reservation && !operation.m4Observation && !operation.resultJson && !operation.materializationJson &&
    !operation.imageCompletionDigest && !operation.authorizationClaim && !operation.resultFinalizationClaim && !operation.imageCompletionClaim;
}

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
    if (!attempt.failedProofReader) countVerificationQuery();
    // None of the failure predicates consumes these image transport/debug fields.
    // Keep complete preparations (including legacy digest inputs), observations,
    // claims, results and lifecycle provenance unchanged.
    const rows = attempt.failedProofReader ? await attempt.failedProofReader(runId, failedIds) :
      await database.collections.experiment_operations.find({ runId, _id: { $in: failedIds } },
        { session, projection: m4FailedProofProjection }).toArray();
    countVerificationRead(rows);
    return rows;
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
