import { afterEach, describe, expect, it, vi } from "vitest";
import { withMongoTransaction, type Database } from "@/db/client";
import { verifyM4Accounting } from "@/db/experiment-m4-accounting";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createM4TextPreparation } from "@/db/experiment-text-preparation";
import { createM4ProviderResults } from "@/db/experiment-provider-results";
import { closeM4KnownFailure } from "@/db/experiment-provider-failure";
import { m4UnclaimedFailureDigest } from "@/db/experiment-unclaimed-failure";
import { m4RequestBundleHash, m4RequestDefinition } from "@/lib/experiment-runner/m4-request";
import { createBookletRecovery, readRecoveryInventory, recoveryDigest } from "@/lib/operations/booklet-recovery";
import { LEGACY_COUNT_PLUGIN_IDENTITY, LEGACY_COUNT_GUARD_SOURCE_SHA256 } from "@/lib/experiment-runner/m4-legacy-count-failure";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import type { RuntimeResult, WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { specialistTaskSchema } from "@/lib/contracts/experiment-runner";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
async function setup(continuation = false, claimProvider = true, legacy = false, adapterVersion: "1.0.7-dev3" | "1.0.7-dev4" = "1.0.7-dev3", role: "manager" | "tester" = "manager") {
  const db = await createTestDatabase({ seedAgents: false }); databases.push(db);
  const policy = { ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash(),
    ...(legacy ? { pluginIdentity: LEGACY_COUNT_PLUGIN_IDENTITY } : {}),
    countChargeStatus: "assumed" as const, countChargeCeilingMicrodollars: 900 };
  const authority = { policy, grant: { campaignId: id(1), reference: "fake-provider-only",
    ...(!legacy ? { providerAdapterUpdate: { fromIdentity: policy.pluginIdentity, version: adapterVersion,
      packageSha256: "a".repeat(64), reference: "fake-adapter-only" } } : {}),
    ...(continuation ? { continuations: [{ runId: id(10), operationId: id(12), reference: "explicit-inspected-fixture-continuation" }] } : {}) } };
  const repository = createExperimentRepository(db, { m4Authority: authority, m4ExecutionEnabled: true, elapsedNow: () => 0 });
  const configuration = policy.publications.filter((p) => p.persona === null || p.persona === "playful_kid")
    .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({ role, taskId, appId, publishedWorkflowId, toolProviderId,
      ...(finalPageIllustration ? { finalPageIllustration } : {}) }));
  await repository.createRun({ runId: id(10), bookletId: id(11), persona: "playful_kid", mode: "balanced", campaignId: id(1), nowMs: 1, configuration });
  const publication = policy.publications.find(p => p.role === role && (p.persona === null || p.persona === "playful_kid"))!;
  await repository.prepareOperation({ runId: id(10), operationId: id(12), expectedRevision: 0, role, taskId: null,
    subjectKind: "book", subjectId: id(11), inputFingerprint: "b".repeat(64), attempt: 1, providerKind: "text", nowMs: 2 });
  const prepared = await createM4TextPreparation(db, authority, { elapsedNow: () => 0 }).prepare({ runId: id(10), operationId: id(12), nowMs: 3 });
  await repository.beginDispatch({ runId: id(10), operationId: id(12), parentWorkflowRunId: null, nowMs: 4 });
  const claim = { runId: id(10), operationId: id(12), workflowRunId: id(13), parentWorkflowRunId: null, nowMs: 5 };
  await repository.recordDispatchIdentity(claim);
  await repository.verifyDispatchPublication({ ...claim, workflowId: publication.publishedWorkflowId });
  if (claimProvider) await repository.claimOperation(claim);
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid", callbackKey: "fixture",
    bindings: policy.publications.map((p) => ({ ...p, taskId: specialistTaskSchema.nullable().parse(p.taskId), apiKey: `fake-key-${p.appId}` })) };
  const wrapper = { schemaVersion: "booklet_provider_v1", content: JSON.stringify({ result: { kind: "delegate",
    payload: { taskId: "J01", subjectKind: "book", subjectId: id(11) } } }), providerEvidence: {
    provider: "openai", apiBaseUrl: "https://api.openai.com/v1",
    stdioSdk: { version: "0.10.2", readerSha256: "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22" },
    responseId: "resp_fake", requestId: "req_fake", model: "gpt-6-luna", serviceTier: "default", status: "completed",
    refused: false, incompleteReason: null as string | null, requestDigest: prepared.requestDigest, countedInputTokens: 100,
    usage: { source: "provider_reported", inputTokens: 100 as number | null, outputTokens: 100,
      cachedInputTokens: 0, cacheWriteInputTokens: null, reasoningOutputTokens: 0 },
  } };
  const execution = { id: id(13), workflow_id: publication.publishedWorkflowId, status: "succeeded" as const,
    outputs: { booklet_provider_result: JSON.stringify(wrapper) } };
  const runtime: WorkflowRuntime = { start: vi.fn(async () => { throw new Error("No POST allowed"); }),
    retrieve: vi.fn(async (): Promise<RuntimeResult> => ({ kind: "execution", execution: { ...execution,
      outputs: { booklet_provider_result: JSON.stringify(wrapper) } } })) };
  const observer = createM4ProviderResults(db, authority, config, runtime);
  const input = { runId: id(10), operationId: id(12), nowMs: 8 };
  const campaign = () => db.collections.experiment_campaigns.findOne({ _id: id(1) });
  return { db, repository, authority, config, runtime, wrapper, execution, observer, input, campaign };
}

