import { afterEach, describe, expect, it, vi } from "vitest";
import { withMongoTransaction, type Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createM4TextPreparation } from "@/db/experiment-text-preparation";
import { createM4ProviderResults } from "@/db/experiment-provider-results";
import { verifyM4Accounting } from "@/db/experiment-m4-accounting";
import { specialistTaskSchema, type RoleResult } from "@/lib/contracts/experiment-runner";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { m4RequestBundleHash } from "@/lib/experiment-runner/m4-request";
import { m4PolicySchema, m4PolicySnapshot, m4TokenPolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import type { RuntimeResult, WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

async function setup(amended = true) {
  const db = await createTestDatabase({ seedAgents: false }); databases.push(db);
  const policy = m4PolicySchema.parse({ ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash(),
    countChargeStatus: "assumed", countChargeCeilingMicrodollars: 900 });
  const baseHash = m4PolicySnapshot(policy).hash;
  const adapterUpdate = { fromIdentity: policy.pluginIdentity, version: "1.0.7-dev5" as const,
    packageSha256: "b".repeat(64), identity: `langgenius/openai:1.0.7-dev5@${"e".repeat(64)}`,
    reference: "fake-reviewed-dev5" };
  const tokenPolicy = m4TokenPolicySnapshot({ version: "m4_context_policy_v2", basePolicyHash: baseHash,
    warningInputTokens: 32000, maxInputTokens: 128000,
    requiredProviderAdapterIdentity: adapterUpdate.identity, requiredProviderPackageSha256: adapterUpdate.packageSha256,
    reference: "fake-forward-only-amendment" });
  const grant = { campaignId: id(1), reference: "fake-provider-only",
    ...(amended ? { providerAdapterUpdate: adapterUpdate, tokenPolicy } : {}) };
  const authority = { policy, grant };
  const repository = createExperimentRepository(db, { m4Authority: authority, m4ExecutionEnabled: true, elapsedNow: () => 0 });
  const preparation = createM4TextPreparation(db, authority, { elapsedNow: () => 0 });
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid", callbackKey: "fixture",
    bindings: policy.publications.map(item => ({ ...item, taskId: specialistTaskSchema.nullable().parse(item.taskId), apiKey: "fake-test-key" })) };
  await repository.createRun({ runId: id(10), bookletId: id(11), persona: "playful_kid", mode: "balanced", campaignId: id(1), nowMs: 1,
    configuration: policy.publications.filter(item => item.persona === null || item.persona === "playful_kid")
      .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({
        role, taskId, appId, publishedWorkflowId, toolProviderId, ...(finalPageIllustration ? { finalPageIllustration } : {}),
      })) });
  await repository.prepareOperation({ runId: id(10), operationId: id(12), expectedRevision: 0, role: "manager", taskId: null,
    subjectKind: "book", subjectId: id(11), inputFingerprint: "c".repeat(64), attempt: 1, providerKind: "text", nowMs: 2 });
  const prepared = await preparation.prepare({ runId: id(10), operationId: id(12), nowMs: 3 });
  const claim = { runId: id(10), operationId: id(12), workflowRunId: id(13), parentWorkflowRunId: null, nowMs: 6 };
  async function dispatch() {
    await repository.beginDispatch({ runId: id(10), operationId: id(12), parentWorkflowRunId: null, nowMs: 4 });
    await repository.recordDispatchIdentity({ ...claim, nowMs: 5 });
    await repository.verifyDispatchPublication({ ...claim, workflowId: policy.publications[0].publishedWorkflowId, nowMs: 5 });
  }
  const campaign = () => db.collections.experiment_campaigns.findOne({ _id: id(1) });
  return { db, policy, baseHash, tokenPolicy, adapterUpdate, authority, repository, preparation, prepared, claim, dispatch, campaign, config };
}

