import { afterEach, describe, expect, it, vi } from "vitest";
import { withMongoTransaction, type Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExecutionAllowanceLedger } from "@/db/experiment-execution-allowance";
import { verifyExecutionAccounting } from "@/db/experiment-execution-accounting";
import { closeExecutionTextFailure, hasExecutionTextFailure } from "@/db/experiment-execution-text-failure";
import { createM4TextPreparation } from "@/db/experiment-text-preparation";
import { createM4ProviderResults } from "@/db/experiment-provider-results";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import type { WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { specialistTaskSchema } from "@/lib/contracts/experiment-runner";
import { defaultExecutionAllowance, executionPolicyFromM4TechnicalProfile, realExecutionPolicyFromM4TechnicalProfile } from "@/lib/experiment-runner/execution-policy";
import { m4TokenPolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

async function setup(maxMicrodollars = 1, allowancePatch: Partial<ReturnType<typeof defaultExecutionAllowance>> = {}, mode: "balanced" | "real" = "balanced",
  executionVersion: "execution_v1" | "execution_v2" = "execution_v1") {
  const db = await createTestDatabase({ seedAgents: false }); databases.push(db);
  const tokenPolicy = m4TokenPolicySnapshot({ version: "m4_context_policy_v2", basePolicyHash: "a".repeat(64),
    warningInputTokens: 32000, maxInputTokens: 128000,
    requiredProviderAdapterIdentity: `langgenius/openai:1.0.7-dev5@${"b".repeat(64)}`,
    requiredProviderPackageSha256: "c".repeat(64), reference: "fake-provider-test-only" });
  const source = { ...m4TestPolicy(), countChargeStatus: "assumed" as const, countChargeCeilingMicrodollars: 900 };
  const policy = mode === "balanced" ? executionPolicyFromM4TechnicalProfile(source, tokenPolicy) :
    realExecutionPolicyFromM4TechnicalProfile(source, tokenPolicy, source.publications, {
      textPluginIdentity: `langgenius/openai:1.0.7-dev6@${"d".repeat(64)}`, textPackageSha256: "e".repeat(64),
      imagePluginIdentity: `langgenius/openai_tool:0.2.2-dev1@${"f".repeat(64)}`, imagePackageSha256: "a".repeat(64), executionVersion,
    });
  const totals = { ...defaultExecutionAllowance("playful_kid", maxMicrodollars), steps: 1, ...allowancePatch };
  const ledger = createExecutionAllowanceLedger(db);
  const repository = createExperimentRepository(db, mode === "real" ? { realExecutionEnabled: true } : {});
  const grant = { campaignId: id(1), mode, persona: "playful_kid" as const,
    profile: policy, approvalId: id(2), reference: "fake-initial-approval", totals, nowMs: 1 };
  const createCampaign = () => withMongoTransaction(db, session => ledger.create(session, grant));
  await createCampaign();
  const creation = (n: number) => ({ runId: id(n), bookletId: id(n + 1), persona: "playful_kid", mode,
    executionCampaignId: id(1), nowMs: 2,
    configuration: policy.publications.filter(item => item.persona === null || item.persona === "playful_kid")
      .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({
        role, taskId, appId, publishedWorkflowId, toolProviderId, ...(finalPageIllustration ? { finalPageIllustration } : {}),
      })) });
  await repository.createRun(creation(10));
  const campaign = () => withMongoTransaction(db, session => ledger.current(session, id(1)));
  const run = async () => (await repository.getRun(id(10)))!;
  async function pause() {
    const before = await run();
    const operation = await repository.prepareOperation({ runId: id(10), operationId: id(12), expectedRevision: before.revision,
      role: "manager", taskId: null, subjectKind: "book", subjectId: id(11), inputFingerprint: "d".repeat(64),
      attempt: 1, providerKind: "text", nowMs: 3 });
    await withMongoTransaction(db, async session => {
      const currentRun = (await db.collections.experiment_runs.findOne({ _id: id(10) }, { session }))!;
      expect((await ledger.check(session, currentRun, "manager", "text")).reason).toBe("monetary");
      await ledger.pause(session, currentRun, "monetary", 4, operation);
    });
    const paused = await run(), currentCampaign = await campaign();
    return { paused, currentCampaign, input: { runId: id(10), approvalId: id(3), reference: "fake-step-approval",
      expectedRunRevision: paused.revision, expectedCampaignRevision: currentCampaign.revision,
      expectedPendingDigest: paused.pendingApproval!.requestDigest,
      totals: { ...totals, maxMicrodollars: paused.pendingApproval!.requiredTotal! }, nowMs: 5 } };
  }
  return { db, ledger, repository, totals, grant, createCampaign, creation, campaign, run, pause };
}

describe("Execution approval ledger with disposable persistence and no providers", () => {
  async function incompleteManager(mode: "balanced" | "real" = "balanced", version: "execution_v1" | "execution_v2" = "execution_v1") {
    const env = await setup(5_000_000, {}, mode, version);
    const run = await env.run(), profile = env.grant.profile;
    await env.repository.prepareOperation({ runId: run._id, operationId: id(12), expectedRevision: run.revision,
      role: "manager", taskId: null, subjectKind: "book", subjectId: run.bookletId,
      inputFingerprint: "d".repeat(64), attempt: 1, providerKind: "text", nowMs: 3 });
    const prepared = await createM4TextPreparation(env.db, { executionProfile: profile, campaignId: id(1) },
      { elapsedNow: () => 0 }).prepare({ runId: id(10), operationId: id(12), nowMs: 4 });
    await env.repository.beginDispatch({ runId: id(10), operationId: id(12), parentWorkflowRunId: null, nowMs: 5 });
    const identity = { runId: id(10), operationId: id(12), workflowRunId: id(13), parentWorkflowRunId: null, nowMs: 6 };
    await env.repository.recordDispatchIdentity(identity);
    const publication = profile.publications.find(item => item.role === "manager")!;
    await env.repository.verifyDispatchPublication({ ...identity, workflowId: publication.publishedWorkflowId });
    await env.repository.claimOperation(identity);
    const wrapper = { schemaVersion: "booklet_provider_v2", content: "", providerEvidence: {
      provider: "openai", apiBaseUrl: "https://api.openai.com/v1",
      stdioSdk: { version: "0.10.2", readerSha256: "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22" },
      responseId: "resp_fake", requestId: "req_fake", model: "gpt-6-luna", serviceTier: "default", status: "incomplete",
      refused: false, incompleteReason: "max_output_tokens" as string | null, requestDigest: prepared.requestDigest, countedInputTokens: 368,
      usage: { source: "provider_reported", inputTokens: 368, outputTokens: 2048, cachedInputTokens: 0,
        cacheWriteInputTokens: 0, reasoningOutputTokens: 0 },
      effectivePolicy: { version: "m4_context_policy_v2", hash: profile.tokenPolicy.hash,
        maxInputTokens: 128000, warningInputTokens: 32000 }, contextWarnings: [],
    } };
    const runtime: WorkflowRuntime = { start: vi.fn(async () => { throw new Error("Provider replay prohibited"); }),
      retrieve: vi.fn(async () => ({ kind: "execution" as const, execution: { id: id(13),
        workflow_id: publication.publishedWorkflowId, status: "succeeded" as const,
        outputs: { booklet_provider_result: JSON.stringify(wrapper) } } })) };
    const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid",
      callbackKey: "fixture", bindings: profile.publications.map(item => ({ ...item,
        taskId: specialistTaskSchema.nullable().parse(item.taskId), apiKey: "fake-key" })) };
    if (mode === "real") config.real = { state: "ready", bindings: config.bindings,
      sourcePolicy: m4TestPolicy(), tokenPolicy: profile.tokenPolicy, nativeFileFormat: "base64",
      textPluginIdentity: "fixture", textPackageSha256: "e".repeat(64), imagePluginIdentity: "fixture", imagePackageSha256: "a".repeat(64) };
    const observe = () => createM4ProviderResults(env.db, { executionProfile: profile, campaignId: id(1) }, config, runtime)
      .observe({ runId: id(10), operationId: id(12), nowMs: 7 });
    const inspect = (nowMs = 9) => createExperimentDispatcher({ database: env.db, config, runtime, now: () => nowMs,
      mutate: async fn => fn() }).inspect({ runId: id(10), operationId: id(12) });
    return { ...env, runtime, wrapper, observe, inspect };
  }

  it.each(["balanced", "real"] as const)("closes an attributable incomplete %s manager without replay, spending reset or duplicate closure", async mode => {
    const env = await incompleteManager(mode);
    expect(await env.observe()).toEqual({ kind: "blocked" });
    const run = await env.run(), op = await env.repository.getOperation(id(12)), campaign = await env.campaign();
    expect(run).toMatchObject({ status: "blocked", safeFailure: "definite_failure", activeOperationId: null,
      counters: { logicalText: 1, payableText: 1, steps: 1 } });
    expect(op).toMatchObject({ state: "failed", safeFailure: "definite_failure", remoteStatus: "succeeded",
      lifecycle: { phase: "finished", unresolved: false, attemptOutcome: "failed" },
      m4Observation: { issue: "provider_failure", content: "" },
      m4Reservation: { settledMicrodollars: 1070, unsettledMicrodollars: 900 } });
    expect(campaign).toMatchObject({ textRequests: 1, settledMicrodollars: 1070, reservedMicrodollars: 900 });
    await withMongoTransaction(env.db, session => verifyExecutionAccounting(env.db, session, run));
    expect(await closeExecutionTextFailure(env.db, { runId: run._id, operationId: id(12), nowMs: 9 })).toBe(true);
    expect(await env.run()).toEqual(run);
    expect(await env.repository.getOperation(id(12))).toEqual(op);
    expect(await env.campaign()).toEqual(campaign);
    expect(await env.inspect()).toMatchObject({ state: "failed", lifecycle: { unresolved: false } });
    vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "unknown" });
    expect(await env.inspect()).toMatchObject({ state: "failed", lifecycle: { unresolved: false } });
    expect(env.runtime.start).not.toHaveBeenCalled();
  });

  it.each([500, 501, "malformed"] as const)("classifies completed compact manager output %s from its saved bytes", async length => {
    const env = await incompleteManager("real", "execution_v2");
    env.wrapper.providerEvidence.status = "completed";
    env.wrapper.providerEvidence.incompleteReason = null;
    env.wrapper.providerEvidence.usage.outputTokens = 3000;
    env.wrapper.content = length === "malformed" ? "{" : JSON.stringify({ result: {
      kind: "ask", payload: { question: "a".repeat(length) },
    } });
    const outcome = await env.observe();
    if (length === 500) {
      expect(outcome.kind).toBe("result");
      await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { "m4Observation.issue": "creative_invalid" } });
      expect(await closeExecutionTextFailure(env.db, { runId: id(10), operationId: id(12), nowMs: 8 })).toBe(false);
      await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { "m4Observation.issue": null } });
      if (outcome.kind !== "result") throw new Error("Valid manager result missing");
      const completion = { envelope: { runId: id(10), operationId: id(12), workflowRunId: id(13),
        inputFingerprint: "d".repeat(64), result: outcome.result }, parentWorkflowRunId: null, nowMs: 8 };
      expect((await env.repository.completeOperation(completion)).reused).toBe(false);
      expect((await env.repository.completeOperation(completion)).reused).toBe(true);
      expect(await env.repository.getOperation(id(12))).toMatchObject({ state: "succeeded" });
    } else {
      expect(outcome.kind).toBe("blocked");
      expect(await env.run()).toMatchObject({ activeOperationId: null, safeFailure: "definite_failure", pauseRequested: true });
      expect(await env.repository.getOperation(id(12))).toMatchObject({ state: "failed", resultJson: null,
        lifecycle: { unresolved: false }, m4Observation: { issue: "creative_invalid", content: env.wrapper.content },
        m4Reservation: { settledMicrodollars: 1546, unsettledMicrodollars: 900 } });
      await withMongoTransaction(env.db, async session => verifyExecutionAccounting(env.db, session, await env.run()));
      expect(await env.inspect()).toMatchObject({ state: "failed", lifecycle: { unresolved: false } });
    }
    expect(env.runtime.start).not.toHaveBeenCalled();
  });

  it.each(["wrapper", "status", "publication", "explicit"])("retains a conflicting %s readback after closure without accepting old proof", async field => {
    const env = await incompleteManager("real");
    await env.observe();
    const original = await env.runtime.retrieve({} as never, id(13));
    if (original.kind !== "execution") throw new Error("Fixture execution missing");
    const changed = structuredClone(original);
    if (field === "wrapper") changed.execution.outputs = { booklet_provider_result: "{}" };
    if (field === "status") changed.execution.status = "running";
    if (field === "publication") changed.execution.workflow_id = id(80);
    vi.mocked(env.runtime.retrieve).mockResolvedValue(field === "explicit" ? { kind: "conflict" } : changed);
    expect(await env.inspect()).toMatchObject({ state: "unknown", lifecycle: { unresolved: true },
      m4Observation: { issue: "conflicting_evidence" } });
    expect(await env.run()).toMatchObject({ activeOperationId: id(12), safeFailure: "unknown_outcome" });
    expect(await closeExecutionTextFailure(env.db, { runId: id(10), operationId: id(12), nowMs: 10 })).toBe(false);
    expect(await env.campaign()).toMatchObject({ settledMicrodollars: 1070, reservedMicrodollars: 900, textRequests: 1 });
    expect(env.runtime.start).not.toHaveBeenCalled();
  });

  it("closes the expired acknowledged-stop failure without renewing its deadline or losing receipts", async () => {
    const env = await incompleteManager("real");
    // Retain the same observation without letting the fresh-result path close it.
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) },
      { $set: { resultFinalizationClaim: { id: id(30), expiresAtMs: 100 } } });
    await env.observe();
    const original = (await env.repository.getOperation(id(12)))!;
    if (original.deadlineAtMs === null) throw new Error("Fixture deadline missing");
    const expiredAt = original.deadlineAtMs + 1;
    const stop = { requestedAtMs: expiredAt, reason: "deadline" as const, delivery: "acknowledged" as const };
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: {
      resultFinalizationClaim: null,
      lifecycle: { ...original.lifecycle!, phase: "finished", attemptOutcome: "failed", unresolved: true,
        endedAtMs: expiredAt, timeoutAtMs: expiredAt, stop },
    } });
    const before = await env.campaign();
    expect(await env.inspect(expiredAt + 1)).toMatchObject({ state: "failed", deadlineAtMs: original.deadlineAtMs,
      lifecycle: { phase: "finished", unresolved: false, endedAtMs: expiredAt, timeoutAtMs: expiredAt, stop } });
    expect(await env.run()).toMatchObject({ activeOperationId: null, pauseRequested: true, safeFailure: "definite_failure" });
    expect(await env.campaign()).toEqual(before);
    const closed = await env.repository.getOperation(id(12));
    expect(await env.inspect(expiredAt + 2)).toEqual(closed);
    expect(env.runtime.start).not.toHaveBeenCalled();
  });

  it("keeps conflicting evidence and active save ownership unresolved, then reconciles the same result", async () => {
    const env = await incompleteManager();
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) },
      { $set: { resultFinalizationClaim: { id: id(30), expiresAtMs: 100 } } });
    await env.observe();
    const retained = (await env.repository.getOperation(id(12)))!;
    expect(await env.run()).toMatchObject({ status: "blocked", activeOperationId: id(12), safeFailure: "unknown_outcome" });
    expect(await closeExecutionTextFailure(env.db, { runId: id(10), operationId: id(12), nowMs: 8 })).toBe(false);
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { resultFinalizationClaim: null } });
    for (const patch of [
      { "m4Observation.issue": "conflicting_evidence" }, { "m4Observation.evidenceDigest": "e".repeat(64) },
      { "m4Reservation.settledMicrodollars": 0 }, { "m4Preparation.requestDigest": "e".repeat(64) },
      { "m4Observation.evidenceJson": null }, { "m4Observation.remoteStatus": "running" },
      { "m4Observation.evidenceJson": JSON.stringify({ status: "unknown" }) },
    ]) {
      await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: patch });
      expect(await closeExecutionTextFailure(env.db, { runId: id(10), operationId: id(12), nowMs: 9 })).toBe(false);
      await env.db.collections.experiment_operations.replaceOne({ _id: id(12) }, { ...retained, resultFinalizationClaim: null });
    }
    await env.db.collections.messages.insertOne({ _id: id(35), bookletId: id(11), sequence: 1, role: "assistant",
      schemaVersion: "1", uiMessageJson: "{}", createdAtMs: 8, operationId: id(12) });
    expect(await closeExecutionTextFailure(env.db, { runId: id(10), operationId: id(12), nowMs: 9 })).toBe(false);
    await env.db.collections.messages.deleteOne({ _id: id(35) });
    expect(await closeExecutionTextFailure(env.db, { runId: id(10), operationId: id(12), nowMs: 10 })).toBe(true);
    expect(await env.campaign()).toMatchObject({ textRequests: 1, settledMicrodollars: 1070, reservedMicrodollars: 900 });
    expect(env.runtime.start).not.toHaveBeenCalled();
    const closed = (await env.repository.getOperation(id(12)))!;
    const run = await env.run();
    expect(await withMongoTransaction(env.db, session => hasExecutionTextFailure(env.db, session,
      { ...run, execution: { ...run.execution!, profileHash: "e".repeat(64) } }, closed, 11))).toBe(false);
  });

  it("verifies a historical prepared cancellation after later source changes and new preparation", async () => {
    const env = await setup();
    const initial = await env.run();
    const preparation = createM4TextPreparation(env.db, {
      executionProfile: JSON.parse(initial.execution!.profileJson), campaignId: id(1),
    }, { elapsedNow: () => 0 });
    const prepare = async (operationId: string, nowMs: number) => {
      const run = await env.run();
      await env.repository.prepareOperation({ runId: run._id, operationId, expectedRevision: run.revision,
        role: "manager", taskId: null, subjectKind: "book", subjectId: run.bookletId,
        inputFingerprint: operationId.replaceAll("-", "").padEnd(64, "0"), attempt: 1, providerKind: "text", nowMs });
      return preparation.prepare({ runId: run._id, operationId, nowMs: nowMs + 1 });
    };
    const originalPreparation = await prepare(id(12), 3);
    await env.repository.beginDispatch({ runId: id(10), operationId: id(12), parentWorkflowRunId: null, nowMs: 5 });
    const paused = await env.run(), campaign = await env.campaign();
    expect(paused.pendingApproval).toMatchObject({ reason: "monetary", operationId: id(12) });
    const cancelled = await env.repository.getOperation(id(12));
    expect(cancelled!.m4Preparation).toEqual(originalPreparation);
    expect(cancelled).toMatchObject({ state: "failed", reservationCount: 0,
      executionAllowanceCancellation: { kind: "undispatched_allowance_v1" } });
    await env.repository.approveExecutionAllowance({ runId: id(10), approvalId: id(3), reference: "approve-original-preparation",
      expectedRunRevision: paused.revision, expectedCampaignRevision: campaign.revision,
      expectedPendingDigest: paused.pendingApproval!.requestDigest,
      totals: { ...env.totals, maxMicrodollars: paused.pendingApproval!.requiredTotal! }, nowMs: 6 });

    // Persist a valid later booklet edit. Its title participates in the source fingerprint.
    await env.db.collections.booklets.updateOne({ _id: id(11), experimentRunId: id(10) },
      { $set: { workingTitle: "The rescued kite", updatedAtMs: 7 } });
    const laterPreparation = await prepare(id(14), 8);
    expect(laterPreparation.sourceFingerprint).not.toBe(originalPreparation.sourceFingerprint);
    await withMongoTransaction(env.db, async session => {
      const run = (await env.db.collections.experiment_runs.findOne({ _id: id(10) }, { session }))!;
      await verifyExecutionAccounting(env.db, session, run);
    });
    const current = await env.run();
    const manuallyPaused = await env.repository.pause({ runId: id(10), expectedRevision: current.revision, nowMs: 10 });
    await env.repository.resume({ runId: id(10), expectedRevision: manuallyPaused.revision, nowMs: 11 });
    expect(await env.repository.getOperation(id(12))).toEqual(cancelled);
    expect(await env.repository.getOperation(id(14))).toMatchObject({ state: "prepared", reservationCount: 0 });
    expect((await env.run()).counters).toEqual(initial.counters);
    expect(await env.campaign()).toMatchObject({ textRequests: 0, reservedMicrodollars: 0, settledMicrodollars: 0 });
  });

  it("accepts a finite initial allowance above USD5 and claims exactly one paid run", async () => {
    const env = await setup(8_000_000);
    const initial = await env.campaign();
    expect(initial).toMatchObject({ runId: id(10), allowance: { maxMicrodollars: 8_000_000 }, approvals: [
      { approvalId: id(2), previousTotals: null, reason: "initial", channel: "operator_http" },
    ] });
    expect(await env.createCampaign()).toEqual(initial);
    expect(await env.repository.createRun(env.creation(10))).toEqual(await env.run());
    await expect(env.repository.createRun(env.creation(20))).rejects.toThrow("one paid run");
    expect(await env.db.collections.experiment_runs.countDocuments()).toBe(1);
    expect(await env.db.collections.booklets.findOne({ _id: id(21) })).toBeNull();
    await expect(withMongoTransaction(env.db, session => env.ledger.create(session,
      { ...env.grant, totals: { ...env.totals, maxMicrodollars: 9_000_000 } }))).rejects.toMatchObject({ code: "conflict" });
    expect(await env.campaign()).toEqual(initial);
  });

  it("retains one text reservation across simultaneous claims and repository restart", async () => {
    const env = await setup(8_000_000);
    const run = await env.run();
    await env.repository.prepareOperation({ runId: run._id, operationId: id(12), expectedRevision: run.revision,
      role: "manager", taskId: null, subjectKind: "book", subjectId: run.bookletId,
      inputFingerprint: "c".repeat(64), attempt: 1, providerKind: "text", nowMs: 3 });
    await createM4TextPreparation(env.db, { executionProfile: JSON.parse(run.execution!.profileJson),
      campaignId: id(1) }, { elapsedNow: () => 0 }).prepare({ runId: id(10), operationId: id(12), nowMs: 4 });
    await env.repository.beginDispatch({ runId: id(10), operationId: id(12), parentWorkflowRunId: null, nowMs: 5 });
    const identity = { runId: id(10), operationId: id(12), workflowRunId: id(13), parentWorkflowRunId: null, nowMs: 6 };
    await env.repository.recordDispatchIdentity(identity);
    const profile = JSON.parse(run.execution!.profileJson) as typeof env.grant.profile;
    await env.repository.verifyDispatchPublication({ ...identity,
      workflowId: profile.publications.find(item => item.role === "manager")!.publishedWorkflowId });
    const restarted = createExperimentRepository(env.db);
    const outcomes = await Promise.allSettled([env.repository.claimOperation(identity), restarted.claimOperation(identity)]);
    expect(outcomes.filter(item => item.status === "fulfilled" && item.value.started)).toHaveLength(1);
    expect(await env.repository.getOperation(id(12))).toMatchObject({ reservationCount: 1,
      m4Reservation: { campaignId: id(1), unsettledMicrodollars: expect.any(Number) } });
    const saved = await env.campaign();
    expect(saved).toMatchObject({ textRequests: 1, reservedMicrodollars: expect.any(Number) });
    expect(saved.reservedMicrodollars).toBeGreaterThan(0);
    expect((await restarted.claimOperation(identity)).started).toBe(false);
    expect(await env.campaign()).toEqual(saved);
  });

  it("materializes a claimed tester allowance request once after approval and retains it through no-progress accounting", async () => {
    const env = await setup(8_000_000, { textCalls: 1, textRevisions: 0, noProgress: 1 });
    await env.db.collections.artifacts.insertOne({ _id: id(20), experimentRunId: id(10), bookletId: id(11),
      taskId: "J01", subjectKind: "book", subjectId: id(11), artifactType: "concept_brief", state: "draft",
      currentVersionId: id(22), createdAtMs: 2, updatedAtMs: 2 });
    await env.db.collections.artifact_versions.insertOne({ _id: id(22), artifactId: id(20), versionNumber: 1,
      schemaVersion: "2", contentJson: "{}", dependencyVersionIdsJson: "[]", createdBy: "agent",
      sourceVersionId: null, sourceExecutionBatchId: null, createdAtMs: 2 });
    const run = await env.run(), profile = JSON.parse(run.execution!.profileJson) as typeof env.grant.profile;
    await env.repository.prepareOperation({ runId: id(10), operationId: id(12), expectedRevision: run.revision,
      role: "tester", taskId: null, subjectKind: "book", subjectId: id(11), inputFingerprint: "e".repeat(64),
      attempt: 1, providerKind: "text", nowMs: 3 });
    const prepared = await createM4TextPreparation(env.db, { executionProfile: profile, campaignId: id(1) },
      { elapsedNow: () => 0 }).prepare({ runId: id(10), operationId: id(12), nowMs: 4 });
    await env.repository.beginDispatch({ runId: id(10), operationId: id(12), parentWorkflowRunId: null, nowMs: 5 });
    const identity = { runId: id(10), operationId: id(12), workflowRunId: id(13), parentWorkflowRunId: null, nowMs: 6 };
    await env.repository.recordDispatchIdentity(identity);
    const publication = profile.publications.find(item => item.role === "tester" && item.persona === "playful_kid")!;
    await env.repository.verifyDispatchPublication({ ...identity, workflowId: publication.publishedWorkflowId });
    expect((await env.repository.claimOperation(identity)).started).toBe(true);
    const result = { kind: "allowance_request" as const, payload: { reason: "text_revisions" as const,
      requestedTaskId: "J01" as const, requestedVersionId: id(22), instruction: "Revise the opening." } };
    const wrapper = { schemaVersion: "booklet_provider_v2", content: JSON.stringify({ result }), providerEvidence: {
      provider: "openai", apiBaseUrl: "https://api.openai.com/v1",
      stdioSdk: { version: "0.10.2", readerSha256: "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22" },
      responseId: "resp_fake", requestId: "req_fake", model: "gpt-6-luna", serviceTier: "default", status: "completed",
      refused: false, incompleteReason: null, requestDigest: prepared.requestDigest, countedInputTokens: 100,
      usage: { source: "provider_reported", inputTokens: 100, outputTokens: 100, cachedInputTokens: 0,
        cacheWriteInputTokens: null, reasoningOutputTokens: 0 },
      effectivePolicy: { version: "m4_context_policy_v2", hash: profile.tokenPolicy.hash,
        maxInputTokens: 128000, warningInputTokens: 32000 }, contextWarnings: [],
    } };
    const runtime: WorkflowRuntime = { start: vi.fn(async () => { throw new Error("No provider POST allowed"); }),
      retrieve: vi.fn(async () => ({ kind: "execution" as const, execution: { id: id(13),
        workflow_id: publication.publishedWorkflowId, status: "succeeded" as const,
        outputs: { booklet_provider_result: JSON.stringify(wrapper) } } })) };
    const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid",
      callbackKey: "fixture", bindings: profile.publications.map(item => ({ ...item,
        taskId: specialistTaskSchema.nullable().parse(item.taskId), apiKey: "fake-key" })) };
    expect(await createM4ProviderResults(env.db, { executionProfile: profile, campaignId: id(1) }, config, runtime)
      .observe({ runId: id(10), operationId: id(12), nowMs: 7 })).toMatchObject({ kind: "result", result });
    expect((await env.repository.completeOperation({ envelope: { runId: id(10), operationId: id(12),
      workflowRunId: id(13), inputFingerprint: "e".repeat(64), result }, parentWorkflowRunId: null, nowMs: 8 })).reused)
      .toBe(false);
    const paused = await env.run(), campaign = await env.campaign();
    expect(campaign.settledMicrodollars).toBeGreaterThan(0);
    expect(campaign.reservedMicrodollars).toBeGreaterThan(0);
    expect(paused.pendingApproval).toMatchObject({ reason: "text_revisions", decisionOperationId: id(12),
      targetTaskId: "J01", targetVersionId: id(22) });
    await env.db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { progressFingerprint: "f".repeat(64) } });
    const progress = await env.repository.recordProgress({ runId: id(10), operationId: id(12),
      fingerprint64: "f".repeat(64), nowMs: 9 });
    expect(progress.noProgressCount).toBe(1);
    expect(progress.pendingApproval).toEqual(paused.pendingApproval);
    const receipt = await env.repository.approveExecutionAllowance({ runId: id(10), approvalId: id(30),
      reference: "approve-revision", expectedRunRevision: progress.revision,
      expectedCampaignRevision: campaign.revision, expectedPendingDigest: paused.pendingApproval!.requestDigest,
      totals: { ...env.totals, textRevisions: 1 }, nowMs: 10 });
    expect(receipt.reused).toBe(false);
    expect(await env.run()).toMatchObject({ status: "queued", pendingApproval: null, textRevisions: 1 });
    expect((await createExperimentContextService(env.db).getRunView(id(10), "report"))?.limits)
      .toEqual({ text: 1, image: env.totals.imageCalls, steps: 1 });
    expect(await env.repository.getOperation(id(12))).toMatchObject({ state: "succeeded", reservationCount: 1,
      resultJson: expect.stringContaining("allowance_request"), executionApprovedDecision: { approvalId: id(30) } });
    const savedCampaign = await env.campaign();
    expect(savedCampaign).toMatchObject({ settledMicrodollars: campaign.settledMicrodollars,
      reservedMicrodollars: campaign.reservedMicrodollars });
    expect(await env.repository.approveExecutionAllowance({ runId: id(10), approvalId: id(30),
      reference: "approve-revision", expectedRunRevision: progress.revision,
      expectedCampaignRevision: campaign.revision, expectedPendingDigest: paused.pendingApproval!.requestDigest,
      totals: { ...env.totals, textRevisions: 1 }, nowMs: 11 })).toMatchObject({ reused: true });
    expect(await env.campaign()).toEqual(savedCampaign);
    expect(vi.mocked(runtime.start)).not.toHaveBeenCalled();
    await withMongoTransaction(env.db, async session => {
      const current = (await env.db.collections.experiment_runs.findOne({ _id: id(10) }, { session }))!;
      expect((await env.ledger.check(session, current, "manager", "text")).reason).toBe("steps");
      await env.ledger.pause(session, current, "steps", 12, null, undefined,
        { role: "manager", providerKind: "text", taskId: null });
    });
    const secondPause = await env.run(), secondCampaign = await env.campaign();
    expect(secondPause.pendingApproval).toMatchObject({ reason: "steps", requiredTotal: 2,
      nextAction: { role: "manager", providerKind: "text", taskId: null } });
    const second = { runId: id(10), approvalId: id(31), reference: "fund-exact-next-action",
      expectedRunRevision: secondPause.revision, expectedCampaignRevision: secondCampaign.revision,
      expectedPendingDigest: secondPause.pendingApproval!.requestDigest, nowMs: 13 };
    await expect(env.repository.approveExecutionAllowance({ ...second,
      totals: { ...secondCampaign.allowance, steps: 2 } })).rejects.toMatchObject({ code: "conflict" });
    expect(await env.campaign()).toEqual(secondCampaign);
    await env.repository.approveExecutionAllowance({ ...second,
      totals: { ...secondCampaign.allowance, steps: 2, textCalls: 2 } });
    expect(await env.run()).toMatchObject({ status: "queued", pendingApproval: null });
    expect(await env.campaign()).toMatchObject({ textRequests: 1, allowance: { steps: 2, textCalls: 2 },
      settledMicrodollars: campaign.settledMicrodollars,
      reservedMicrodollars: campaign.reservedMicrodollars });
  });

  it("pauses before dispatch and approval preserves counters, liabilities and the cancelled attempt", async () => {
    const env = await setup();
    const { paused, currentCampaign, input } = await env.pause();
    const operation = await env.repository.getOperation(id(12));
    expect(paused).toMatchObject({ status: "paused", pauseRequested: true, activeOperationId: null,
      pendingApproval: { reason: "monetary", operationId: id(12) } });
    expect(operation).toMatchObject({ state: "failed", reservationCount: 0,
      workflowRunId: null, executionAllowanceCancellation: { kind: "undispatched_allowance_v1" } });
    expect(operation!.dispatchStartedAtMs ?? null).toBeNull();
    expect(operation!.m4Reservation).toBeUndefined();
    await expect(env.repository.resume({ runId: id(10), expectedRevision: paused.revision, nowMs: 5 }))
      .rejects.toThrow();
    const receipt = await env.repository.approveExecutionAllowance(input);
    expect(receipt).toMatchObject({ reused: false, runRevision: paused.revision + 1,
      approval: { previousTotals: env.totals, totals: input.totals, predecessorApprovalId: id(2),
        pendingRequestDigest: input.expectedPendingDigest } });
    const approved = await env.run();
    expect(approved.counters).toEqual(paused.counters);
    expect(approved.textRevisions).toBe(paused.textRevisions);
    expect(approved.noProgressCount).toBe(paused.noProgressCount);
    expect(approved).toMatchObject({ status: "queued", pauseRequested: false,
      activeOperationId: null, pendingApproval: null });
    expect(await env.campaign()).toMatchObject({ textRequests: currentCampaign.textRequests,
      settledMicrodollars: currentCampaign.settledMicrodollars, reservedMicrodollars: currentCampaign.reservedMicrodollars });
    expect(await env.repository.getOperation(id(12))).toEqual(operation);
    expect(await env.db.collections.experiment_operations.countDocuments()).toBe(1);
  });

  it("rejects stale revisions, changed requests and reductions without partial approval writes", async () => {
    const env = await setup();
    const { input } = await env.pause();
    const before = { run: await env.run(), campaign: await env.campaign() };
    for (const change of [{ expectedRunRevision: input.expectedRunRevision - 1 },
      { expectedCampaignRevision: input.expectedCampaignRevision - 1 }]) {
      await expect(env.repository.approveExecutionAllowance({ ...input, ...change })).rejects.toMatchObject({ code: "stale_revision" });
    }
    for (const change of [{ expectedPendingDigest: "e".repeat(64) },
      { totals: { ...input.totals, maxMicrodollars: env.totals.maxMicrodollars } },
      { totals: { ...input.totals, textCalls: env.totals.textCalls - 1 } }]) {
      await expect(env.repository.approveExecutionAllowance({ ...input, ...change })).rejects.toMatchObject({ code: "conflict" });
    }
    expect(await env.run()).toEqual(before.run);
    expect(await env.campaign()).toEqual(before.campaign);
  });

  it("serializes duplicate approvals and returns the original receipt after later run revisions", async () => {
    const env = await setup();
    const { input } = await env.pause();
    const receipts = await Promise.all([env.repository.approveExecutionAllowance(input), env.repository.approveExecutionAllowance(input)]);
    expect(receipts.map(item => item.reused).sort()).toEqual([false, true]);
    expect(receipts[0].approval).toEqual(receipts[1].approval);
    expect(receipts[0].runRevision).toBe(receipts[1].runRevision);
    await expect(env.repository.approveExecutionAllowance({ ...input, reference: "changed-reference" }))
      .rejects.toMatchObject({ code: "conflict" });
    const queued = await env.run();
    const manuallyPaused = await env.repository.pause({ runId: id(10), expectedRevision: queued.revision, nowMs: 6 });
    await env.repository.resume({ runId: id(10), expectedRevision: manuallyPaused.revision, nowMs: 7 });
    const beforeRetry = { run: await env.run(), campaign: await env.campaign() };
    const duplicate = await env.repository.approveExecutionAllowance({ ...input, nowMs: 8 });
    expect(duplicate).toEqual({ ...receipts[0], reused: true });
    expect(await env.run()).toEqual(beforeRetry.run);
    expect(await env.campaign()).toEqual(beforeRetry.campaign);
    expect(beforeRetry.campaign.approvals).toHaveLength(2);
  });

  it("retains a declined request in append-only history after a later approval", async () => {
    const env = await setup();
    const { input } = await env.pause();
    const decline = { runId: input.runId, declineId: id(30), reference: "operator-declined-first",
      expectedRunRevision: input.expectedRunRevision, expectedCampaignRevision: input.expectedCampaignRevision,
      expectedPendingDigest: input.expectedPendingDigest, nowMs: 5 };
    const first = await withMongoTransaction(env.db, session => env.ledger.decline(session, decline));
    expect((await env.run()).status).toBe("paused");
    const saved = await env.campaign();
    expect(saved.declines).toMatchObject([{ declineId: id(30), pendingRequestDigest: input.expectedPendingDigest,
      previousTotals: env.totals, totals: env.totals, channel: "operator_http" }]);
    const pending = await env.run();
    await env.repository.approveExecutionAllowance({ ...input, expectedRunRevision: pending.revision,
      expectedCampaignRevision: saved.revision, nowMs: 6 });
    expect((await env.campaign()).declines).toEqual(saved.declines);
    expect(await withMongoTransaction(env.db, session => env.ledger.decline(session, { ...decline, nowMs: 7 })))
      .toEqual({ ...first, reused: true });
  });
});