describe("exact generation-stage reviewer input continuation", () => {
  async function fixture(granted = true, code = "input_limit_exceeded") {
    const env = await setup(granted, true, false, "1.0.7-dev4", "tester");
    const original = (await env.repository.getOperation(id(12)))!;
    const failure = { schemaVersion: "booklet_pre_generation_failure_v1", content: "", failureEvidence: {
      provider: "openai", apiBaseUrl: "https://api.openai.com/v1", adapterVersion: "1.0.7-dev4", stdioSdk: env.wrapper.providerEvidence.stdioSdk,
      model: "gpt-6-luna", serviceTier: "default", requestDigest: original.m4Preparation!.requestDigest,
      stage: "input_count", code, countedInputTokens: code === "input_limit_exceeded" ? 32923 : null,
      limit: 32000, generationStarted: false, elapsedMs: 5, countRequestId: null } };
    vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "execution", execution: { ...env.execution,
      outputs: { booklet_provider_result: JSON.stringify(failure) } } });
    expect(await env.observer.observe(env.input)).toEqual({ kind: "blocked" });
    expect(await env.repository.getOperation(id(12))).toMatchObject({ role: "tester", state: "failed", safeFailure: "definite_failure",
      m4Reservation: { bucket: "decision" }, lifecycle: { phase: "finished", unresolved: false } });
    const resume = async () => createExperimentRepository(env.db, { m4Authority: env.authority, m4ExecutionEnabled: true, elapsedNow: () => 0 })
      .resume({ runId: id(10), expectedRevision: (await env.repository.getRun(id(10)))!.revision, nowMs: 10 });
    const verify = () => withMongoTransaction(env.db, async session => verifyM4Accounting(env.db, session,
      (await env.db.collections.experiment_runs.findOne({ _id: id(10) }, { session }))!));
    return { ...env, resume, verify };
  }
  it("continues once concurrently without replay, preserves history and accepts accounting after generation", async () => {
    const env = await fixture(); const original = (await env.repository.getOperation(id(12)))!;
    env.runtime.stop = vi.fn(async () => ({ kind: "acknowledged" as const }));
    const beforeRun = (await env.repository.getRun(id(10)))!; const beforeCampaign = (await env.campaign())!;
    const results = await Promise.allSettled([env.resume(), env.resume()]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const resumed = (await env.repository.getRun(id(10)))!;
    expect(resumed).toMatchObject({ status: "queued", activeOperationId: null, safeFailure: null, counters: beforeRun.counters });
    const continued = (await env.repository.getOperation(id(12)))!;
    expect(continued).toEqual({ ...original, m4Continuation: { reference: "explicit-inspected-fixture-continuation",
      evidenceDigest: original.m4Observation!.evidenceDigest, requestDigest: original.m4Reservation!.requestDigest,
      resumedAtMs: 10, runRevision: beforeRun.revision, campaignRevision: beforeCampaign.revision, nextOperationId: null } });
    expect(await env.campaign()).toMatchObject({ state: "active", requests: beforeCampaign.requests,
      reservedMicrodollars: beforeCampaign.reservedMicrodollars, settledMicrodollars: beforeCampaign.settledMicrodollars });
    expect(await env.resume()).toEqual(resumed); await env.verify();
    const dispatcher = createExperimentDispatcher({ database: env.db, config: { ...env.config, m4: { state: "granted", authority: env.authority } },
      runtime: env.runtime, now: () => 30, mutate: async action => action() });
    await dispatcher.inspect({ runId: id(10), operationId: id(12) });
    await dispatcher.inspect({ runId: id(10), operationId: id(12), stop: "manual", expectedRevision: resumed.revision });
    vi.mocked(env.runtime.retrieve).mockResolvedValueOnce({ kind: "unknown" });
    await dispatcher.inspect({ runId: id(10), operationId: id(12) });
    expect(await env.repository.getRun(id(10))).toEqual(resumed);
    // Accounting-only exit fixture: generation validation belongs to the full persona suite.
    await env.db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { status: "completed", evaluationStatus: "complete",
      generationCompletedAtMs: 20, generationVersionIds: [id(100)] } });
    await env.verify();
    const completed = (await env.repository.getRun(id(10)))!;
    const completedCampaign = await env.campaign();
    for (const stop of [undefined, "manual"] as const) {
      await dispatcher.inspect({ runId: id(10), operationId: id(12), stop, expectedRevision: completed.revision });
      vi.mocked(env.runtime.retrieve).mockResolvedValueOnce({ kind: "unknown" });
      await dispatcher.inspect({ runId: id(10), operationId: id(12), stop, expectedRevision: completed.revision });
      expect(await env.repository.getRun(id(10))).toEqual(completed);
      expect(await env.repository.getOperation(id(12))).toEqual({ ...continued, remoteStatus: "succeeded" });
      expect(await env.campaign()).toEqual(completedCampaign);
      await env.verify();
    }
    expect(await env.repository.getOperation(id(12))).toEqual({ ...continued, remoteStatus: "succeeded" });
    expect(env.runtime.start).not.toHaveBeenCalled();
    expect(env.runtime.stop).not.toHaveBeenCalled();
  });
  it("preserves a continued reviewer on Stop when retained proof reads fail", async () => {
    const env = await fixture(); await env.resume();
    env.runtime.stop = vi.fn(async () => ({ kind: "acknowledged" as const }));
    await env.db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { status: "completed", evaluationStatus: "complete",
      generationCompletedAtMs: 20, generationVersionIds: [id(100)] } });
    const before = { run: await env.repository.getRun(id(10)), operation: await env.repository.getOperation(id(12)), campaign: await env.campaign() };
    vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "unknown" });
    const dispatcher = createExperimentDispatcher({ database: env.db, config: { ...env.config, m4: { state: "granted", authority: env.authority } },
      runtime: env.runtime, now: () => 30, mutate: async action => action() });
    const proofRead = vi.spyOn(env.db.collections.experiment_campaigns, "findOne").mockRejectedValue(new Error("fixture proof read unavailable"));
    try {
      await expect(dispatcher.inspect({ runId: id(10), operationId: id(12), stop: "manual", expectedRevision: before.run!.revision })).rejects.toThrow();
    } finally { proofRead.mockRestore(); }
    expect({ run: await env.repository.getRun(id(10)), operation: await env.repository.getOperation(id(12)), campaign: await env.campaign() }).toEqual(before);
    await env.verify();
    expect(env.runtime.start).not.toHaveBeenCalled(); expect(env.runtime.stop).not.toHaveBeenCalled();
  });
  it("links the next normal tester preparation once and reserves only its new request", async () => {
    const env = await fixture();
    const original = (await env.repository.getOperation(id(12)))!;
    const originalCampaign = (await env.campaign())!;
    const resumed = await env.resume();
    const nextInput = { runId: id(10), operationId: id(60), expectedRevision: resumed.revision, role: "tester" as const, taskId: null,
      subjectKind: "book" as const, subjectId: id(11), inputFingerprint: "c".repeat(64), attempt: 1, providerKind: "text" as const, nowMs: 11 };
    const next = await env.repository.prepareOperation(nextInput);
    expect(next.m4ContinuedFromOperationId).toBe(id(12));
    expect((await env.repository.getOperation(id(12)))!.m4Continuation!.nextOperationId).toBe(id(60));
    const preparation = createM4TextPreparation(env.db, env.authority, { elapsedNow: () => 0 });
    const prepared = await preparation.prepare({ runId: id(10), operationId: id(60), nowMs: 12 });
    expect(prepared.definitionHash).toBe(m4RequestDefinition({ role: "tester", taskId: null, persona: "playful_kid", report: false }).hash);
    expect(JSON.parse(prepared.contextJson)).toMatchObject({ role: "tester", currentArtifacts: [],
      evidenceScope: { artifactVersions: expect.stringContaining("Current versions only"), images: expect.stringContaining("not_assessed") } });
    expect(await preparation.prepare({ runId: id(10), operationId: id(60), nowMs: 12 })).toEqual(prepared);
    const claim = { runId: id(10), operationId: id(60), workflowRunId: id(61), parentWorkflowRunId: null, nowMs: 14 };
    await env.repository.beginDispatch({ runId: id(10), operationId: id(60), parentWorkflowRunId: null, nowMs: 13 });
    await env.repository.recordDispatchIdentity(claim);
    await env.repository.verifyDispatchPublication({ ...claim, workflowId: env.execution.workflow_id });
    await env.repository.claimOperation(claim); await env.repository.claimOperation(claim);
    const campaign = (await env.campaign())!;
    expect(campaign).toMatchObject({ requests: originalCampaign.requests + 1, settledMicrodollars: originalCampaign.settledMicrodollars,
      reservedMicrodollars: originalCampaign.reservedMicrodollars + original.m4Reservation!.maximumMicrodollars });
    expect((await env.repository.getOperation(id(12)))!.m4Reservation).toEqual(original.m4Reservation);
    expect((await env.repository.getOperation(id(12)))!.m4Continuation!.nextOperationId).toBe(id(60));
    expect(await env.db.collections.experiment_operations.countDocuments({ runId: id(10), m4ContinuedFromOperationId: id(12) })).toBe(1);
    expect((await env.repository.getRun(id(10)))!.counters).toMatchObject({ logicalText: 2, payableText: 2, steps: 2 });
    expect(env.runtime.start).not.toHaveBeenCalled();
  });
  it.each(["no_grant", "wrong_grant", "final_report", "other_count_failure", "digest", "request", "evidence", "output", "global_message", "global_asset", "global_artifact",
    "authorizationClaim", "resultFinalizationClaim", "imageCompletionClaim", "foreign_owner", "unresolved", "preparation", "stop", "accounting"])(
    "rejects reviewer %s atomically without consuming the continuation", async kind => {
      const env = await fixture(kind !== "no_grant", kind === "other_count_failure" ? "input_count_unavailable" : "input_limit_exceeded");
      const c = env.db.collections;
      if (kind === "wrong_grant") env.authority.grant.continuations![0].operationId = id(99);
      if (kind === "final_report") await c.experiment_runs.updateOne({ _id: id(10) }, { $set: { generationCompletedAtMs: 7, evaluationStatus: "running" } });
      if (kind === "digest") await c.experiment_operations.updateOne({ _id: id(12) }, { $set: { "m4Observation.evidenceDigest": "f".repeat(64) } });
      if (kind === "request") await c.experiment_operations.updateOne({ _id: id(12) }, { $set: { "m4Preparation.requestJson": "{}" } });
      if (kind === "evidence") await c.experiment_operations.updateOne({ _id: id(12) }, { $set: { "m4Observation.evidenceJson": "{}" } });
      if (kind === "output") await c.experiment_operations.updateOne({ _id: id(12) }, { $set: { resultJson: "{}" } });
      if (kind === "global_message") await c.messages.insertOne({ _id: id(90), bookletId: id(91), experimentRunId: id(92), operationId: id(12),
        sequence: 1, role: "assistant", schemaVersion: "1", uiMessageJson: "{}", createdAtMs: 9 });
      if (kind === "global_asset") await c.assets.insertOne({ _id: id(12), bookletId: id(91), kind: "image", uri: "fixture://image", mimeType: "image/png",
        width: 8, height: 8, sourceAssetId: null, metadataJson: null, createdAtMs: 9 });
      if (kind === "global_artifact") await c.artifact_versions.insertOne({ _id: id(90), artifactId: id(91), versionNumber: 1, schemaVersion: "1",
        contentJson: "{}", dependencyVersionIdsJson: "[]", createdBy: "fixture", sourceVersionId: null, sourceExecutionBatchId: null, sourceOperationId: id(12), createdAtMs: 9 });
      if (["authorizationClaim", "resultFinalizationClaim", "imageCompletionClaim"].includes(kind)) await c.experiment_operations.updateOne({ _id: id(12) },
        { $set: { [kind]: { id: id(90), digest: "d".repeat(64), expiresAtMs: 1 } } });
      if (kind === "foreign_owner") await c.deployment_control.insertOne({ _id: "environment:_staging", schemaVersion: "1", environment: "_staging", maintenance: false,
        activeMutations: 1, mutationOwners: [{ id: id(90), processId: id(91), startedAtMs: 1, state: "active", runId: id(92), operationId: id(12) }], reason: null, updatedAtMs: 9 });
      if (kind === "unresolved") await c.experiment_operations.updateOne({ _id: id(12) }, { $set: { "lifecycle.unresolved": true } });
      if (kind === "preparation") await c.experiment_runs.updateOne({ _id: id(10) }, { $set: { preparation: { ownerId: id(90), startedAtMs: 1, deadlineAtMs: 2 } } });
      if (kind === "stop") await c.experiment_operations.updateOne({ _id: id(12) }, { $set: { "lifecycle.stop": { requestedAtMs: 9, reason: "manual", delivery: "acknowledged" } } });
      if (kind === "accounting") await c.experiment_runs.updateOne({ _id: id(10) }, { $set: { "counters.payableText": 0 } });
      const before = { run: await env.repository.getRun(id(10)), operation: await env.repository.getOperation(id(12)), campaign: await env.campaign() };
      await expect(env.resume()).rejects.toThrow();
      expect({ run: await env.repository.getRun(id(10)), operation: await env.repository.getOperation(id(12)), campaign: await env.campaign() }).toEqual(before);
      expect(env.runtime.start).not.toHaveBeenCalled();
    });
});