function fakeReadback(env: Awaited<ReturnType<typeof setup>>, count: number, options: {
  result?: RoleResult; workflowRunId?: string; workflowId?: string; requestDigest?: string;
} = {}) {
  const result: RoleResult = options.result ?? { kind: "delegate", payload: { taskId: "J01", subjectKind: "book", subjectId: id(11) } };
  const wrapper = { schemaVersion: env.authority.grant.tokenPolicy ? "booklet_provider_v2" : "booklet_provider_v1",
    content: JSON.stringify({ result }), providerEvidence: {
      provider: "openai", apiBaseUrl: "https://api.openai.com/v1",
      stdioSdk: { version: "0.10.2", readerSha256: "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22" },
      responseId: "resp_fake", requestId: "req_fake", model: "gpt-6-luna", serviceTier: "default", status: "completed",
      refused: false, incompleteReason: null, requestDigest: options.requestDigest ?? env.prepared.requestDigest, countedInputTokens: count,
      usage: { source: "provider_reported", inputTokens: count, outputTokens: 100, cachedInputTokens: 0,
        cacheWriteInputTokens: null, reasoningOutputTokens: 0 },
      ...(env.authority.grant.tokenPolicy ? { effectivePolicy: { version: "m4_context_policy_v2",
        hash: env.tokenPolicy.hash, maxInputTokens: 128000, warningInputTokens: 32000 },
        contextWarnings: count > 32000 ? ["input_tokens_above_32000"] : [] } : {}),
    } };
  const runtime: WorkflowRuntime = { start: vi.fn(async () => { throw new Error("No provider POST allowed"); }),
    retrieve: vi.fn(async (): Promise<RuntimeResult> => ({ kind: "execution", execution: {
      id: options.workflowRunId ?? id(13), workflow_id: options.workflowId ?? env.policy.publications[0].publishedWorkflowId, status: "succeeded",
      outputs: { booklet_provider_result: JSON.stringify(wrapper) },
    } })) };
  return { result, runtime, observer: createM4ProviderResults(env.db, env.authority, env.config, runtime) };
}

async function verifyAccounting(db: Database) {
  await withMongoTransaction(db, async session => verifyM4Accounting(db, session,
    (await db.collections.experiment_runs.findOne({ _id: id(10) }, { session }))!));
}

