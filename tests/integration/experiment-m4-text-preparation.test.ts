import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createM4TextPreparation } from "@/db/experiment-text-preparation";
import { createM4ProviderResults } from "@/db/experiment-provider-results";
import { specialistTaskSchema, type RoleResult } from "@/lib/contracts/experiment-runner";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import type { RuntimeResult, WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { m4RequestBundleHash } from "@/lib/experiment-runner/m4-request";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
async function setup(amended = false) {
  const db = await createTestDatabase({ seedAgents: false }); databases.push(db);
  const policy = { ...m4TestPolicy(), requestDefinitionHash: amended ? "a".repeat(64) : m4RequestBundleHash() };
  const authority = { policy, grant: { campaignId: id(1), reference: "fake-provider-only",
    ...(amended ? { requestDefinitionUpdate: { fromBundleHash: policy.requestDefinitionHash,
      toBundleHash: m4RequestBundleHash(), reference: "reviewed-definition-amendment" } } : {}) } };
  const repository = createExperimentRepository(db, { m4Authority: authority, m4ExecutionEnabled: true, elapsedNow: () => 0 });
  const preparation = createM4TextPreparation(db, authority, { elapsedNow: () => 0 });
  await repository.createRun({ runId: id(10), bookletId: id(11), persona: "playful_kid", mode: "balanced", campaignId: id(1), nowMs: 1,
    configuration: policy.publications.filter((p) => p.persona === null || p.persona === "playful_kid").map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({
      role, taskId, appId, publishedWorkflowId, toolProviderId, ...(finalPageIllustration ? { finalPageIllustration } : {}),
    })) });
  await repository.prepareOperation({ runId: id(10), operationId: id(12), expectedRevision: 0, role: "manager", taskId: null,
    subjectKind: "book", subjectId: id(11), inputFingerprint: "b".repeat(64), attempt: 1, providerKind: "text", nowMs: 2 });
  const input = { runId: id(10), operationId: id(12), nowMs: 3 };
  const claim = { runId: id(10), operationId: id(12), workflowRunId: id(13), parentWorkflowRunId: null, nowMs: 6 };
  async function dispatch(verify = true) {
    await repository.beginDispatch({ runId: id(10), operationId: id(12), parentWorkflowRunId: null, nowMs: 4 });
    await repository.recordDispatchIdentity({ ...claim, nowMs: 5 });
    if (verify) await repository.verifyDispatchPublication({ ...claim, workflowId: policy.publications[0].publishedWorkflowId, nowMs: 5 });
  }
  return { db, repository, preparation, input, claim, dispatch, policy, authority };
}

async function observeFakeResult(env: Awaited<ReturnType<typeof setup>>, operationId: string, result: RoleResult, nowMs: number) {
  const operation = (await env.repository.getOperation(operationId))!;
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid", callbackKey: "fixture",
    bindings: env.policy.publications.map((item) => ({ ...item, taskId: specialistTaskSchema.nullable().parse(item.taskId), apiKey: "fake-test-key" })) };
  const wrapper = { schemaVersion: "booklet_provider_v1", content: JSON.stringify({ result }), providerEvidence: {
    provider: "openai", apiBaseUrl: "https://api.openai.com/v1",
    stdioSdk: { version: "0.10.2", readerSha256: "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22" },
    responseId: `resp_fake_${operationId}`, requestId: `req_fake_${operationId}`, model: "gpt-6-luna", serviceTier: "default", status: "completed",
    refused: false, incompleteReason: null, requestDigest: operation.m4Preparation!.requestDigest, countedInputTokens: 100,
    usage: { source: "provider_reported", inputTokens: 100, outputTokens: 100, cachedInputTokens: 0, cacheWriteInputTokens: null, reasoningOutputTokens: 0 },
  } };
  const runtime: WorkflowRuntime = { start: vi.fn(async () => { throw new Error("No provider POST allowed"); }), retrieve: vi.fn(async (): Promise<RuntimeResult> => ({ kind: "execution",
    execution: { id: operation.workflowRunId!, workflow_id: operation.verifiedWorkflowId!, status: "succeeded", outputs: { booklet_provider_result: JSON.stringify(wrapper) } },
  })) };
  const observed = await createM4ProviderResults(env.db, env.authority, config, runtime).observe({ runId: id(10), operationId, nowMs });
  expect(observed.kind).toBe("result");
  expect(runtime.retrieve).toHaveBeenCalledTimes(1);
  expect(runtime.start).not.toHaveBeenCalled();
  if (observed.kind !== "result") throw new Error("Missing original fake-provider result");
  return observed.result;
}