describe("supported legacy count-failure recovery", () => {
  async function fixture() {
    const env = await setup(true, true, true);
    vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "execution", execution: { ...env.execution, status: "failed", outputs: null,
      legacyCountFailure: { code: "legacy_input_count_guard", totalTokens: 0 } } });
    await env.observer.observe(env.input);
    const retained = (await env.repository.getOperation(id(12)))!;
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: {
      "lifecycle.stop": { requestedAtMs: retained.deadlineAtMs! - 29_006, reason: "deadline", delivery: "acknowledged" },
      "lifecycle.timeoutAtMs": retained.deadlineAtMs! - 29_005,
    } });
    const run = (await env.repository.getRun(id(10)))!;
    const authority = { ...env.authority, grant: { ...env.authority.grant, preGenerationRecoveries: [{
      runId: id(10), operationId: id(12), workflowRunId: id(13), publishedWorkflowId: env.execution.workflow_id,
      pluginIdentity: LEGACY_COUNT_PLUGIN_IDENTITY, guardSourceSha256: LEGACY_COUNT_GUARD_SOURCE_SHA256,
      nodeTraceDigest: "e".repeat(64), reference: "retained-node-receipt-fixture" }] } };
    await env.db.collections.deployment_control.insertOne({ _id: "environment:_staging", schemaVersion: "1", environment: "_staging",
      maintenance: false, draining: false, activeMutations: 0, mutationOwners: [], interruptedMutations: 0, reason: null, updatedAtMs: 400000 });
    const service = createBookletRecovery({ database: env.db, config: { ...env.config, m4: { state: "granted", authority } },
      runtime: env.runtime, now: () => 400000 });
    return { ...env, authority, service, target: { runId: run._id, operationId: id(12), expectedRevision: run.revision } };
  }
  it("closes the exact legacy failure through preview/apply, reuses verification and continues without releasing exposure", async () => {
    const env = await fixture();
    const original = (await env.repository.getOperation(id(12)))!; const campaign = await env.campaign();
    const preview = await env.service.preview(env.target);
    await env.db.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    const closedPreview = await env.service.preview(env.target, true);
    expect(closedPreview.previewDigest).toBe(preview.previewDigest);
    await env.service.apply(env.target, preview.previewDigest, async () => {});
    expect(await env.service.verifyCompleted(env.target, preview.snapshot)).toMatchObject({ verified: true, outcome: "failure_closed", providerPosts: 0 });
    expect(await env.service.verifyCompleted(env.target, preview.snapshot)).toMatchObject({ verified: true, outcome: "failure_closed" });
    const closed = (await env.repository.getOperation(id(12)))!;
    expect(closed.m4Reservation).toEqual(original.m4Reservation); expect(closed.m4Observation).toEqual(original.m4Observation);
    expect(closed.deadlineAtMs).toBe(original.deadlineAtMs); expect(closed.resultJson).toBeNull(); expect(closed.materializationJson).toBeNull();
    expect(closed.lifecycle?.stop).toEqual(original.lifecycle?.stop);
    expect(closed.lifecycle?.timeoutAtMs).toBe(original.lifecycle?.timeoutAtMs);
    expect(await env.campaign()).toEqual(campaign);
    const blocked = (await env.repository.getRun(id(10)))!;
    expect(blocked).toMatchObject({ status: "blocked", safeFailure: "definite_failure", activeOperationId: null, pauseRequested: true });
    await env.db.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: false } });
    const resumed = await createExperimentRepository(env.db, { m4Authority: env.authority, m4ExecutionEnabled: true, elapsedNow: () => 0 })
      .resume({ runId: blocked._id, expectedRevision: blocked.revision, nowMs: 400010 });
    await withMongoTransaction(env.db, session => verifyM4Accounting(env.db, session, resumed));
    expect(resumed.counters).toEqual(blocked.counters); expect(env.runtime.start).not.toHaveBeenCalled();
    const dispatcher = createExperimentDispatcher({ database: env.db, config: { ...env.config, m4: { state: "granted", authority: env.authority } },
      runtime: env.runtime, now: () => 400011, mutate: async action => action() });
    await dispatcher.inspect({ runId: id(10), operationId: id(12) });
    expect(await env.repository.getRun(id(10))).toEqual(resumed);
    vi.mocked(env.runtime.retrieve).mockResolvedValueOnce({ kind: "unknown" });
    await dispatcher.inspect({ runId: id(10), operationId: id(12) });
    expect(await env.repository.getRun(id(10))).toEqual(resumed);
  });
  it("keeps snapshot queries and bytes independent of unrelated historical prepared payloads", async () => {
    const env = await fixture();
    const find = vi.spyOn(env.db.collections.experiment_operations, "find");
    const first = await env.service.preview(env.target);
    const baselineQueries = find.mock.calls.length;
    find.mockClear();
    expect(first.snapshot.scope).toBe("pre-generation-target-v1");
    const retained = (await env.repository.getOperation(id(12)))!;
    await env.db.collections.experiment_operations.insertMany(Array.from({ length: 80 }, (_, index) => ({ ...retained,
      _id: id(1000 + index), runId: id(999), idempotencyKey: `historical-${index}`, state: "failed" as const,
      lifecycle: { ...retained.lifecycle!, phase: "finished" as const, unresolved: false },
      m4Reservation: undefined, m4Preparation: { ...retained.m4Preparation!, requestJson: "private-history".repeat(20000), contextJson: "x".repeat(300000) },
    })));
    find.mockClear();
    const preview = await env.service.preview(env.target);
    const reads = find.mock.calls.map(([filter, options]) => ({ filter, projection: options?.projection }));
    expect(preview).toEqual(first);
    expect(Buffer.byteLength(JSON.stringify(preview))).toBe(Buffer.byteLength(JSON.stringify(first)));
    expect(reads.length).toBeGreaterThan(0);
    expect(reads).toHaveLength(baselineQueries);
    for (const read of reads) {
      expect(read.filter).not.toEqual({});
      // The driver implements findOne through find. Only the exact target may
      // return a full prepared request; every history query must project it away.
      if (!read.projection) {
        expect(read.filter).toEqual({ _id: id(12), runId: id(10) });
        continue;
      }
      expect(read.projection).not.toHaveProperty("m4Preparation");
      expect(read.projection).not.toHaveProperty("m4Preparation.requestJson");
    }
    find.mockClear();
    await env.service.preview(env.target);
    expect(find).toHaveBeenCalledTimes(reads.length);
    const writes = vi.spyOn(env.db.collections.experiment_operations, "updateOne");
    const runWrites = vi.spyOn(env.db.collections.experiment_runs, "updateOne");
    const campaignWrites = vi.spyOn(env.db.collections.experiment_campaigns, "updateOne");
    await env.db.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    await env.service.apply(env.target, preview.previewDigest, async () => {});
    expect(await env.service.verifyCompleted(env.target, preview.snapshot)).toMatchObject({ verified: true, outcome: "failure_closed" });
    expect(writes.mock.calls.map(([filter]) => filter)).toEqual([{ _id: id(12), state: retained.state }]);
    expect(runWrites).toHaveBeenCalledTimes(1); expect(runWrites.mock.calls[0][0]).toMatchObject({ _id: id(10), revision: env.target.expectedRevision });
    expect(campaignWrites).not.toHaveBeenCalled();
    expect(await env.db.collections.experiment_operations.countDocuments({ runId: id(999), "m4Preparation.contextJson": "x".repeat(300000) })).toBe(80);
    expect(env.runtime.start).not.toHaveBeenCalled();
  });
  it("keeps original full-inventory checkpoints verifiable and rejects unknown scopes", async () => {
    const env = await fixture();
    const preview = await env.service.preview(env.target);
    const { scope: _scope, ...old } = preview.snapshot;
    expect(_scope).toBe("pre-generation-target-v1");
    const historical = { ...old, rows: await readRecoveryInventory(env.db.collections) };
    expect(recoveryDigest(historical)).not.toBe(recoveryDigest(preview.snapshot));
    await expect(env.service.verifyCompleted(env.target, { ...preview.snapshot, scope: "unknown" as never }))
      .rejects.toThrow("snapshot_scope_unsupported");
    await env.db.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    await env.service.apply(env.target, preview.previewDigest, async () => {});
    expect(await env.service.verifyCompleted(env.target, historical)).toMatchObject({ verified: true, outcome: "failure_closed" });
    expect(await env.service.verifyCompleted(env.target, preview.snapshot)).toMatchObject({ verified: true, outcome: "failure_closed" });
  });
  it.each(["reservation", "campaign", "ownership"])("rejects %s drift after checkpoint without closing the target", async kind => {
    const env = await fixture(); const before = await env.repository.getOperation(id(12));
    await env.db.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    const preview = await env.service.preview(env.target, true);
    await expect(env.service.apply(env.target, preview.previewDigest, async () => {
      if (kind === "reservation") await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $inc: { "m4Reservation.unsettledMicrodollars": 1 } });
      if (kind === "campaign") await env.db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $inc: { revision: 1 } });
      if (kind === "ownership") await env.db.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { activeMutations: 1 } });
    })).rejects.toThrow(kind === "ownership" ? "other_work" : "state_changed");
    const after = (await env.repository.getOperation(id(12)))!;
    expect(after.state).toBe(before!.state); expect(after.m4PreGenerationRecovery).toBeUndefined();
    expect(env.runtime.start).not.toHaveBeenCalled();
  });
  it.each(["source", "approval"])("rejects a changed %s after preview/checkpoint before writing recovery", async kind => {
    const env = await fixture(); const before = await env.repository.getOperation(id(12));
    if (kind === "approval") {
      await env.db.collections.artifacts.insertOne({ _id: id(201), bookletId: id(11), experimentRunId: id(10),
        artifactType: "style", state: "approved", currentVersionId: id(202), createdAtMs: 1, updatedAtMs: 1 });
      await env.db.collections.artifact_versions.insertOne({ _id: id(202), artifactId: id(201), versionNumber: 1, schemaVersion: "1",
        contentJson: "{}", dependencyVersionIdsJson: "[]", createdBy: "fixture", sourceVersionId: null, sourceExecutionBatchId: null, createdAtMs: 1 });
      await env.db.collections.approvals.insertOne({ _id: id(203), bookletId: id(11), experimentRunId: id(10), artifactVersionId: id(202),
        scope: "artifact", subjectKey: null, action: "approve", origin: "explicit", sourceApprovalId: null, cardResponseId: null, qualityReviewId: null, createdAtMs: 1 });
    }
    await env.db.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    const preview = await env.service.preview(env.target, true);
    await expect(env.service.apply(env.target, preview.previewDigest, async () => {
      if (kind === "source") await env.db.collections.booklets.updateOne({ _id: id(11) }, { $set: { workingTitle: "changed after checkpoint" } });
      else await env.db.collections.approvals.updateOne({ _id: id(203) }, { $set: { action: "reject" } });
    })).rejects.toThrow("source_state_changed");
    expect(await env.repository.getOperation(id(12))).toEqual(before); expect(env.runtime.start).not.toHaveBeenCalled();
  });
  it("preserves an interrupted pre-write attempt and rejects a grant changed after checkpoint", async () => {
    const env = await fixture(); const before = await env.repository.getOperation(id(12));
    await env.db.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    const preview = await env.service.preview(env.target, true);
    await expect(env.service.apply(env.target, preview.previewDigest, async () => { throw new Error("fixture checkpoint interrupted"); }))
      .rejects.toThrow("fixture checkpoint interrupted");
    expect(await env.service.verifyUnapplied(env.target, preview.previewDigest)).toMatchObject({ verified: true, outcome: "unapplied" });
    await expect(env.service.apply(env.target, preview.previewDigest, async () => {
      env.authority.grant.preGenerationRecoveries[0].nodeTraceDigest = "f".repeat(64);
    })).rejects.toThrow("grant_changed");
    expect(await env.repository.getOperation(id(12))).toEqual(before); expect(env.runtime.start).not.toHaveBeenCalled();
  });
});