describe("persisted forward-only M4 token policy", () => {
  it("saves amendment outside frozen base, reserves once, and reuses authenticated v2 observation", async () => {
    const env = await setup();
    expect(env.prepared.tokenPolicy).toEqual(env.tokenPolicy);
    expect(env.prepared.adapterUpdate).toEqual(env.adapterUpdate);
    expect((await env.repository.getRun(id(10)))!.m4?.policyHash).toBe(env.baseHash);
    expect((await env.repository.getOperation(id(12)))!.contextDiagnostics?.authoritativeInputTokens).toBeNull();
    await env.dispatch();
    const attempts = await Promise.allSettled([env.repository.claimOperation(env.claim), env.repository.claimOperation(env.claim)]);
    expect(attempts.filter(attempt => attempt.status === "fulfilled" && attempt.value.started)).toHaveLength(1);
    expect(await env.repository.getOperation(id(12))).toMatchObject({ reservationCount: 1,
      m4Reservation: { maximumMicrodollars: 17924, tokenPolicy: env.tokenPolicy,
        effectivePolicyHash: env.tokenPolicy.hash, maxInputTokens: 128000 } });
    expect(await env.campaign()).toMatchObject({ requests: 1, reservedMicrodollars: 17924 });
    const fake = fakeReadback(env, 32001);
    const observed = await fake.observer.observe({ runId: id(10), operationId: id(12), nowMs: 7 });
    expect(observed).toMatchObject({ kind: "result", result: fake.result });
    expect(await env.repository.getOperation(id(12))).toMatchObject({ contextDiagnostics: {
      authoritativeInputTokens: 32001, warnings: expect.arrayContaining([{ code: "counted_input_tokens_high", projectionVersion: expect.any(String) }]) },
      m4Observation: { issue: null, evidenceJson: expect.stringContaining("input_tokens_above_32000") } });
    const after = await env.campaign();
    expect(after).toMatchObject({ requests: 1, reservedMicrodollars: 900, settledMicrodollars: expect.any(Number) });
    expect(await fake.observer.observe({ runId: id(10), operationId: id(12), nowMs: 8 })).toMatchObject({ kind: "result", result: fake.result });
    expect(await env.campaign()).toEqual(after);
    expect((await env.repository.completeOperation({ envelope: { runId: id(10), operationId: id(12), workflowRunId: id(13),
      inputFingerprint: "c".repeat(64), result: fake.result }, parentWorkflowRunId: null, nowMs: 9 })).reused).toBe(false);
    await verifyAccounting(env.db);
    // An assumed count fee remains reserved until its charge is verified.
    expect(await env.campaign()).toMatchObject({ requests: 1, reservedMicrodollars: 900 });
    expect((await env.repository.getOperation(id(12)))!.m4Reservation).toMatchObject({ tokenPolicy: env.tokenPolicy });
    expect(fake.runtime.start).not.toHaveBeenCalled();
    expect(fake.runtime.retrieve).toHaveBeenCalledTimes(2);
    // This test verifies readback and accounting. It does not complete a booklet.
  });

  it("blocks changed admission authority and insufficient allowance before provider work", async () => {
    const env = await setup(); await env.dispatch();
    const changed = createExperimentRepository(env.db, { m4Authority: { policy: env.policy,
      grant: { campaignId: id(1), reference: env.authority.grant.reference } }, m4ExecutionEnabled: true, elapsedNow: () => 0 });
    await expect(changed.claimOperation(env.claim)).rejects.toThrow();
    expect(await env.campaign()).toMatchObject({ requests: 0, reservedMicrodollars: 0 });
    expect((await env.repository.getOperation(id(12)))!.m4Reservation).toBeUndefined();
    await env.db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { settledMicrodollars: 4_990_000 } });
    expect(await env.repository.claimOperation(env.claim)).toMatchObject({ started: false, reason: "limit_exhausted" });
    expect(await env.repository.getOperation(id(12))).toMatchObject({ reservationCount: 0, state: "prepared" });
    expect((await env.repository.getOperation(id(12)))!.m4Reservation).toBeUndefined();
    expect(await env.campaign()).toMatchObject({ requests: 0, reservedMicrodollars: 0, settledMicrodollars: 4_990_000 });
    expect((await env.repository.getRun(id(10)))!.counters.payableText).toBe(0);
  });

  it("rejects a corrupted persisted reservation before provider readback", async () => {
    const env = await setup(); await env.dispatch();
    expect((await env.repository.claimOperation(env.claim)).started).toBe(true);
    const before = await env.campaign();
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) },
      { $set: { "m4Reservation.effectivePolicyHash": "d".repeat(64) } });
    const fake = fakeReadback(env, 32001);
    await expect(fake.observer.observe({ runId: id(10), operationId: id(12), nowMs: 7 })).rejects.toThrow();
    expect(await env.campaign()).toEqual(before);
    expect(fake.runtime.start).not.toHaveBeenCalled();
    expect(fake.runtime.retrieve).not.toHaveBeenCalled();
  });

  it("keeps a legacy reservation while a later amended specialist uses the new maximum", async () => {
    const legacy = await setup(false); await legacy.dispatch();
    expect((await legacy.repository.claimOperation(legacy.claim)).started).toBe(true);
    expect((await legacy.repository.getOperation(id(12)))!.m4Reservation).toMatchObject({ maximumMicrodollars: 5924 });
    const fake = fakeReadback(legacy, 100);
    expect(await fake.observer.observe({ runId: id(10), operationId: id(12), nowMs: 7 })).toMatchObject({ kind: "result" });
    await legacy.repository.completeOperation({ envelope: { runId: id(10), operationId: id(12), workflowRunId: id(13),
      inputFingerprint: "c".repeat(64), result: fake.result }, parentWorkflowRunId: null, nowMs: 8 });
    const amendedGrant = { campaignId: id(1), reference: legacy.authority.grant.reference,
      providerAdapterUpdate: legacy.adapterUpdate, tokenPolicy: legacy.tokenPolicy };
    const authority = { policy: legacy.policy, grant: amendedGrant };
    const repository = createExperimentRepository(legacy.db, { m4Authority: authority, m4ExecutionEnabled: true, elapsedNow: () => 0 });
    const run = (await repository.getRun(id(10)))!;
    await repository.prepareOperation({ runId: id(10), operationId: id(14), expectedRevision: run.revision,
      role: "specialist", taskId: "J01", subjectKind: "book", subjectId: id(11),
      inputFingerprint: "d".repeat(64), attempt: 1, providerKind: "text", nowMs: 9 });
    const prepared = await createM4TextPreparation(legacy.db, authority, { elapsedNow: () => 0 }).prepare({ runId: id(10), operationId: id(14), nowMs: 10 });
    await repository.beginDispatch({ runId: id(10), operationId: id(14), parentWorkflowRunId: id(13), nowMs: 11 });
    const claim = { runId: id(10), operationId: id(14), workflowRunId: id(15), parentWorkflowRunId: id(13), nowMs: 13 };
    await repository.recordDispatchIdentity({ ...claim, nowMs: 12 });
    await repository.verifyDispatchPublication({ ...claim, workflowId: legacy.policy.publications[1].publishedWorkflowId, nowMs: 12 });
    expect((await repository.claimOperation(claim)).started).toBe(true);
    expect((await legacy.repository.getOperation(id(12)))!.m4Reservation).toMatchObject({ maximumMicrodollars: 5924 });
    expect((await repository.getOperation(id(14)))!.m4Reservation).toMatchObject({ maximumMicrodollars: 20996,
      tokenPolicy: legacy.tokenPolicy, requestDigest: prepared.requestDigest });
    expect((await repository.getRun(id(10)))!.m4?.policyHash).toBe(legacy.baseHash);
    expect(await legacy.campaign()).toMatchObject({ requests: 2, reservedMicrodollars: 21896 });
    const text = "A reassuring story about two friends rescuing a kite.";
    const content = { schemaVersion: "2", title: "Kite Rescue", sourceInput: text,
      audience: { ageBand: "6-8", readingNeeds: "Short text" }, premise: text, theme: "Friendship",
      emotionalPromise: "Hope", tone: "Playful", storyScope: "Three story pages and a cover",
      contentRequirements: [text], knownConstraints: [], deferredDecisions: [], approvalQuestions: [] };
    const amendedEnv = { ...legacy, authority, config: legacy.config };
    const specialistResult = fakeReadback(amendedEnv, 32001, { result: { kind: "proposal", payload: { taskId: "J01", content } },
      workflowRunId: id(15), workflowId: legacy.policy.publications[1].publishedWorkflowId, requestDigest: prepared.requestDigest });
    expect(await specialistResult.observer.observe({ runId: id(10), operationId: id(14), nowMs: 14 })).toMatchObject({
      kind: "result", result: specialistResult.result });
    expect((await repository.completeOperation({ envelope: { runId: id(10), operationId: id(14), workflowRunId: id(15),
      inputFingerprint: "d".repeat(64), result: specialistResult.result }, parentWorkflowRunId: id(13), nowMs: 15 })).reused).toBe(false);
    await verifyAccounting(legacy.db);
    expect(await legacy.campaign()).toMatchObject({ requests: 2, reservedMicrodollars: 1800 });
    expect((await repository.getRun(id(10)))!.counters.payableText).toBe(2);
    expect((await repository.getOperation(id(14)))!.m4Reservation).toMatchObject({ tokenPolicy: legacy.tokenPolicy });
    expect(specialistResult.runtime.start).not.toHaveBeenCalled();
    expect(fake.runtime.start).not.toHaveBeenCalled();
  });
});
