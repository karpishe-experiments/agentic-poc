import { z } from "zod";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { m4OperationFingerprint } from "@/db/experiment-text-sources";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";
import { m4MaximumCharge, m4PolicySnapshot, legacyCountRecoveryGrantSchema, type M4Policy } from "@/lib/experiment-runner/m4-policy";
import { m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import type { RuntimeExecution } from "@/lib/experiment-runner/transport";
import { RECONCILIATION_RESERVE_MS } from "@/lib/operations/budget";

// git 66872aa's audited adapter: this unique guard precedes responses.create.
// Its error alone cannot distinguish an excessive count from an unavailable one.
export const LEGACY_COUNT_GUARD_SOURCE_SHA256 = "1c18f6440772cbed926368d2d04fde90771ee181f4fbacde92a19c67913e7de8";
export const LEGACY_COUNT_PLUGIN_IDENTITY = "langgenius/openai:1.0.7-dev2@5a3107c1a2237e76ac04e09198a1fb1fbe446747d23ab4574f8c0aec914cfb3d";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export { legacyCountRecoveryGrantSchema };
export type LegacyCountRecoveryGrant = z.infer<typeof legacyCountRecoveryGrantSchema>;
const proofPayloadSchema = legacyCountRecoveryGrantSchema.extend({
  kind: z.literal("legacy_input_count_guard_v1"), requestDigest: digest, policyHash: digest,
  configurationHash: digest, operationFingerprint: digest, preparationDigest: digest, stopDigest: digest,
  deadlineAtMs: timestamp, recoveredAtMs: timestamp,
});
const proofSchema = proofPayloadSchema.extend({ proofDigest: digest });
export type LegacyCountFailureProof = z.infer<typeof proofSchema>;
type WithProof = ExperimentOperationDocument & { m4PreGenerationRecovery?: LegacyCountFailureProof };
const hash = (value: unknown) => m4Hash(m4CanonicalJson(value));

function validIdentity(policy: M4Policy, grant: LegacyCountRecoveryGrant,
  run: ExperimentRunDocument, op: ExperimentOperationDocument): boolean {
  const frozen = m4PolicySnapshot(policy), prep = op.m4Preparation, reservation = op.m4Reservation;
  if (grant.runId !== run._id || grant.operationId !== op._id || op.runId !== run._id ||
      grant.workflowRunId !== op.workflowRunId || grant.publishedWorkflowId !== op.verifiedWorkflowId ||
      grant.pluginIdentity !== policy.pluginIdentity || grant.pluginIdentity !== LEGACY_COUNT_PLUGIN_IDENTITY ||
      grant.guardSourceSha256 !== LEGACY_COUNT_GUARD_SOURCE_SHA256 ||
      run.mode !== "balanced" || op.mode !== "balanced" || op.providerKind !== "text" ||
      op.role !== "manager" || op.taskId !== null || op.subjectKind !== "book" || op.subjectId !== run.bookletId ||
      op.reservationCount !== 1 || op.dispatchStartedAtMs == null || !op.lifecycle ||
      op.lifecycle.stop && (op.lifecycle.stop.reason !== "deadline" || op.lifecycle.stop.delivery !== "acknowledged" ||
        !timestamp.safeParse(op.lifecycle.stop.requestedAtMs).success || op.deadlineAtMs == null ||
        op.lifecycle.stop.requestedAtMs < Math.max(op.lifecycle.startedAtMs, op.deadlineAtMs - RECONCILIATION_RESERVE_MS)) ||
      op.authorizationClaim || op.resultFinalizationClaim || op.imageCompletionClaim ||
      op.resultJson !== null || op.resultDigest !== null || op.materializationJson !== null ||
      op.imageCompletionDigest != null || op.m4CompletionRecovery ||
      !prep || !reservation || !run.m4 || run.m4.policyHash !== frozen.hash || run.m4.policyJson !== frozen.json ||
      prep.policyHash !== frozen.hash || reservation.policyHash !== frozen.hash ||
      reservation.campaignId !== run.m4.campaignId || prep.configurationHash !== run.configurationHash ||
      prep.requestDigest !== m4Hash(prep.requestJson) || prep.requestDigest !== reservation.requestDigest ||
      prep.operationFingerprint !== m4OperationFingerprint(op) || prep.parentWorkflowRunId !== op.parentWorkflowRunId ||
      prep.publishedWorkflowId !== op.verifiedWorkflowId || reservation.bucket !== "decision" ||
      reservation.maximumMicrodollars !== m4MaximumCharge(policy, "decision") ||
      reservation.unsettledMicrodollars !== reservation.maximumMicrodollars ||
      reservation.settledMicrodollars !== null || reservation.evidenceDigest !== null ||
      !Number.isSafeInteger(op.deadlineAtMs) || op.deadlineAtMs === null || op.deadlineAtMs < 0) return false;
  const observation = op.m4Observation;
  if (observation && (observation.workflowRunId !== op.workflowRunId || observation.publishedWorkflowId !== op.verifiedWorkflowId ||
      observation.remoteStatus !== "failed" || observation.wrapperDigest !== null || observation.content !== null ||
      observation.evidenceJson !== null || observation.evidenceDigest !== null || observation.issue !== "missing_wrapper")) return false;
  const expected = policy.publications.filter(p => p.role === "manager" && p.taskId === null && p.persona === null);
  const saved = savedConfigurationSchema.parse(JSON.parse(run.configurationJson)).filter(p => p.role === "manager" && p.taskId === null);
  if (expected.length !== 1 || saved.length !== 1 || saved[0].appId !== expected[0].appId ||
      saved[0].publishedWorkflowId !== expected[0].publishedWorkflowId || saved[0].toolProviderId !== expected[0].toolProviderId ||
      prep.publishedWorkflowId !== expected[0].publishedWorkflowId) return false;
  const request = z.object({ input: z.array(z.object({ role: z.string(), content: z.string() })) }).parse(JSON.parse(prep.requestJson));
  return request.input.filter(item => item.role === "user").length === 1 &&
    request.input.find(item => item.role === "user")?.content === prep.contextJson;
}

/** Local recovery provenance, never a retroactive provider envelope or usage claim. */
export function createLegacyCountFailureProof(policy: M4Policy, rawGrant: LegacyCountRecoveryGrant,
  run: ExperimentRunDocument, op: ExperimentOperationDocument, remote: RuntimeExecution & {
    legacyCountFailure?: { code: "legacy_input_count_guard"; totalTokens: 0 };
  }, nowMs: number): LegacyCountFailureProof {
  try {
    const grant = legacyCountRecoveryGrantSchema.parse(rawGrant);
    if (!timestamp.safeParse(nowMs).success || !validIdentity(policy, grant, run, op) ||
        run.status !== "blocked" || !["unknown_outcome", "definite_failure"].includes(run.safeFailure ?? "") ||
        run.activeOperationId !== op._id || run.preparation || run.generationCompletedAtMs != null ||
        !["started", "unknown"].includes(op.state) || (op as WithProof).m4PreGenerationRecovery ||
        op.deadlineAtMs! >= nowMs || op.lifecycle?.stop && op.lifecycle.stop.requestedAtMs > nowMs ||
        remote.status !== "failed" || remote.id !== op.workflowRunId ||
        remote.outputs && Object.keys(remote.outputs).length > 0 ||
        remote.workflow_id !== op.verifiedWorkflowId || op.workflowTaskId && remote.task_id && op.workflowTaskId !== remote.task_id ||
        remote.legacyCountFailure?.code !== "legacy_input_count_guard" || remote.legacyCountFailure.totalTokens !== 0) {
      throw new Error();
    }
    const payload = proofPayloadSchema.parse({ ...grant, kind: "legacy_input_count_guard_v1",
      requestDigest: op.m4Preparation!.requestDigest, policyHash: run.m4!.policyHash,
      configurationHash: run.configurationHash, operationFingerprint: op.m4Preparation!.operationFingerprint,
      preparationDigest: hash(op.m4Preparation), stopDigest: hash(op.lifecycle?.stop ?? null),
      deadlineAtMs: op.deadlineAtMs, recoveredAtMs: nowMs });
    return { ...payload, proofDigest: hash(payload) };
  } catch { throw new Error("legacy_count_failure_unverified"); }
}

/** Historical proof validation must remain valid after the same run advances. */
export function validateLegacyCountFailureProof(policy: M4Policy, run: ExperimentRunDocument,
  op: WithProof): boolean {
  try {
    const { proofDigest, ...proof } = proofSchema.parse((op as WithProof).m4PreGenerationRecovery);
    return proofDigest === hash(proof) && validIdentity(policy, proof, run, op) &&
      proof.requestDigest === op.m4Preparation!.requestDigest && proof.policyHash === run.m4!.policyHash &&
      proof.configurationHash === run.configurationHash && proof.operationFingerprint === m4OperationFingerprint(op) &&
      proof.preparationDigest === hash(op.m4Preparation) && proof.stopDigest === hash(op.lifecycle?.stop ?? null) &&
      proof.deadlineAtMs === op.deadlineAtMs && proof.recoveredAtMs > proof.deadlineAtMs &&
      (!op.lifecycle?.stop || op.lifecycle.stop.requestedAtMs <= proof.recoveredAtMs) &&
      op.state === "failed" && op.safeFailure === "definite_failure" && op.remoteStatus === "failed" &&
      op.lifecycle?.phase === "finished" && op.lifecycle.unresolved === false && op.lifecycle.attemptOutcome === "failed";
  } catch { return false; }
}