describe("verified pre-generation failure bookkeeping", () => {
  it.each(["count", "generation_started", "digest", "adapter"])("keeps %s failure evidence uncertain without releasing exposure", async kind => {
    const env = await setup(true); const original = (await env.repository.getOperation(id(12)))!;
    const evidence = { provider: "openai", apiBaseUrl: "https://api.openai.com/v1", adapterVersion: "1.0.7-dev3",
      stdioSdk: env.wrapper.providerEvidence.stdioSdk, model: "gpt-6-luna", serviceTier: "default",
      requestDigest: original.m4Preparation!.requestDigest, stage: "input_count", code: "input_limit_exceeded",
      countedInputTokens: 32001, limit: 32000, generationStarted: false, elapsedMs: 5, countRequestId: null };
    if (kind === "count") evidence.countedInputTokens = 20;
    if (kind === "generation_started") evidence.generationStarted = true;
    if (kind === "digest") evidence.requestDigest = "f".repeat(64);
    if (kind === "adapter") evidence.adapterVersion = "unreviewed";
    vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "execution", execution: { ...env.execution,
      outputs: { booklet_provider_result: JSON.stringify({ schemaVersion: "booklet_pre_generation_failure_v1", content: "", failureEvidence: evidence }) } } });
    expect(await env.observer.observe(env.input)).toEqual({ kind: "blocked" });
    expect(await env.repository.getRun(id(10))).toMatchObject({ safeFailure: "unknown_outcome", activeOperationId: id(12) });
    const op = (await env.repository.getOperation(id(12)))!;
    expect(op.m4Reservation).toEqual(original.m4Reservation); expect(op.state).toBe("started"); expect(env.runtime.start).not.toHaveBeenCalled();
  });
  it.each([
    ["input_limit_exceeded", "1.0.7-dev3"], ["input_count_unavailable", "1.0.7-dev3"],
    ["input_count_invalid", "1.0.7-dev3"], ["input_count_request_failed", "1.0.7-dev3"],
    ["input_limit_exceeded", "1.0.7-dev4"],
  ] as const)(
    "closes %s with %s once, retaining full exposure and explicit continuation", async (code, adapterVersion) => {
      const env = await setup(true, true, false, adapterVersion);
      const originalCampaign = await env.campaign();
      const original = (await env.repository.getOperation(id(12)))!;
      const failure = { schemaVersion: "booklet_pre_generation_failure_v1", content: "", failureEvidence: {
        provider: "openai", apiBaseUrl: "https://api.openai.com/v1", adapterVersion, stdioSdk: env.wrapper.providerEvidence.stdioSdk,
        model: "gpt-6-luna", serviceTier: "default", requestDigest: original.m4Preparation!.requestDigest,
        stage: "input_count", code, countedInputTokens: code === "input_limit_exceeded" ? 32001 : null,
        limit: 32000, generationStarted: false, elapsedMs: 5, countRequestId: null } };
      vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "execution", execution: { ...env.execution,
        outputs: { booklet_provider_result: JSON.stringify(failure) } } });
      expect(await env.observer.observe(env.input)).toEqual({ kind: "blocked" });
      const failed = (await env.repository.getOperation(id(12)))!;
      expect(failed).toMatchObject({ state: "failed", safeFailure: "definite_failure", lifecycle: { phase: "finished", unresolved: false } });
      expect(failed.m4Reservation).toEqual(original.m4Reservation);
      const view = await createExperimentContextService(env.db).getRunView(id(10));
      expect(view?.operationHistory.find(op => op.id === id(12))?.countFailure).toEqual({ code,
        countedInputTokens: code === "input_limit_exceeded" ? 32001 : null, limit: 32000, generationStarted: false });
      expect((await env.campaign())!.reservedMicrodollars).toBe(originalCampaign!.reservedMicrodollars);
      expect((await env.repository.getRun(id(10)))!.activeOperationId).toBeNull();
      expect(await closeM4KnownFailure(env.db, env.authority, env.input)).toBe("closed");
      const run = (await env.repository.getRun(id(10)))!;
      const resumed = await createExperimentRepository(env.db, { m4Authority: env.authority, m4ExecutionEnabled: true, elapsedNow: () => 0 })
        .resume({ runId: run._id, expectedRevision: run.revision, nowMs: 10 });
      await withMongoTransaction(env.db, session => verifyM4Accounting(env.db, session, resumed));
      const dispatcher = createExperimentDispatcher({ database: env.db,
        config: { ...env.config, m4: { state: "granted", authority: env.authority } }, runtime: env.runtime, now: () => 11, mutate: async action => action() });
      await dispatcher.inspect({ runId: id(10), operationId: id(12) });
      expect(await env.repository.getRun(id(10))).toEqual(resumed);
      expect(env.runtime.start).not.toHaveBeenCalled();
    });
});

