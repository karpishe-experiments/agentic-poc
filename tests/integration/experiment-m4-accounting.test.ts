import { afterEach, describe, expect, it, vi } from "vitest";
import { withMongoTransaction, type Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createM4TextPreparation } from "@/db/experiment-text-preparation";
import { createM4ProviderResults } from "@/db/experiment-provider-results";
import { readM4AccountingOperations, readM4FailedOperations } from "@/db/experiment-m4-accounting-evidence";
import { verifyM4Accounting } from "@/db/experiment-m4-accounting";
import { undispatchedTextDigest } from "@/db/experiment-undispatched-text";
import type { ExperimentOperationDocument } from "@/db/documents";
import { createVerificationAttempt } from "@/lib/experiment-runner/verification-attempt";
import { specialistTaskSchema } from "@/lib/contracts/experiment-runner";
import { m4RequestBundleHash } from "@/lib/experiment-runner/m4-request";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import type { RuntimeResult, WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

// One real preparation/claim/GET/materialization sequence in an isolated DB.
// This proves the accounting component, not completion of a persona booklet.
async function setup(cached = false) {
  const db = await createTestDatabase({ seedAgents: false }); databases.push(db);
  const policy = { ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash() };
  const authority = { policy, grant: { campaignId: id(1), reference: "fake-provider-accounting-only" } };
  const repository = createExperimentRepository(db, { m4Authority: authority, m4ExecutionEnabled: true, elapsedNow: () => 0 });
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid", callbackKey: "fixture",
    bindings: policy.publications.map((item) => ({ ...item, taskId: specialistTaskSchema.nullable().parse(item.taskId), apiKey: "fake-test-key" })) };
  await repository.createRun({ runId: id(10), bookletId: id(11), persona: "playful_kid", mode: "balanced", campaignId: id(1), nowMs: 1,
    configuration: policy.publications.filter((p) => p.persona === null || p.persona === "playful_kid")
      .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({
        role, taskId, appId, publishedWorkflowId, toolProviderId, ...(finalPageIllustration ? { finalPageIllustration } : {}),
      })) });
  await repository.prepareOperation({ runId: id(10), operationId: id(12), expectedRevision: 0, role: "manager", taskId: null,
    subjectKind: "book", subjectId: id(11), inputFingerprint: "b".repeat(64), attempt: 1, providerKind: "text", nowMs: 2 });
  const prepared = await createM4TextPreparation(db, authority, { elapsedNow: () => 0 }).prepare({ runId: id(10), operationId: id(12), nowMs: 3 });
  await repository.beginDispatch({ runId: id(10), operationId: id(12), parentWorkflowRunId: null, nowMs: 4 });
  const claim = { runId: id(10), operationId: id(12), workflowRunId: id(13), parentWorkflowRunId: null, nowMs: 5 };
  await repository.recordDispatchIdentity(claim);
  await repository.verifyDispatchPublication({ ...claim, workflowId: policy.publications[0].publishedWorkflowId });
  await repository.claimOperation({ ...claim, nowMs: 6 });
  const result = { kind: "delegate" as const, payload: { taskId: "J01" as const, subjectKind: "book" as const, subjectId: id(11) } };
  const wrapper = { schemaVersion: "booklet_provider_v1", content: JSON.stringify({ result }), providerEvidence: {
    provider: "openai", apiBaseUrl: "https://api.openai.com/v1",
    stdioSdk: { version: "0.10.2", readerSha256: "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22" },
    responseId: "resp_fake", requestId: "req_fake", model: "gpt-6-luna", serviceTier: "default", status: "completed",
    refused: false, incompleteReason: null, requestDigest: prepared.requestDigest, countedInputTokens: 100,
    usage: { source: "provider_reported", inputTokens: 100, outputTokens: 100, cachedInputTokens: 0, cacheWriteInputTokens: null, reasoningOutputTokens: 0 },
  } };
  const runtime: WorkflowRuntime = { start: vi.fn(async () => { throw new Error("Provider POST forbidden"); }),
    retrieve: vi.fn(async (): Promise<RuntimeResult> => ({ kind: "execution", execution: { id: id(13), workflow_id: policy.publications[0].publishedWorkflowId,
      status: "succeeded", outputs: { booklet_provider_result: JSON.stringify(wrapper) } } })) };
  const observer = createM4ProviderResults(db, authority, config, runtime);
  const completion = { envelope: { runId: id(10), operationId: id(12), workflowRunId: id(13), inputFingerprint: "b".repeat(64), result },
    parentWorkflowRunId: null, nowMs: 8 };
  const observe = () => observer.observe({ runId: id(10), operationId: id(12), nowMs: 7 });
  const verify = () => withMongoTransaction(db, async (session) => verifyM4Accounting(db, session,
    (await db.collections.experiment_runs.findOne({ _id: id(10) }, { session }))!, undefined,
    cached ? createVerificationAttempt({ get: vi.fn(), put: vi.fn(), exists: vi.fn() }) : undefined));
  const campaign = () => db.collections.experiment_campaigns.findOne({ _id: id(1) });
  const records = async () => ({ run: await repository.getRun(id(10)), operation: await repository.getOperation(id(12)), campaign: await campaign() });
  return { db, repository, authority, config, runtime, completion, observe, verify, campaign, records };
}

