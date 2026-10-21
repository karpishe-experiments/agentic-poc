import { describe, expect, it } from "vitest";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { m4OperationFingerprint } from "@/db/experiment-text-sources";
import { m4MaximumCharge, m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { m4Hash } from "@/lib/experiment-runner/m4-request";
import { createLegacyCountFailureProof, validateLegacyCountFailureProof, legacyCountRecoveryGrantSchema,
  LEGACY_COUNT_GUARD_SOURCE_SHA256, LEGACY_COUNT_PLUGIN_IDENTITY } from "@/lib/experiment-runner/m4-legacy-count-failure";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";

function fixture() {
  const policy = { ...m4TestPolicy(), pluginIdentity: LEGACY_COUNT_PLUGIN_IDENTITY };
  const frozen = m4PolicySnapshot(policy), publication = policy.publications[0];
  const run: ExperimentRunDocument = { _id: id(1), bookletId: id(2), schemaVersion: "2", persona: "playful_kid", mode: "balanced", brief: "fixture",
    predecessorRunId: null, configurationJson: JSON.stringify(policy.publications.filter(p => p.persona === null || p.persona === "playful_kid")
      .map(({ persona, ...binding }) => { void persona; return binding; })), configurationHash: "a".repeat(64),
    status: "blocked", evaluationStatus: "pending", revision: 2, pauseRequested: true, activeOperationId: id(3),
    counters: { logicalText: 1, payableText: 1, logicalImage: 0, payableImage: 0, steps: 1 },
    limits: { text: 120, image: 12, steps: 300 }, safeFailure: "unknown_outcome", activeDelegationId: null,
    decisionSequence: 0, pendingDecisionJson: null, textRevisions: 0, imageRevisions: 0, createdAtMs: 1, updatedAtMs: 2,
    m4: { campaignId: id(4), policyHash: frozen.hash, policyJson: frozen.json } };
  const requestJson = JSON.stringify({ input: [{ role: "user", content: "fixture" }] });
  const op: ExperimentOperationDocument = { _id: id(3), runId: run._id, role: "manager", taskId: null,
    subjectKind: "book", subjectId: run.bookletId, idempotencyKey: "fixture", inputFingerprint: "b".repeat(64),
    attempt: 1, mode: "balanced", providerKind: "text", state: "started", workflowRunId: id(5),
    parentWorkflowRunId: null, dispatchStartedAtMs: 1, workflowTaskId: id(6), remoteStatus: "failed",
    verifiedWorkflowId: publication.publishedWorkflowId, lifecycle: { startedAtMs: 1, phase: "reconciling",
      lastProgressAtMs: 2, ownerId: "fixture", unresolved: true }, reservationCount: 1, deadlineAtMs: 10,
    resultJson: null, resultDigest: null, materializationJson: null, warningsJson: "[]", expectedTargetVersionId: null,
    dependencyVersionIds: [], safeFailure: "unknown_outcome", createdAtMs: 1, updatedAtMs: 2,
    m4Preparation: { policyHash: frozen.hash, configurationHash: run.configurationHash, definitionHash: "c".repeat(64),
      requestDigest: m4Hash(requestJson), requestJson, contextJson: "fixture", systemPrompt: "fixture", modelParametersJson: "{}",
      sourceFingerprint: "d".repeat(64), operationFingerprint: "", publishedWorkflowId: publication.publishedWorkflowId,
      parentWorkflowRunId: null, preparedAtMs: 1 },
    m4Reservation: { campaignId: id(4), policyHash: frozen.hash, requestDigest: m4Hash(requestJson), bucket: "decision",
      maximumMicrodollars: m4MaximumCharge(policy, "decision"), unsettledMicrodollars: m4MaximumCharge(policy, "decision"),
      settledMicrodollars: null, evidenceDigest: null },
    m4Observation: { workflowRunId: id(5), publishedWorkflowId: publication.publishedWorkflowId, wrapperDigest: null,
      content: null, evidenceJson: null, evidenceDigest: null, remoteStatus: "failed", observedAtMs: 5, issue: "missing_wrapper" },
  };
  op.m4Preparation!.operationFingerprint = m4OperationFingerprint(op);
  const grant = { runId: run._id, operationId: op._id, workflowRunId: id(5), publishedWorkflowId: publication.publishedWorkflowId,
    pluginIdentity: policy.pluginIdentity, guardSourceSha256: LEGACY_COUNT_GUARD_SOURCE_SHA256,
    nodeTraceDigest: "e".repeat(64), reference: "reviewed exact fixture only" };
  const remote = { id: id(5), workflow_id: publication.publishedWorkflowId, task_id: id(6), status: "failed" as const,
    legacyCountFailure: { code: "legacy_input_count_guard" as const, totalTokens: 0 as const } };
  return { policy, run, op, grant, remote };
}
const create = (env: ReturnType<typeof fixture>, now = 20) =>
  createLegacyCountFailureProof(env.policy, env.grant, env.run, env.op, env.remote, now);

describe("exact legacy count-guard provenance", () => {
  it("records separate local provenance without changing input records or claiming usage", () => {
    const env = fixture(), before = JSON.stringify(env);
    const proof = create(env);
    expect(JSON.stringify(env)).toBe(before);
    expect(proof).toMatchObject({ kind: "legacy_input_count_guard_v1", ...env.grant,
      deadlineAtMs: 10, recoveredAtMs: 20, requestDigest: env.op.m4Preparation!.requestDigest });
    expect(proof.proofDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(proof).not.toHaveProperty("usage");
    expect(proof).not.toHaveProperty("countedInputTokens");
  });
  it("rejects non-UUID and arbitrary grant fields", () => {
    expect(legacyCountRecoveryGrantSchema.safeParse({ ...fixture().grant, runId: "not-a-uuid" }).success).toBe(false);
    expect(legacyCountRecoveryGrantSchema.safeParse({ ...fixture().grant, prompt: "private" }).success).toBe(false);
  });
  it("preserves an acknowledged deadline Stop and rejects manual, uncertain or changed Stop history", () => {
    const env = fixture();
    env.op.lifecycle!.stop = { requestedAtMs: 9, reason: "deadline", delivery: "acknowledged" };
    const proof = create(env);
    const closed = { ...env.op, state: "failed" as const, safeFailure: "definite_failure" as const,
      m4PreGenerationRecovery: proof, lifecycle: { ...env.op.lifecycle!, phase: "finished" as const,
        attemptOutcome: "failed" as const, unresolved: false } };
    expect(validateLegacyCountFailureProof(env.policy, env.run, closed)).toBe(true);
    expect(validateLegacyCountFailureProof(env.policy, env.run, { ...closed, lifecycle: { ...closed.lifecycle,
      stop: { ...closed.lifecycle.stop!, requestedAtMs: 12 } } })).toBe(false);
    for (const stop of [
      { requestedAtMs: 11, reason: "manual" as const, delivery: "acknowledged" as const },
      { requestedAtMs: 11, reason: "deadline" as const, delivery: "unknown" as const },
      { requestedAtMs: 0, reason: "deadline" as const, delivery: "acknowledged" as const },
      { requestedAtMs: 21, reason: "deadline" as const, delivery: "acknowledged" as const },
    ]) { env.op.lifecycle!.stop = stop; expect(() => create(env)).toThrow("legacy_count_failure_unverified"); }
    env.op.deadlineAtMs = 50_000;
    env.op.m4Preparation!.operationFingerprint = m4OperationFingerprint(env.op);
    env.op.lifecycle!.stop = { requestedAtMs: 20_000, reason: "deadline", delivery: "acknowledged" };
    expect(create(env, 60_000).stopDigest).toMatch(/^[a-f0-9]{64}$/);
    env.op.lifecycle!.stop.requestedAtMs--;
    expect(() => create(env, 60_000)).toThrow("legacy_count_failure_unverified");
  });
  it("rejects identity, grant, policy, deadline and source drift with a fixed error", () => {
    const changes: ((env: ReturnType<typeof fixture>) => void)[] = [
      e => { e.grant.runId = id(99); }, e => { e.grant.operationId = id(99); }, e => { e.grant.workflowRunId = id(99); },
      e => { e.grant.publishedWorkflowId = id(99); }, e => { e.grant.pluginIdentity = "untrusted"; },
      e => { e.grant.guardSourceSha256 = "f".repeat(64); }, e => { e.grant.nodeTraceDigest = "invalid"; },
      e => { e.policy.pluginIdentity = e.policy.pluginIdentity.replace("dev2", "dev3"); },
      e => { e.op.m4Preparation!.requestJson = "private changed source"; },
      e => { e.op.dependencyVersionIds = [id(55)]; }, e => { e.op.deadlineAtMs = 20; },
      e => { e.op.m4Preparation!.configurationHash = "f".repeat(64); }, e => { e.run.activeOperationId = id(99); },
      e => { e.remote.task_id = id(99); }, e => { e.remote.workflow_id = id(99); },
      e => { e.remote.id = id(99); }, e => { e.remote.legacyCountFailure = undefined!; },
      e => { e.op.m4Preparation!.parentWorkflowRunId = id(99); },
    ];
    for (const change of changes) {
      const env = fixture(); change(env);
      expect(() => create(env)).toThrow(/^legacy_count_failure_unverified$/);
    }
    expect(() => create(fixture(), Number.NaN)).toThrow(/^legacy_count_failure_unverified$/);
  });
  it("rejects every claim even expired, output, stop and reduced accounting exposure", () => {
    const changes: ((env: ReturnType<typeof fixture>) => void)[] = [
      e => { e.op.authorizationClaim = { id: "old", expiresAtMs: 1 }; },
      e => { e.op.resultFinalizationClaim = { id: "old", expiresAtMs: 1 }; },
      e => { e.op.imageCompletionClaim = { id: "old", digest: "x", expiresAtMs: 1 }; },
      e => { e.op.resultJson = "{}"; }, e => { e.op.resultDigest = "f".repeat(64); },
      e => { e.op.materializationJson = "{}"; }, e => { e.op.m4Observation!.evidenceJson = "{}"; },
      e => { e.op.m4Reservation!.unsettledMicrodollars--; }, e => { e.op.m4Reservation!.settledMicrodollars = 0; },
      e => { e.op.m4Reservation!.evidenceDigest = "f".repeat(64); }, e => { e.op.reservationCount = 0; },
      e => { e.op.lifecycle!.stop = { requestedAtMs: 1, reason: "manual", delivery: "acknowledged" }; },
      e => { e.run.generationCompletedAtMs = 1; },
    ];
    for (const change of changes) {
      const env = fixture(); change(env);
      expect(() => create(env)).toThrow(/^legacy_count_failure_unverified$/);
    }
  });
  it("validates the saved failure after the run advances and rejects proof or record tampering", () => {
    const env = fixture(), proof = create(env);
    const closed = { ...env.op, state: "failed" as const, safeFailure: "definite_failure" as const,
      m4PreGenerationRecovery: proof, lifecycle: { ...env.op.lifecycle!, phase: "finished" as const,
        attemptOutcome: "failed" as const, unresolved: false } };
    const advanced = { ...env.run, status: "running" as const, revision: 100, activeOperationId: id(90),
      safeFailure: null, generationCompletedAtMs: 30 };
    expect(validateLegacyCountFailureProof(env.policy, advanced, closed)).toBe(true);
    expect(validateLegacyCountFailureProof(env.policy, advanced, { ...closed,
      m4PreGenerationRecovery: { ...proof, recoveredAtMs: 21 } })).toBe(false);
    expect(validateLegacyCountFailureProof(env.policy, advanced, { ...closed,
      m4PreGenerationRecovery: { ...proof, proofDigest: "f".repeat(64) } })).toBe(false);
    expect(validateLegacyCountFailureProof(env.policy, advanced, { ...closed,
      m4Reservation: { ...closed.m4Reservation!, unsettledMicrodollars: 0 } })).toBe(false);
    expect(validateLegacyCountFailureProof(env.policy, advanced, { ...closed,
      m4Preparation: { ...closed.m4Preparation!, sourceFingerprint: "a".repeat(64) } })).toBe(false);
    expect(validateLegacyCountFailureProof(env.policy, advanced, { ...closed,
      lifecycle: { ...closed.lifecycle, unresolved: true } })).toBe(false);
  });
});