describe("explicit unclaimed manager failure continuation", () => {
  async function failedFixture(granted = true) {
    const env = await setup(granted, false);
    vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "execution", execution: {
      ...env.execution, status: "failed", outputs: null } });
    const dispatcher = createExperimentDispatcher({ database: env.db,
      config: { ...env.config, m4: { state: "granted", authority: env.authority } },
      runtime: env.runtime, now: () => 8, mutate: async action => action() });
    await dispatcher.inspect({ runId: id(10), operationId: id(12) });
    const resume = async () => createExperimentRepository(env.db, { m4Authority: env.authority, m4ExecutionEnabled: true,
      elapsedNow: () => 0 }).resume({ runId: id(10), expectedRevision: (await env.repository.getRun(id(10)))!.revision, nowMs: 10 });
    const verify = () => withMongoTransaction(env.db, async session => verifyM4Accounting(env.db, session,
      (await env.db.collections.experiment_runs.findOne({ _id: id(10) }, { session }))!));
    return { ...env, dispatcher, resume, verify };
  }

  it("continues once with zero new charges, closes owned lifecycle and preserves terminal history on late Inspect", async () => {
    const env = await failedFixture();
    const before = (await env.repository.getOperation(id(12)))!;
    const run = (await env.repository.getRun(id(10)))!;
    const campaign = (await env.campaign())!;
    expect(before).toMatchObject({ state: "failed", remoteStatus: "failed", safeFailure: "definite_failure",
      reservationCount: 0, lifecycle: { phase: "dispatching" } });
    const digest = m4UnclaimedFailureDigest(env.authority, run, before);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    const outcomes = await Promise.allSettled([env.resume(), env.resume()]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    const resumed = (await env.repository.getRun(id(10)))!;
    const saved = (await env.repository.getOperation(id(12)))!;
    expect(resumed).toMatchObject({ status: "queued", activeOperationId: null, counters: run.counters });
    expect(saved).toMatchObject({ ...before, lifecycle: { ...before.lifecycle, phase: "finished", attemptOutcome: "failed",
      unresolved: false, endedAtMs: 10 }, m4Continuation: { evidenceDigest: digest, requestDigest: before.m4Preparation!.requestDigest,
      reference: "explicit-inspected-fixture-continuation", resumedAtMs: 10, runRevision: run.revision,
      campaignRevision: campaign.revision, nextOperationId: null } });
    expect(await env.campaign()).toMatchObject({ state: "active", requests: 0, settledMicrodollars: 0, reservedMicrodollars: 0 });
    expect(m4UnclaimedFailureDigest(env.authority, resumed, saved)).toBe(digest);
    expect(m4UnclaimedFailureDigest(env.authority, { ...resumed, generationCompletedAtMs: 20 }, saved)).toBe(digest);
    await env.verify();
    expect(await env.resume()).toEqual(resumed);
    await env.dispatcher.inspect({ runId: id(10), operationId: id(12) });
    vi.mocked(env.runtime.retrieve).mockResolvedValueOnce({ kind: "unknown" });
    await env.dispatcher.inspect({ runId: id(10), operationId: id(12) });
    expect(await env.repository.getRun(id(10))).toEqual(resumed);
    const next = await env.repository.prepareOperation({ runId: id(10), operationId: id(60), expectedRevision: resumed.revision,
      role: "manager", taskId: null, subjectKind: "book", subjectId: id(11), inputFingerprint: "c".repeat(64),
      attempt: 1, providerKind: "text", nowMs: 11 });
    expect(next.m4ContinuedFromOperationId).toBe(id(12));
    expect((await env.repository.getOperation(id(12)))!.m4Continuation!.nextOperationId).toBe(id(60));
    expect(env.runtime.start).not.toHaveBeenCalled();
  });

  it.each(["no_grant", "claimed", "uncertain", "output", "expired_ownership", "publication", "stop", "artifact"] as const)(
    "rejects %s without consuming authority or changing accounting", async kind => {
      const env = await failedFixture(kind !== "no_grant");
      if (kind === "claimed") await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { reservationCount: 1 } });
      if (kind === "uncertain") await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { remoteStatus: "running" } });
      if (kind === "output") await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { resultJson: "{}" } });
      if (kind === "expired_ownership") await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { authorizationClaim: { id: id(90), expiresAtMs: 1 } } });
      if (kind === "publication") await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { verifiedWorkflowId: id(99) } });
      if (kind === "stop") await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { "lifecycle.stop": { requestedAtMs: 7, reason: "manual", delivery: "acknowledged" } } });
      if (kind === "artifact") await env.db.collections.artifact_versions.insertOne({ _id: id(90), artifactId: id(91), versionNumber: 1,
        schemaVersion: "2", contentJson: "{}", dependencyVersionIdsJson: "[]", createdBy: "fixture", sourceVersionId: null,
        sourceExecutionBatchId: null, sourceOperationId: id(12), createdAtMs: 7 });
      const before = { run: await env.repository.getRun(id(10)), op: await env.repository.getOperation(id(12)), campaign: await env.campaign() };
      await expect(env.resume()).rejects.toThrow();
      expect({ run: await env.repository.getRun(id(10)), op: await env.repository.getOperation(id(12)), campaign: await env.campaign() }).toEqual(before);
      expect(env.runtime.start).not.toHaveBeenCalled();
    });

  it("blocks a conflicting historical terminal observation without provider work", async () => {
    const env = await failedFixture(); await env.resume();
    vi.mocked(env.runtime.retrieve).mockResolvedValueOnce({ kind: "execution", execution: { ...env.execution, status: "succeeded" } });
    await env.dispatcher.inspect({ runId: id(10), operationId: id(12) });
    expect(await env.repository.getRun(id(10))).toMatchObject({ status: "blocked", safeFailure: "definite_failure" });
    expect(await env.campaign()).toMatchObject({ requests: 0, settledMicrodollars: 0, reservedMicrodollars: 0 });
    expect(env.runtime.start).not.toHaveBeenCalled();
  });
});