describe("protected M4 preparation and atomic text claim", () => {
  it("prepares without a reservation, reuses unchanged input, and admits one fake action under duplicate authorization", async () => {
    const { db, repository, preparation, input, claim, dispatch } = await setup();
    const prepared = await preparation.prepare(input);
    const run = (await repository.getRun(id(10)))!;
    expect(run.counters.payableText).toBe(0);
    expect(await preparation.prepare(input)).toEqual(prepared);
    expect((await repository.getRun(id(10)))!.revision).toBe(run.revision);
    const context = JSON.parse(prepared.contextJson);
    expect(context.run).not.toHaveProperty("revision");
    expect(context.run).not.toHaveProperty("updatedAtMs");
    expect(await db.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ requests: 0 });
    await dispatch();
    let actions = 0;
    const results = await Promise.allSettled([1, 2].map(async () => {
      const result = await repository.claimOperation(claim);
      if (result.started) actions++;
      return result;
    }));
    expect(results.filter((result) => result.status === "fulfilled" && result.value.started)).toHaveLength(1);
    expect(actions).toBe(1);
    expect(await repository.getOperation(id(12))).toMatchObject({ state: "started", reservationCount: 1,
      m4Reservation: { requestDigest: prepared.requestDigest, maximumMicrodollars: 5024 } });
    expect((await repository.getRun(id(10)))!.counters).toMatchObject({ logicalText: 1, payableText: 1, steps: 1 });
    expect(await db.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ requests: 1, reservedMicrodollars: 5024 });
  });
  it("requires preparation before dispatch and exact publication before provider admission", async () => {
    const { db, repository, preparation, input, claim, dispatch, policy } = await setup();
    await expect(repository.beginDispatch({ runId: id(10), operationId: id(12), parentWorkflowRunId: null, nowMs: 3 })).rejects.toMatchObject({ code: "conflict" });
    await preparation.prepare(input); await dispatch(false);
    await expect(repository.claimOperation(claim)).rejects.toMatchObject({ code: "conflict" });
    await expect(repository.verifyDispatchPublication({ ...claim, workflowId: id(999) })).rejects.toMatchObject({ code: "conflict" });
    await repository.verifyDispatchPublication({ ...claim, workflowId: policy.publications[0].publishedWorkflowId });
    expect((await repository.claimOperation(claim)).started).toBe(true);
    expect(await db.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ requests: 1 });
  });
  it("hands the verified manager selection to one prepared specialist and saves its normal proposal", async () => {
    const env = await setup();
    const { db, repository, preparation, input, claim, dispatch, policy } = env;
    await preparation.prepare(input); await dispatch(); await repository.claimOperation(claim);
    const managerResult = await observeFakeResult(env, id(12), { kind: "delegate", payload: { taskId: "J01", subjectKind: "book", subjectId: id(11) } }, 7);
    await repository.completeOperation({ envelope: { runId: id(10), operationId: id(12), workflowRunId: id(13), inputFingerprint: "b".repeat(64),
      result: managerResult }, parentWorkflowRunId: null, nowMs: 7 });
    const run = (await repository.getRun(id(10)))!;
    await repository.prepareOperation({ runId: id(10), operationId: id(14), expectedRevision: run.revision, role: "specialist", taskId: "J01",
      subjectKind: "book", subjectId: id(11), inputFingerprint: "c".repeat(64), attempt: 1, providerKind: "text", nowMs: 8 });
    const prepared = await preparation.prepare({ runId: id(10), operationId: id(14), nowMs: 9 });
    expect(prepared.parentWorkflowRunId).toBe(id(13));
    expect(prepared.requestJson).toContain('"proposal"');
    await expect(repository.beginDispatch({ runId: id(10), operationId: id(14), parentWorkflowRunId: id(99), nowMs: 10 })).rejects.toMatchObject({ code: "conflict" });
    await repository.beginDispatch({ runId: id(10), operationId: id(14), parentWorkflowRunId: id(13), nowMs: 10 });
    const specialist = { runId: id(10), operationId: id(14), workflowRunId: id(15), parentWorkflowRunId: id(13), nowMs: 11 };
    await repository.recordDispatchIdentity(specialist);
    await repository.verifyDispatchPublication({ ...specialist, workflowId: policy.publications[1].publishedWorkflowId });
    expect((await repository.claimOperation(specialist)).started).toBe(true);
    const text = "A reassuring story about two friends rescuing a kite.";
    const content = { schemaVersion: "2", title: "Kite Rescue", sourceInput: text, audience: { ageBand: "6-8", readingNeeds: "Short text" },
      premise: text, theme: "Friendship", emotionalPromise: "Hope", tone: "Playful", storyScope: "Three story pages and a cover",
      contentRequirements: [text], knownConstraints: [], deferredDecisions: [], approvalQuestions: [] };
    const specialistResult = await observeFakeResult(env, id(14), { kind: "proposal", payload: { taskId: "J01", content } }, 12);
    await repository.completeOperation({ envelope: { runId: id(10), operationId: id(14), workflowRunId: id(15), inputFingerprint: "c".repeat(64), result: specialistResult },
      parentWorkflowRunId: id(13), nowMs: 12 });
    expect(await db.collections.artifacts.findOne({ experimentRunId: id(10), taskId: "J01" })).toMatchObject({ state: "draft" });
    expect((await repository.getRun(id(10)))!.counters).toMatchObject({ payableText: 2, payableImage: 0 });
    // Each original fake GET supplies 100 input + 100 output tokens; the frozen
    // upper rate settles 63 microdollars per invocation, with verified zero count fee.
    expect(await db.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ requests: 2, settledMicrodollars: 126, reservedMicrodollars: 0 });
  });
  it("invalidates mutable source/approval metadata without relying on a run revision change", async () => {
    for (const drift of ["artifact", "approval"] as const) {
      const { db, repository, preparation, input, claim, dispatch } = await setup();
      await db.collections.artifacts.insertOne({ _id: id(40), bookletId: id(11), artifactType: "book_concept_brief",
        state: "draft", currentVersionId: id(41), taskId: "J01", subjectKind: "book", subjectId: id(11), experimentRunId: id(10), createdAtMs: 1, updatedAtMs: 1 });
      await db.collections.artifact_versions.insertOne({ _id: id(41), artifactId: id(40), versionNumber: 1, schemaVersion: "2",
        contentJson: '{"title":"fixture"}', dependencyVersionIdsJson: "[]", createdBy: "fake-provider", sourceVersionId: null,
        sourceExecutionBatchId: null, createdAtMs: 1 });
      await preparation.prepare(input); await dispatch();
      const revision = (await repository.getRun(id(10)))!.revision;
      if (drift === "artifact") await db.collections.artifacts.updateOne({ _id: id(40) }, { $set: { currentVersionId: id(43) } });
      else {
        // Approval provenance itself participates in the signature, even when
        // version pointers and artifact state stay unchanged in this fixture.
        await db.collections.approvals.insertOne({ _id: id(42), bookletId: id(11), experimentRunId: id(10), artifactVersionId: id(41),
          scope: "artifact", subjectKey: null, action: "approve", origin: "explicit", sourceApprovalId: null, cardResponseId: null, qualityReviewId: null, createdAtMs: 4 });
      }
      expect((await repository.getRun(id(10)))!.revision).toBe(revision);
      await expect(repository.claimOperation(claim)).rejects.toMatchObject({ code: "conflict" });
      expect(await db.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ requests: 0, reservedMicrodollars: 0 });
    }
  });
  it("rejects Pause, retained Stop, deadlines and drain before any reservation", async () => {
    for (const gate of ["pause", "stop", "deadline", "drain"] as const) {
      const { db, repository, preparation, input, claim, dispatch } = await setup();
      await preparation.prepare(input); await dispatch();
      if (gate === "pause") await repository.pause({ runId: id(10), expectedRevision: (await repository.getRun(id(10)))!.revision, nowMs: 5 });
      if (gate === "stop") await db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { "lifecycle.stop": { requestedAtMs: 5, reason: "manual", delivery: "pending" } } });
      if (gate === "deadline") await db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { deadlineAtMs: 6 } });
      if (gate === "drain") await db.collections.deployment_control.insertOne({ _id: id(99), schemaVersion: "1", environment: "local", maintenance: false, draining: true, reason: null, activeMutations: 0, updatedAtMs: 5 });
      const outcome = await repository.claimOperation(claim).catch(() => null);
      expect(outcome?.started ?? false).toBe(false);
      expect(await db.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ requests: 0, reservedMicrodollars: 0 });
    }
  });
  it("blocks exhausted campaign allowances without admitting or reserving provider work", async () => {
    for (const exhausted of [{ requests: 500 }, { "requestCounts.playful_kid": 120 }, { settledMicrodollars: 5_000_000 }]) {
      const { db, repository, preparation, input, claim, dispatch } = await setup();
      await preparation.prepare(input); await dispatch();
      await db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: exhausted });
      expect(await repository.claimOperation(claim)).toMatchObject({ started: false, reason: "limit_exhausted" });
      expect(await repository.getRun(id(10))).toMatchObject({ status: "blocked", safeFailure: "limit_exhausted", counters: { payableText: 0 } });
      expect(await repository.getOperation(id(12))).toMatchObject({ state: "prepared", reservationCount: 0, authorizationClaim: null });
      expect(await repository.getOperation(id(12))).not.toHaveProperty("m4Reservation");
      expect(await db.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ state: "stopped", reservedMicrodollars: 0 });
      expect(await repository.claimOperation(claim)).toMatchObject({ started: false, reason: "blocked" });
    }
  });
});


