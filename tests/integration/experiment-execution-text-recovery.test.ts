import { afterEach, describe, expect, it, vi } from "vitest";
import { withMongoTransaction, type Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExecutionAllowanceLedger } from "@/db/experiment-execution-allowance";
import { createM4TextPreparation } from "@/db/experiment-text-preparation";
import { createM4ProviderResults } from "@/db/experiment-provider-results";
import { createExecutionTextFailureRecovery } from "@/lib/operations/execution-text-recovery";
import type { RecoverySnapshot } from "@/lib/operations/booklet-recovery";
import { realReadinessManifestSchema } from "@/lib/experiment-runner/real-config";
import manifest from "@/tests/fixtures/m5-retained-real-readiness.json";
import { defaultExecutionAllowance, executionPolicySnapshot, realExecutionPolicyFromM4TechnicalProfile } from "@/lib/experiment-runner/execution-policy";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import type { WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { specialistTaskSchema } from "@/lib/contracts/experiment-runner";
import * as recoveryInspection from "@/lib/operations/recovery-inspection";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const runId = "f811de3a-f4af-4b9e-88a7-7d8d597c5d21", operationId = "b48a84f9-ef4f-48b3-b353-87b6790d1dcf";
const databases: Database[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.splice(0).map(closeTestDatabase)); });
async function setup() {
  const ready = realReadinessManifestSchema.parse(manifest);
  if (ready.state !== "ready") throw new Error("Retained manifest unavailable");
  const retainedPublications = ready.publications.map(item => item.role === "manager"
    ? { ...item, publishedWorkflowId: "6e1ebf6d-94e1-4265-9733-764504a0ddba" } : item);
  const profile = realExecutionPolicyFromM4TechnicalProfile(ready.sourcePolicy, ready.tokenPolicy, retainedPublications,
    { ...ready, executionVersion: "execution_v1" });
  expect(executionPolicySnapshot(profile).hash).toBe("9fab201953ff06cba920713dded4a8f623f28fa44fbeb9fc34bf6a7390a80f8e");
  const db = await createTestDatabase({ seedAgents: false }); databases.push(db);
  const ledger = createExecutionAllowanceLedger(db), repository = createExperimentRepository(db, { realExecutionEnabled: true });
  await withMongoTransaction(db, session => ledger.create(session, { campaignId: "00000000-0000-4000-8000-000000000001", mode: "real", persona: "playful_kid",
    profile, approvalId: "00000000-0000-4000-8000-000000000002", reference: "fake-provider-recovery", totals: defaultExecutionAllowance("playful_kid", 5_000_000), nowMs: 1 }));
  await repository.createRun({ runId, bookletId: "00000000-0000-4000-8000-000000000003", persona: "playful_kid", mode: "real", executionCampaignId: "00000000-0000-4000-8000-000000000001", nowMs: 2,
    configuration: profile.publications.filter(row => row.persona === null || row.persona === "playful_kid")
      .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({ role, taskId, appId,
        publishedWorkflowId, toolProviderId, ...(finalPageIllustration ? { finalPageIllustration } : {}) })) });
  const run = (await repository.getRun(runId))!;
  await repository.prepareOperation({ runId, operationId, expectedRevision: run.revision, role: "manager", taskId: null,
    subjectKind: "book", subjectId: run.bookletId, inputFingerprint: "d".repeat(64), attempt: 1, providerKind: "text", nowMs: 3 });
  const prep = await createM4TextPreparation(db, { executionProfile: profile, campaignId: "00000000-0000-4000-8000-000000000001" }, { elapsedNow: () => 0 })
    .prepare({ runId, operationId, nowMs: 4 });
  await repository.beginDispatch({ runId, operationId, parentWorkflowRunId: null, nowMs: 5 });
  const identity = { runId, operationId, workflowRunId: "00000000-0000-4000-8000-000000000004", parentWorkflowRunId: null, nowMs: 6 };
  await repository.recordDispatchIdentity(identity);
  const publication = profile.publications.find(row => row.role === "manager")!;
  await repository.verifyDispatchPublication({ ...identity, workflowId: publication.publishedWorkflowId });
  await repository.claimOperation(identity);
  const wrapper = JSON.stringify({ schemaVersion: "booklet_provider_v2", content: "", providerEvidence: {
    provider: "openai", apiBaseUrl: "https://api.openai.com/v1", model: "gpt-6-luna", serviceTier: "default",
    stdioSdk: { version: "0.10.2", readerSha256: "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22" },
    responseId: "resp_fake", requestId: "req_fake", status: "incomplete", refused: false, incompleteReason: "max_output_tokens",
    requestDigest: prep.requestDigest, countedInputTokens: 368,
    usage: { source: "provider_reported", inputTokens: 368, outputTokens: 2048, cachedInputTokens: 0,
      cacheWriteInputTokens: 0, reasoningOutputTokens: 0 },
    effectivePolicy: { version: "m4_context_policy_v2", hash: profile.tokenPolicy.hash, maxInputTokens: 128000, warningInputTokens: 32000 }, contextWarnings: [],
  } });
  const runtime: WorkflowRuntime = { start: vi.fn(async () => { throw new Error("Provider POST prohibited"); }),
    retrieve: vi.fn(async () => ({ kind: "execution" as const, execution: { id: "00000000-0000-4000-8000-000000000004", workflow_id: publication.publishedWorkflowId,
      status: "succeeded" as const, outputs: { booklet_provider_result: wrapper } } })) };
  const bindings = profile.publications.map(row => ({ ...row, taskId: specialistTaskSchema.nullable().parse(row.taskId), apiKey: "fake-key" }));
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid",
    callbackKey: "fake", bindings, real: { ...ready, bindings } };
  await db.collections.experiment_operations.updateOne({ _id: operationId }, { $set: { resultFinalizationClaim: { id: "claim", expiresAtMs: 100 } } });
  await createM4ProviderResults(db, { executionProfile: profile, campaignId: "00000000-0000-4000-8000-000000000001" }, config, runtime).observe({ runId, operationId, nowMs: 7 });
  const original = (await repository.getOperation(operationId))!;
  const now = original.deadlineAtMs! + 1;
  await db.collections.experiment_operations.updateOne({ _id: operationId }, { $set: { resultFinalizationClaim: null,
    lifecycle: { ...original.lifecycle!, phase: "finished", attemptOutcome: "failed", unresolved: true,
      endedAtMs: now, timeoutAtMs: now, stop: { requestedAtMs: now, reason: "deadline", delivery: "acknowledged" } } } });
  await db.collections.deployment_control.insertOne({ _id: "control", schemaVersion: "1", environment: "_staging", maintenance: false,
    draining: false, activeMutations: 0, interruptedMutations: 0, mutationOwners: [], reason: null, updatedAtMs: now });
  const target = { runId, operationId, expectedRevision: (await repository.getRun(runId))!.revision };
  const closeAdmission = () => db.collections.deployment_control.updateOne({ _id: "control" }, { $set: { maintenance: true } });
  return { db, repository, runtime, config, target, closeAdmission,
    service: createExecutionTextFailureRecovery({ database: db, config, runtime, now: () => now + 1 }) };
}