describe("M4 original authenticated provider observation", () => {
  it("does not classify a failed saved-operation read as malformed creative output", async () => {
    const env = await setup();
    const failure = Object.assign(new Error("private read failure"), { name: "MongoOperationTimeoutError" });
    const original = env.db.collections.experiment_operations.findOne.bind(env.db.collections.experiment_operations);
    const read = vi.spyOn(env.db.collections.experiment_operations, "findOne").mockImplementation(async (filter, options) => {
      if (!options?.session) throw failure;
      return original(filter, options);
    });
    await expect(env.observer.observe(env.input)).rejects.toBe(failure);
    read.mockRestore();
    expect(await env.repository.getOperation(id(12))).toMatchObject({ state: "started", resultJson: null,
      m4Observation: { content: env.wrapper.content, issue: null } });
    expect(await env.campaign()).toMatchObject({ state: "active", requests: 1, reservedMicrodollars: 900, settledMicrodollars: 63 });
    expect(env.runtime.start).not.toHaveBeenCalled();
  });
  it("retrieves the exact saved app/key, persists before parsing, settles once under concurrent duplicates, and never materializes", async () => {
    const env = await setup();
    const results = await Promise.all([env.observer.observe(env.input), env.observer.observe(env.input)]);
    expect(results.every((result) => result.kind === "result")).toBe(true);
    expect(results.filter((result) => result.kind === "result" && !result.reused)).toHaveLength(1);
    expect(env.runtime.retrieve).toHaveBeenCalledWith(env.config.bindings[0], id(13));
    expect(env.runtime.start).not.toHaveBeenCalled();
    expect(await env.repository.getOperation(id(12))).toMatchObject({ state: "started", reservationCount: 1, resultJson: null,
      m4Observation: { content: env.wrapper.content, issue: null }, m4Reservation: { settledMicrodollars: 63, unsettledMicrodollars: 900 } });
    expect(await env.campaign()).toMatchObject({ state: "active", requests: 1, reservedMicrodollars: 900, settledMicrodollars: 63 });
    expect((await env.repository.getRun(id(10)))!.activeOperationId).toBe(id(12));
  });
  it("settles known usage before malformed, refused or incomplete creative output blocks the campaign", async () => {
    for (const kind of ["malformed", "refused", "incomplete", "failed"] as const) {
      const env = await setup();
      if (kind === "malformed") env.wrapper.content = '{"result":';
      if (kind === "refused") env.wrapper.providerEvidence.refused = true;
      if (kind === "incomplete") Object.assign(env.wrapper.providerEvidence, { status: "incomplete", incompleteReason: "max_output_tokens" });
      if (kind === "failed") vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "execution", execution: {
        ...env.execution, status: "failed", outputs: { booklet_provider_result: JSON.stringify(env.wrapper) } } });
      expect(await env.observer.observe(env.input)).toEqual({ kind: "blocked" });
      expect(await env.campaign()).toMatchObject({ state: "stopped", reservedMicrodollars: 900, settledMicrodollars: 63 });
      const op = (await env.repository.getOperation(id(12)))!;
      expect(op).toMatchObject({ state: "failed", safeFailure: "definite_failure", lifecycle: { phase: "finished", unresolved: false, attemptOutcome: "failed" },
        m4Observation: { content: env.wrapper.content, issue: kind === "malformed" ? "creative_invalid" : "provider_failure" } });
      expect(await env.repository.getRun(id(10))).toMatchObject({ status: "blocked", safeFailure: "definite_failure", activeOperationId: null });
      const before = { op, run: await env.repository.getRun(id(10)), campaign: await env.campaign() };
      expect(await closeM4KnownFailure(env.db, env.authority, { ...env.input, nowMs: 9 })).toBe("closed");
      expect({ op: await env.repository.getOperation(id(12)), run: await env.repository.getRun(id(10)), campaign: await env.campaign() }).toEqual(before);
    }
  });
  it("retains the full maximum for missing wrapper, unavailable usage and invalid usage", async () => {
    for (const kind of ["missing", "unavailable", "invalid"] as const) {
      const env = await setup();
      if (kind === "missing") vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "execution", execution: { ...env.execution, outputs: {} } });
      if (kind === "unavailable") Object.assign(env.wrapper.providerEvidence.usage, { source: "unavailable", inputTokens: null });
      if (kind === "invalid") env.wrapper.providerEvidence.usage.inputTokens = -1;
      expect(await env.observer.observe(env.input)).toEqual({ kind: "blocked" });
      expect(await env.campaign()).toMatchObject({ state: "stopped", reservedMicrodollars: 5924, settledMicrodollars: 0 });
      const op = (await env.repository.getOperation(id(12)))!;
      expect(op.m4Observation).toBeDefined();
      if (kind !== "missing") expect(op.m4Observation!.content).toBe(env.wrapper.content);
      expect(await closeM4KnownFailure(env.db, env.authority, env.input)).toBe("deferred");
      expect((await env.repository.getRun(id(10)))!.activeOperationId).toBe(id(12));
    }
  });
  it("preserves original evidence and settlement when any full-wrapper byte changes", async () => {
    const env = await setup(); await env.observer.observe(env.input);
    const original = (await env.repository.getOperation(id(12)))!.m4Observation;
    env.wrapper.content += " ";
    expect(await env.observer.observe(env.input)).toEqual({ kind: "blocked" });
    expect((await env.repository.getOperation(id(12)))!.m4Observation).toEqual({ ...original, issue: "conflicting_evidence" });
    expect(await closeM4KnownFailure(env.db, env.authority, env.input)).toBe("deferred");
    expect(await env.campaign()).toMatchObject({ state: "stopped", reservedMicrodollars: 900, settledMicrodollars: 63 });
  });
  it("rejects configuration drift before GET and remote publication, run or digest drift before settlement", async () => {
    for (const kind of ["config", "publication", "workflow", "digest"] as const) {
      const env = await setup();
      if (kind === "config") {
        const config = structuredClone(env.config); config.bindings[0].publishedWorkflowId = id(99);
        await expect(createM4ProviderResults(env.db, env.authority, config, env.runtime).observe(env.input)).rejects.toMatchObject({ code: "conflict" });
        expect(env.runtime.retrieve).not.toHaveBeenCalled();
      } else {
        if (kind === "digest") env.wrapper.providerEvidence.requestDigest = "c".repeat(64);
        else vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "execution", execution: { ...env.execution,
          ...(kind === "publication" ? { workflow_id: id(99) } : { id: id(99) }) } });
        expect(await env.observer.observe(env.input)).toEqual({ kind: "blocked" });
        expect(await env.campaign()).toMatchObject({ state: "stopped" });
      }
      expect(await env.campaign()).toMatchObject({ reservedMicrodollars: 5924, settledMicrodollars: 0 });
      expect(await closeM4KnownFailure(env.db, env.authority, env.input)).toBe("deferred");
    }
  });
  it("rechecks policy and ownership after remote I/O, retaining every reservation", async () => {
    for (const field of ["m4.policyHash", "activeOperationId"] as const) {
      const env = await setup();
      vi.mocked(env.runtime.retrieve).mockImplementation(async () => {
        await env.db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { [field]: field === "activeOperationId" ? null : "c".repeat(64) } });
        return { kind: "execution", execution: env.execution };
      });
      await expect(env.observer.observe(env.input)).rejects.toMatchObject({ code: "conflict" });
      expect((await env.repository.getOperation(id(12)))!.m4Observation).toBeUndefined();
      expect(await env.campaign()).toMatchObject({ reservedMicrodollars: 5924, settledMicrodollars: 0 });
    }
  });
  it("retains uncertainty without replay and returns Pause/Stop state with a valid in-flight result", async () => {
    const env = await setup();
    vi.mocked(env.runtime.retrieve).mockResolvedValueOnce({ kind: "unknown" })
      .mockResolvedValueOnce({ kind: "execution", execution: { ...env.execution, status: "running" } });
    expect(await env.observer.observe(env.input)).toEqual({ kind: "pending" });
    expect(await env.observer.observe(env.input)).toEqual({ kind: "pending" });
    expect(await env.campaign()).toMatchObject({ state: "active", reservedMicrodollars: 5924, settledMicrodollars: 0 });
    await env.db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { pauseRequested: true, status: "paused" } });
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { "lifecycle.stop": { requestedAtMs: 7, reason: "manual", delivery: "pending" } } });
    expect(await env.observer.observe(env.input)).toMatchObject({ kind: "result", pauseRequested: true, stopRequested: true });
    expect(env.runtime.start).not.toHaveBeenCalled();
  });
  it("defers each active save claim, then closes known failure without changing reservations or retained lifecycle history", async () => {
    for (const field of ["authorizationClaim", "resultFinalizationClaim", "imageCompletionClaim"] as const) {
      const env = await setup(); env.wrapper.providerEvidence.refused = true;
      await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: {
        [field]: { id: id(90), digest: "d".repeat(64), expiresAtMs: 10 },
        "lifecycle.timeoutAtMs": 6, "lifecycle.endedAtMs": 7,
        "lifecycle.stop": { requestedAtMs: 6, reason: "manual", delivery: "acknowledged" },
      } });
      expect(await env.observer.observe(env.input)).toEqual({ kind: "blocked" });
      expect((await env.repository.getOperation(id(12)))!.state).toBe("started");
      expect(await closeM4KnownFailure(env.db, env.authority, env.input)).toBe("deferred");
      const before = (await env.repository.getOperation(id(12)))!;
      const counters = (await env.repository.getRun(id(10)))!.counters;
      expect(await closeM4KnownFailure(env.db, env.authority, { ...env.input, nowMs: 10 })).toBe("closed");
      const after = (await env.repository.getOperation(id(12)))!;
      expect(after.m4Reservation).toEqual(before.m4Reservation);
      expect(after.deadlineAtMs).toBe(before.deadlineAtMs);
      expect(after.lifecycle).toMatchObject({ timeoutAtMs: 6, endedAtMs: 7, stop: before.lifecycle!.stop, unresolved: false });
      expect(after[field]).toEqual(before[field]);
      expect((await env.repository.getRun(id(10)))!.counters).toEqual(counters);
    }
  });
  it("does not close conflicting evidence, saved materialization, or a corrupted evidence hash", async () => {
    for (const kind of ["conflict", "materialization", "evidence", "content_valid"] as const) {
      const env = await setup(); env.wrapper.providerEvidence.refused = kind !== "content_valid";
      if (kind === "content_valid") env.wrapper.content = '{"result":';
      await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { resultFinalizationClaim: { id: id(91), expiresAtMs: 10 } } });
      await env.observer.observe(env.input);
      if (kind === "conflict") {
        env.wrapper.content += " "; await env.observer.observe(env.input);
      } else if (kind === "materialization") {
        await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { materializationJson: "{}" } });
      } else if (kind === "evidence") {
        await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { "m4Observation.evidenceDigest": "e".repeat(64) } });
      } else {
        await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { "m4Observation.content": JSON.stringify({ result: {
          kind: "delegate", payload: { taskId: "J01", subjectKind: "book", subjectId: id(11) } } }) } });
      }
      expect(await closeM4KnownFailure(env.db, env.authority, { ...env.input, nowMs: 10 })).toBe("deferred");
      expect((await env.repository.getRun(id(10)))!.activeOperationId).toBe(id(12));
      expect((await env.repository.getOperation(id(12)))!.state).toBe("started");
    }
  });
});