describe("protected request-definition amendment", () => {
  it("prepares against the original policy and rejects missing or changed authority before any reservation", async () => {
    const env = await setup(true);
    const originalRun = (await env.repository.getRun(id(10)))!;
    const prepared = await env.preparation.prepare(env.input);
    expect(prepared.definitionUpdate).toEqual(env.authority.grant.requestDefinitionUpdate);
    expect((await env.repository.getRun(id(10)))!.m4).toEqual(originalRun.m4);
    for (const grant of [{ campaignId: id(1), reference: env.authority.grant.reference },
      { ...env.authority.grant, requestDefinitionUpdate: { ...env.authority.grant.requestDefinitionUpdate!, reference: "changed-before-dispatch" } }]) {
      await expect(createM4TextPreparation(env.db, { policy: env.policy, grant }, { elapsedNow: () => 0 }).prepare(env.input)).rejects.toThrow();
      expect((await env.repository.getOperation(id(12)))!.m4Preparation).toEqual(prepared);
    }
    await env.dispatch();
    for (const grant of [{ campaignId: id(1), reference: env.authority.grant.reference },
      { ...env.authority.grant, requestDefinitionUpdate: { ...env.authority.grant.requestDefinitionUpdate!, reference: "changed-after-preparation" } }]) {
      const changed = createExperimentRepository(env.db, { m4Authority: { policy: env.policy, grant }, m4ExecutionEnabled: true, elapsedNow: () => 0 });
      await expect(changed.claimOperation(env.claim)).rejects.toThrow("not current");
      expect(await env.db.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ requests: 0, reservedMicrodollars: 0 });
    }
    expect(await env.repository.claimOperation(env.claim)).toMatchObject({ started: true });
    expect(await env.db.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ requests: 1 });
    expect((await env.repository.getRun(id(10)))!.m4).toEqual(originalRun.m4);
  });
});