describe("Exact retained execution manager recovery with disposable persistence", () => {
  it.each(["preview", "apply"])("preserves sanitized inspection failure during %s without mutation", async phase => {
    const env = await setup();
    const proof = await env.service.preview(env.target);
    if (phase === "apply") await env.closeAdmission();
    vi.spyOn(recoveryInspection, "inspectRecoveryWork").mockResolvedValue({
      schemaVersion: "1", environment: "_staging", inspectedAtMs: 9, outcome: "inspection_error",
      admission: null, blockers: [], inspectionError: { stage: "operations", errorKind: "MongoOperationTimeoutError" },
    });
    const checkpoint = vi.fn();
    const action = phase === "preview" ? env.service.preview(env.target)
      : env.service.apply(env.target, proof.previewDigest, checkpoint);
    await expect(action).rejects.toMatchObject({ code: "inspection_error", stage: "operations", errorKind: "MongoOperationTimeoutError" });
    expect(checkpoint).not.toHaveBeenCalled();
    expect(await env.repository.getRun(runId)).toMatchObject({ activeOperationId: operationId });
    expect(env.runtime.start).not.toHaveBeenCalled();
  });
  it("pins an open preview then closes once and verifies a lost acknowledgement without provider replay", async () => {
    const env = await setup();
    const before = (await env.repository.getOperation(operationId))!;
    // A candidate may carry a newer publication; recovery retrieves the old one.
    for (const binding of env.config.bindings.filter(row => row.role === "manager"))
      binding.publishedWorkflowId = "00000000-0000-4000-8000-000000000099";
    const proof = await env.service.preview(env.target);
    expect(env.runtime.retrieve).toHaveBeenLastCalledWith(expect.objectContaining({ publishedWorkflowId: before.verifiedWorkflowId }),
      before.workflowRunId, expect.any(Object));
    await env.closeAdmission();
    expect((await env.service.preview(env.target, true)).previewDigest).toBe(proof.previewDigest);
    let checkpoint: RecoverySnapshot | undefined;
    await env.service.apply(env.target, proof.previewDigest, async value => { checkpoint = value.snapshot; });
    expect(checkpoint).toEqual(proof.snapshot);
    expect(await env.service.verifyCompleted(env.target, checkpoint!)).toMatchObject({ outcome: "failure_closed", providerPosts: 0 });
    const closed = await env.repository.getOperation(operationId), run = await env.repository.getRun(runId);
    expect(closed).toMatchObject({ state: "failed", deadlineAtMs: before.deadlineAtMs, m4Reservation: before.m4Reservation,
      lifecycle: { unresolved: false, endedAtMs: before.lifecycle!.endedAtMs, timeoutAtMs: before.lifecycle!.timeoutAtMs, stop: before.lifecycle!.stop } });
    expect(run).toMatchObject({ revision: env.target.expectedRevision + 1, activeOperationId: null, status: "blocked", safeFailure: "definite_failure" });
    await env.service.verifyCompleted(env.target, checkpoint!);
    expect(await env.repository.getOperation(operationId)).toEqual(closed);
    expect(await env.repository.getRun(runId)).toEqual(run);
    expect(env.runtime.start).not.toHaveBeenCalled();
  });
  it("rejects a revision change during checkpoint I/O inside the closure transaction", async () => {
    const env = await setup(), proof = await env.service.preview(env.target);
    await env.closeAdmission();
    await expect(env.service.apply(env.target, proof.previewDigest, async () => {
      await env.db.collections.experiment_runs.updateOne({ _id: runId }, { $inc: { revision: 1 } });
    })).rejects.toThrow("execution_closure_failed");
    expect(await env.repository.getOperation(operationId)).toMatchObject({ state: "started", lifecycle: { unresolved: true } });
    expect(await env.repository.getRun(runId)).toMatchObject({ activeOperationId: operationId });
    expect(env.runtime.start).not.toHaveBeenCalled();
  });
  it.each(["revision", "evidence", "owner"])("rejects %s drift without closure", async kind => {
    const env = await setup(), proof = await env.service.preview(env.target);
    await env.closeAdmission();
    if (kind === "revision") await env.db.collections.experiment_runs.updateOne({ _id: runId }, { $inc: { revision: 1 } });
    if (kind === "evidence") await env.db.collections.experiment_operations.updateOne({ _id: operationId }, { $set: { "m4Observation.wrapperDigest": "a".repeat(64) } });
    if (kind === "owner") await env.db.collections.deployment_control.updateOne({ _id: "control" }, { $set: { activeMutations: 1,
      mutationOwners: [{ id: "other", processId: "other", state: "active", startedAtMs: 9 }] } });
    const checkpoint = vi.fn();
    await expect(env.service.apply(env.target, proof.previewDigest, checkpoint)).rejects.toThrow();
    expect(checkpoint).not.toHaveBeenCalled();
    expect(await env.repository.getRun(runId)).toMatchObject({ activeOperationId: operationId });
    expect(env.runtime.start).not.toHaveBeenCalled();
  });
});