describe("explicit same-campaign manager continuation", () => {
  async function failedFixture(granted = true) {
    const env = await setup(granted);
    env.wrapper.providerEvidence.status = "incomplete";
    env.wrapper.providerEvidence.incompleteReason = "max_output_tokens";
    env.wrapper.content += " trailing invalid output";
    expect(await env.observer.observe(env.input)).toEqual({ kind: "blocked" });
    const verify = () => withMongoTransaction(env.db, async (session) => verifyM4Accounting(env.db, session,
      (await env.db.collections.experiment_runs.findOne({ _id: id(10) }, { session }))!));
    const resume = async () => env.repository.resume({ runId: id(10), expectedRevision: (await env.repository.getRun(id(10)))!.revision, nowMs: 10 });
    return { ...env, verify, resume };
  }

  it("consumes one exact grant, preserves failure and charges, links a new operation and accepts inclusive accounting", async () => {
    const env = await failedFixture();
    const old = (await env.repository.getOperation(id(12)))!;
    const oldWrapperText = JSON.stringify(env.wrapper);
    const campaign = (await env.campaign())!;
    const blocked = (await env.repository.getRun(id(10)))!;
    const outcomes = await Promise.allSettled([env.resume(), env.resume()]);
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const resumed = (await env.repository.getRun(id(10)))!;
    expect(resumed).toMatchObject({ status: "queued", activeOperationId: null, safeFailure: null, counters: blocked.counters });
    expect(await env.repository.getOperation(id(12))).toEqual({ ...old, m4Continuation: {
      reference: "explicit-inspected-fixture-continuation", evidenceDigest: old.m4Observation!.evidenceDigest,
      requestDigest: old.m4Reservation!.requestDigest, resumedAtMs: 10, runRevision: blocked.revision,
      campaignRevision: campaign.revision, nextOperationId: null,
    } });
    expect(await env.campaign()).toMatchObject({ state: "active", requests: 1, settledMicrodollars: 63, reservedMicrodollars: 900 });
    expect(await env.resume()).toEqual(resumed);
    await env.verify();
    // An older unclaimed Pause record has no continuation field. MongoDB null
    // matching must not select it instead of the exact continued failure.
    const pausedHistory = { ...old, _id: id(55), idempotencyKey: "a".repeat(64), reservationCount: 0,
      safeFailure: null, remoteStatus: "succeeded" as const, createdAtMs: 0 };
    delete pausedHistory.m4Reservation; delete pausedHistory.m4Observation;
    await env.db.collections.experiment_operations.insertOne(pausedHistory);
    const next = await env.repository.prepareOperation({ runId: id(10), operationId: id(60), expectedRevision: resumed.revision,
      role: "manager", taskId: null, subjectKind: "book", subjectId: id(11), inputFingerprint: "c".repeat(64), attempt: 1, providerKind: "text", nowMs: 11 });
    expect(next.m4ContinuedFromOperationId).toBe(id(12));
    expect((await env.repository.getOperation(id(12)))!.m4Continuation!.nextOperationId).toBe(id(60));
    const prepared = await createM4TextPreparation(env.db, env.authority, { elapsedNow: () => 0 }).prepare({ runId: id(10), operationId: id(60), nowMs: 12 });
    const claim = { runId: id(10), operationId: id(60), workflowRunId: id(61), parentWorkflowRunId: null, nowMs: 13 };
    await env.repository.beginDispatch({ runId: id(10), operationId: id(60), parentWorkflowRunId: null, nowMs: 13 });
    await env.repository.recordDispatchIdentity(claim);
    await env.repository.verifyDispatchPublication({ ...claim, workflowId: env.execution.workflow_id });
    await env.repository.claimOperation(claim);
    expect((await env.campaign())!.requests).toBe(2);
    const beforeInspect = await env.repository.getRun(id(10));
    const dispatcher = createExperimentDispatcher({ database: env.db, config: { ...env.config, m4: { state: "granted", authority: env.authority } },
      runtime: env.runtime, now: () => 14, mutate: async (action) => action() });
    await expect(dispatcher.inspect({ runId: id(10), operationId: id(12) })).rejects.toThrow("A different operation owns the run");
    expect(await env.repository.getRun(id(10))).toEqual(beforeInspect);
    env.wrapper.providerEvidence.status = "completed"; env.wrapper.providerEvidence.incompleteReason = null;
    env.wrapper.providerEvidence.requestDigest = prepared.requestDigest;
    const result = { kind: "delegate" as const, payload: { taskId: "J01" as const, subjectKind: "book" as const, subjectId: id(11) } };
    env.wrapper.content = JSON.stringify({ result });
    vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "execution", execution: { ...env.execution, id: id(61),
      outputs: { booklet_provider_result: JSON.stringify(env.wrapper) } } });
    expect(await env.observer.observe({ runId: id(10), operationId: id(60), nowMs: 15 })).toMatchObject({ kind: "result" });
    await env.repository.completeOperation({ envelope: { runId: id(10), operationId: id(60), workflowRunId: id(61), inputFingerprint: "c".repeat(64), result }, parentWorkflowRunId: null, nowMs: 16 });
    await env.verify();
    expect(await env.campaign()).toMatchObject({ requests: 2, settledMicrodollars: 126, reservedMicrodollars: 1800 });
    expect((await env.repository.getRun(id(10)))!.counters).toMatchObject({ logicalText: 2, payableText: 2, steps: 2 });
    const afterCompletion = await env.repository.getRun(id(10));
    vi.mocked(env.runtime.retrieve).mockResolvedValueOnce({ kind: "execution", execution: { ...env.execution,
      outputs: { booklet_provider_result: oldWrapperText } } });
    await dispatcher.inspect({ runId: id(10), operationId: id(12) });
    vi.mocked(env.runtime.retrieve).mockResolvedValueOnce({ kind: "unknown" });
    await dispatcher.inspect({ runId: id(10), operationId: id(12) });
    expect(await env.repository.getRun(id(10))).toEqual(afterCompletion);
    expect(env.runtime.start).not.toHaveBeenCalled();
  });

  it("rejects changed historical execution identity after continuation without another provider action", async () => {
    const env = await failedFixture(); await env.resume();
    vi.mocked(env.runtime.retrieve).mockResolvedValueOnce({ kind: "execution", execution: { ...env.execution, id: id(99) } });
    const dispatcher = createExperimentDispatcher({ database: env.db, config: { ...env.config, m4: { state: "granted", authority: env.authority } },
      runtime: env.runtime, now: () => 14, mutate: async (action) => action() });
    await dispatcher.inspect({ runId: id(10), operationId: id(12) });
    expect(await env.repository.getRun(id(10))).toMatchObject({ status: "blocked", safeFailure: "definite_failure" });
    expect((await env.campaign())!.requests).toBe(1);
    expect(env.runtime.start).not.toHaveBeenCalled();
  });

  it.each(["no_grant", "mismatched_operation", "claim", "uncertain", "stop", "preparation", "unsettled", "digest", "output", "money", "requests", "counters", "other_work"])("rejects %s without consuming authority or changing records", async (kind) => {
    const env = await failedFixture(kind !== "no_grant");
    if (kind === "mismatched_operation") env.authority.grant.continuations![0].operationId = id(99);
    if (kind === "claim") await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { resultFinalizationClaim: { id: id(90), expiresAtMs: 20 } } });
    if (kind === "uncertain") await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { state: "unknown", "lifecycle.unresolved": true } });
    if (kind === "stop") await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { "lifecycle.stop": { requestedAtMs: 9, reason: "manual", delivery: "acknowledged" } } });
    if (kind === "preparation") await env.db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { preparation: { ownerId: id(90), startedAtMs: 9, deadlineAtMs: 20 } } });
    if (kind === "unsettled") await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { "m4Reservation.unsettledMicrodollars": 0 } });
    if (kind === "digest") await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { "m4Observation.evidenceDigest": "a".repeat(64) } });
    if (kind === "output") await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { resultJson: "{}" } });
    if (kind === "money") await env.db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { reservedMicrodollars: 5_000_000 } });
    if (kind === "requests") await env.db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { "requestCounts.playful_kid": 120 } });
    if (kind === "counters") await env.db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { "counters.payableText": 0 } });
    if (kind === "other_work") { const op = (await env.repository.getOperation(id(12)))!;
      await env.db.collections.experiment_operations.insertOne({ ...op, _id: id(90), idempotencyKey: "d".repeat(64), state: "unknown" }); }
    const before = { run: await env.repository.getRun(id(10)), operations: await env.repository.listOperations(id(10)), campaign: await env.campaign() };
    // Reconstruct to consume the current immutable protected grant, including the mismatch fixture.
    const repository = createExperimentRepository(env.db, { m4Authority: env.authority, m4ExecutionEnabled: true, elapsedNow: () => 0 });
    await expect(repository.resume({ runId: id(10), expectedRevision: before.run!.revision, nowMs: 10 })).rejects.toThrow();
    expect({ run: await env.repository.getRun(id(10)), operations: await env.repository.listOperations(id(10)), campaign: await env.campaign() }).toEqual(before);
    expect(env.runtime.start).not.toHaveBeenCalled();
  });
});