describe.each([false, true])("Balanced accounting and original-result completion (cached=%s)", (cached) => {
  it("accepts attributed settled evidence and keeps duplicate valid completion and exit verification read-only", async () => {
    const env = await setup(cached);
    expect(await env.observe()).toMatchObject({ kind: "result", result: env.completion.envelope.result });
    expect(env.runtime.retrieve).toHaveBeenCalledWith(env.config.bindings[0], id(13));
    expect(env.runtime.start).not.toHaveBeenCalled();
    expect((await env.repository.completeOperation(env.completion)).reused).toBe(false);
    const before = await env.records();
    expect(before.campaign).toMatchObject({ requests: 1, settledMicrodollars: 63, reservedMicrodollars: 0 });
    expect((await env.repository.completeOperation(env.completion)).reused).toBe(true);
    await env.verify();
    expect(await env.records()).toEqual(before);
    expect(before.run).toMatchObject({ status: "queued", activeOperationId: null, counters: { logicalText: 1, payableText: 1, steps: 1 } });
    expect(await env.db.collections.artifacts.countDocuments({ experimentRunId: id(10) })).toBe(0);
  });

  it("rejects a callback's plausible result without original GET evidence before materialization", async () => {
    const env = await setup(cached); const before = await env.records();
    await expect(env.repository.completeOperation(env.completion)).rejects.toMatchObject({ code: "invalid_result" });
    expect(env.runtime.retrieve).not.toHaveBeenCalled();
    expect(await env.repository.getRun(id(10))).toEqual(before.run);
    expect(await env.campaign()).toEqual(before.campaign);
    expect(await env.repository.getOperation(id(12))).toMatchObject({ state: "started", resultJson: null, materializationJson: null, reservationCount: 1 });
    expect((await env.repository.getOperation(id(12)))!.m4Observation).toBeUndefined();
    expect(await env.db.collections.artifacts.countDocuments({ experimentRunId: id(10) })).toBe(0);
    await expect(env.verify()).rejects.toThrow("complete attributable accounting");
  });

  it("retains an unclaimed Pause attempt without inventing accounting after Resume", async () => {
    const env = await setup(cached); await env.observe(); await env.repository.completeOperation(env.completion);
    const before = await env.records();
    const runtime: WorkflowRuntime = {
      start: vi.fn<WorkflowRuntime["start"]>(async (binding, input, options) => {
        const execution = { id: id(50), workflow_id: binding.publishedWorkflowId, status: "succeeded" as const,
          outputs: { authorization_reason: "paused" } };
        const identity = { runId: id(10), operationId: input.operationId, workflowRunId: execution.id, parentWorkflowRunId: input.parentWorkflowRunId };
        await options?.onStarted?.(execution);
        await env.repository.verifyDispatchPublication({ ...identity, workflowId: binding.publishedWorkflowId, nowMs: 10 });
        const run = (await env.repository.getRun(id(10)))!;
        await env.repository.pause({ runId: id(10), expectedRevision: run.revision, nowMs: 11 });
        expect((await env.repository.claimOperation({ ...identity, nowMs: 12 })).started).toBe(false);
        return { kind: "execution", execution };
      }),
      retrieve: vi.fn(async () => { throw new Error("Unclaimed Pause has no provider result"); }),
    };
    const dispatcher = createExperimentDispatcher({ database: env.db, config: { ...env.config, m4: { state: "granted", authority: env.authority } },
      runtime, now: () => 9, mutate: async (action) => action() });
    await dispatcher.advance(id(10));
    const history = await env.repository.listOperations(id(10));
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({ state: "failed", safeFailure: null, reservationCount: 0, remoteStatus: "succeeded", workflowRunId: id(50) });
    expect(history[1].m4Reservation).toBeUndefined();
    expect(history[1].m4Observation).toBeUndefined();
    const paused = (await env.repository.getRun(id(10)))!;
    await env.repository.resume({ runId: id(10), expectedRevision: paused.revision, nowMs: 13 });
    const proofReads = vi.spyOn(env.db.collections.experiment_operations, "find");
    await env.verify();
    if (cached) expect(proofReads.mock.calls.some(([filter]) => filter && "_id" in filter)).toBe(false);
    proofReads.mockRestore();
    expect((await env.repository.getRun(id(10)))!.counters).toEqual(before.run!.counters);
    expect(await env.campaign()).toEqual(before.campaign);
    expect(await env.repository.listOperations(id(10))).toEqual(history);
    for (const field of ["resultJson", "materializationJson"] as const) {
      await env.db.collections.experiment_operations.updateOne({ _id: history[1]._id }, { $set: { [field]: "unexpected-saved-body" } });
      await expect(env.verify()).rejects.toThrow("complete attributable accounting");
      await env.db.collections.experiment_operations.updateOne({ _id: history[1]._id }, { $set: { [field]: null } });
    }
    await env.verify();
    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(runtime.retrieve).not.toHaveBeenCalled();
  });

  it("projects large successful bodies out but retains exact failed bodies without rewriting storage", async () => {
    const env = await setup(cached); await env.observe(); await env.repository.completeOperation(env.completion);
    const resultJson = JSON.stringify({ privateBody: "x".repeat(300_000) });
    const materializationJson = JSON.stringify({ privateMaterialization: "y".repeat(300_000) });
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { resultJson, materializationJson } });
    const read = () => withMongoTransaction(env.db, session => readM4AccountingOperations(env.db, session, id(10)));
    const successful = (await read())[0];
    expect(successful.resultJson).toBeNull(); expect(successful.materializationJson).toBeNull();
    expect(JSON.stringify(successful).length).toBeLessThan(20_000);
    await env.verify();
    expect(await env.repository.getOperation(id(12))).toMatchObject({ resultJson, materializationJson });
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { state: "failed" } });
    expect((await read())[0]).toMatchObject({ resultJson, materializationJson });
    await expect(env.verify()).rejects.toThrow("complete attributable accounting");
  });

  it("rejects a retained failed claimed operation even when its safeFailure is null", async () => {
    const env = await setup(cached); await env.observe(); await env.repository.completeOperation(env.completion); await env.verify();
    // Isolated corruption fixture: a paid failed attempt cannot use the Pause exclusion.
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { state: "failed", safeFailure: null } });
    const before = await env.records();
    await expect(env.verify()).rejects.toThrow("complete attributable accounting");
    expect(await env.records()).toEqual(before);
  });

  it("omits only unused failed-operation transport fields and preserves all proof bytes and stored history", async () => {
    const env = await setup(cached); await env.observe(); await env.repository.completeOperation(env.completion);
    const large = JSON.stringify({ retainedTransport: "x".repeat(300_000) });
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: {
      state: "failed", imageRequestJson: large, referenceUploadsJson: large, referenceUploadJournalJson: large, warningsJson: large,
    } });
    const original = (await env.repository.getOperation(id(12)))!;
    const projected = await withMongoTransaction(env.db, async session => (await readM4FailedOperations(env.db, session, id(10),
      [id(12)], createVerificationAttempt({ get: vi.fn(), put: vi.fn(), exists: vi.fn() }))).get(id(12))!);
    const expected = { ...original };
    for (const field of ["imageRequestJson", "referenceUploadsJson", "referenceUploadJournalJson", "warningsJson"] as const) {
      Reflect.deleteProperty(expected, field); expect(projected).not.toHaveProperty(field);
    }
    expect(projected).toEqual(expected);
    expect(projected.m4Preparation).toEqual(original.m4Preparation);
    expect(JSON.stringify(original).length - JSON.stringify(projected).length).toBeGreaterThan(1_200_000);
    await expect(env.verify()).rejects.toThrow("complete attributable accounting");
    expect(await env.repository.getOperation(id(12))).toEqual(original);
  });

  it("rejects tampered creative content even after valid GET and settlement", async () => {
    const env = await setup(cached); await env.observe(); const before = await env.records();
    await expect(env.repository.completeOperation({ ...env.completion, envelope: { ...env.completion.envelope,
      result: { ...env.completion.envelope.result, payload: { ...env.completion.envelope.result.payload, taskId: "J02" } },
    } })).rejects.toThrow("must match retained provider evidence and usage");
    expect(await env.repository.getRun(id(10))).toEqual(before.run);
    expect(await env.campaign()).toEqual(before.campaign);
    expect((await env.repository.getOperation(id(12)))!.m4Observation).toEqual(before.operation!.m4Observation);
    expect(await env.repository.getOperation(id(12))).toMatchObject({ state: "started", resultJson: null, materializationJson: null });
    expect((await env.repository.completeOperation(env.completion)).reused).toBe(false);
    await env.verify();
  });

  it.each([
    { name: "payable count", target: "run", patch: { "counters.payableText": 0 } },
    { name: "step count", target: "run", patch: { "counters.steps": 2 } },
    { name: "paid image count", target: "run", patch: { "counters.payableImage": 1 } },
    { name: "campaign policy", target: "campaign", patch: { policyHash: "0".repeat(64) } },
    { name: "campaign persona count", target: "campaign", patch: { "requestCounts.playful_kid": 0 } },
    { name: "campaign request total", target: "campaign", patch: { requests: 0 } },
    { name: "campaign settled total", target: "campaign", patch: { settledMicrodollars: 0 } },
    { name: "campaign unexplained reservation", target: "campaign", patch: { reservedMicrodollars: 1 } },
    { name: "settled operation amount", target: "operation", patch: { "m4Reservation.settledMicrodollars": 0 } },
    { name: "unsettled verified-count amount", target: "operation", patch: { "m4Reservation.unsettledMicrodollars": 1 } },
    { name: "provider usage evidence", target: "operation", patch: { "m4Observation.evidenceJson": "{}" } },
    { name: "original observation status", target: "operation", patch: { "m4Observation.remoteStatus": "failed" } },
  ])("rejects $name corruption at accounting exit", async ({ target, patch }) => {
    const env = await setup(cached); await env.observe(); await env.repository.completeOperation(env.completion); await env.verify();
    if (target === "run") await env.db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: patch });
    else if (target === "campaign") await env.db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: patch });
    else await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: patch });
    const before = await env.records();
    await expect(env.verify()).rejects.toThrow("complete attributable accounting");
    expect(await env.records()).toEqual(before);
  });
});

describe("exact retained-manager progress recovery", () => {
  async function blockedProgress() {
    const env = await setup();
    await env.observe(); await env.repository.completeOperation(env.completion);
    const run = (await env.repository.getRun(id(10)))!;
    // Seed the historical linkage that predates the loop-counter correction.
    // The manager itself uses setup's real preparation/claim/original GET/save.
    const failed: ExperimentOperationDocument = {
      _id: id(14), runId: run._id, role: "specialist", taskId: "J01",
      subjectKind: "book", subjectId: run.bookletId, idempotencyKey: "historical-undispatched-specialist",
      inputFingerprint: "c".repeat(64), attempt: 1, mode: "balanced", providerKind: "text", state: "failed",
      workflowRunId: null, parentWorkflowRunId: null, reservationCount: 0, deadlineAtMs: 100,
      resultJson: null, resultDigest: null, warningsJson: "[]", expectedTargetVersionId: null,
      dependencyVersionIds: [], materializationJson: null, safeFailure: "definite_failure",
      lifecycle: { startedAtMs: 1, ownerId: id(15), phase: "finished", lastProgressAtMs: 1,
        endedAtMs: 1, attemptOutcome: "failed", unresolved: false }, createdAtMs: 1, updatedAtMs: 1,
    };
    const proof = undispatchedTextDigest(env.authority, run, failed);
    expect(proof).toMatch(/^[a-f0-9]{64}$/);
    failed.m4Continuation = { kind: "undispatched_text_v1", evidenceDigest: proof!, requestDigest: null,
      reference: "exact-historical-preparation", resumedAtMs: 2, runRevision: 1, campaignRevision: 1, nextOperationId: id(12) };
    await env.db.collections.experiment_operations.insertOne(failed);
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { m4ContinuedFromOperationId: failed._id } });
    await env.db.collections.experiment_runs.updateOne({ _id: run._id }, { $set: {
      status: "blocked", safeFailure: "definite_failure", noProgressCount: 3,
      progressOperationId: id(12), progressFingerprint: "d".repeat(64),
    } });
    await env.db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { state: "stopped" } });
    const authority = { ...env.authority, grant: { ...env.authority.grant,
      continuations: [{ runId: run._id, operationId: failed._id, reference: failed.m4Continuation.reference }],
      progressRecoveries: [{ runId: run._id, operationId: id(12), reference: "exact-retained-manager" }] } };
    const repository = createExperimentRepository(env.db, { m4Authority: authority, m4ExecutionEnabled: true, elapsedNow: () => 0 });
    const snapshot = async () => ({ run: await repository.getRun(run._id), campaign: await env.campaign(),
      operations: await env.db.collections.experiment_operations.find({ runId: run._id }).sort({ _id: 1 }).toArray() });
    return { ...env, authority, repository, snapshot };
  }

  it("recovers once under concurrency, preserves evidence and reuses the saved manager parent", async () => {
    const env = await blockedProgress(), before = await env.snapshot();
    const providerCalls = vi.mocked(env.runtime.retrieve).mock.calls.length;
    const input = { runId: id(10), expectedRevision: before.run!.revision, nowMs: 10 };
    const results = await Promise.allSettled([env.repository.resume(input), env.repository.resume(input)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const after = await env.snapshot();
    expect(after.run).toMatchObject({ status: "queued", safeFailure: null, noProgressCount: 0,
      progressFingerprint: before.run!.progressFingerprint, progressOperationId: id(12), counters: before.run!.counters,
      m4ProgressRecovery: { operationId: id(12), failedOperationId: id(14), priorNoProgressCount: 3 } });
    expect(after.operations).toEqual(before.operations);
    for (const key of ["requests", "requestCounts", "reservedMicrodollars", "settledMicrodollars"] as const)
      expect(after.campaign![key]).toEqual(before.campaign![key]);
    expect(await env.repository.resume({ ...input, expectedRevision: after.run!.revision })).toEqual(after.run);
    await env.verify();
    expect(env.runtime.start).not.toHaveBeenCalled();
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(providerCalls);
    const successor = await env.repository.prepareOperation({ runId: id(10), operationId: id(16),
      expectedRevision: after.run!.revision, role: "specialist", taskId: "J01", subjectKind: "book", subjectId: id(11),
      inputFingerprint: "e".repeat(64), attempt: 1, providerKind: "text", nowMs: 11 });
    const preparation = await createM4TextPreparation(env.db, env.authority, { elapsedNow: () => 0 })
      .prepare({ runId: id(10), operationId: successor._id, nowMs: 12 });
    expect(preparation.parentWorkflowRunId).toBe(id(13));
    expect((await env.repository.listOperations(id(10))).filter(operation => operation.role === "manager")).toHaveLength(1);
    expect(env.runtime.start).not.toHaveBeenCalled();
    // A consumed progress grant must not shadow a later, separately authorized
    // preparation failure while the saved manager is still the progress owner.
    await env.repository.failPreparation(id(10), successor._id, 13);
    const blockedAgain = (await env.repository.getRun(id(10)))!;
    const nextAuthority = { ...env.authority, grant: { ...env.authority.grant, continuations: [
      ...env.authority.grant.continuations, { runId: id(10), operationId: successor._id, reference: "separate-next-failure" },
    ] } };
    const nextRepository = createExperimentRepository(env.db, { m4Authority: nextAuthority, m4ExecutionEnabled: true, elapsedNow: () => 0 });
    const continued = await nextRepository.resume({ runId: id(10), expectedRevision: blockedAgain.revision, nowMs: 14 });
    expect(continued).toMatchObject({ status: "queued", noProgressCount: 0, m4ProgressRecovery: after.run!.m4ProgressRecovery });
    expect(continued.counters).toEqual(blockedAgain.counters);
    expect(env.runtime.start).not.toHaveBeenCalled();
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(providerCalls);
  });

  it.each(["result", "materialization", "digest", "publication", "proof", "chain", "owner", "expired_claim", "target", "accounting"] as const)
  ("rolls back recovery for changed %s", async fault => {
    const env = await blockedProgress();
    const operations = env.db.collections.experiment_operations;
    if (fault === "result") await operations.updateOne({ _id: id(12) }, { $set: { resultJson: JSON.stringify({ kind: "ask", payload: { question: "changed" } }) } });
    if (fault === "materialization") await operations.updateOne({ _id: id(12) }, { $set: { materializationJson: JSON.stringify({ delegatedTaskId: "J02" }) } });
    if (fault === "digest") await operations.updateOne({ _id: id(12) }, { $set: { resultDigest: "f".repeat(64) } });
    if (fault === "publication") await operations.updateOne({ _id: id(12) }, { $set: { verifiedWorkflowId: id(999) } });
    if (fault === "proof") await operations.updateOne({ _id: id(14) }, { $set: { "m4Continuation.evidenceDigest": "f".repeat(64) } });
    if (fault === "chain") await operations.updateOne({ _id: id(14) }, { $set: { "m4Continuation.nextOperationId": id(999) } });
    if (fault === "owner") await env.db.collections.deployment_control.insertOne({ _id: "environment:_staging", schemaVersion: "1", environment: "_staging",
      maintenance: false, activeMutations: 1, interruptedMutations: 0, reason: null, updatedAtMs: 9,
      mutationOwners: [{ id: id(20), processId: id(21), operationId: id(12), startedAtMs: 9, state: "active" }] });
    if (fault === "expired_claim") await operations.updateOne({ _id: id(14) }, { $set: { authorizationClaim: { id: id(22), expiresAtMs: 1 } } });
    if (fault === "target") await env.db.collections.artifacts.insertOne({ _id: id(30), bookletId: id(11), experimentRunId: id(10),
      artifactType: "concept", taskId: "J01", subjectKind: "book", subjectId: id(11), state: "approved", currentVersionId: id(31), createdAtMs: 1, updatedAtMs: 1 });
    if (fault === "accounting") await env.db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $inc: { settledMicrodollars: 1 } });
    const before = await env.snapshot(), calls = vi.mocked(env.runtime.retrieve).mock.calls.length;
    await expect(env.repository.resume({ runId: id(10), expectedRevision: before.run!.revision, nowMs: 10 })).rejects.toThrow();
    expect(await env.snapshot()).toEqual(before);
    expect(env.runtime.start).not.toHaveBeenCalled(); expect(env.runtime.retrieve).toHaveBeenCalledTimes(calls);
  });
});
