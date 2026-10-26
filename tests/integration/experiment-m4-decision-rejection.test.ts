import { afterEach, describe, expect, it, vi } from "vitest";
import { withMongoTransaction, type Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createM4ProviderResults } from "@/db/experiment-provider-results";
import { createExperimentCampaignLedger } from "@/db/experiment-campaign";
import { verifyM4Accounting } from "@/db/experiment-m4-accounting";
import { m4OperationFingerprint, m4SourceFingerprint } from "@/db/experiment-text-sources";
import { closeM4DecisionRejection, m4DecisionRejectionFacts, verifyM4DecisionRejection } from "@/db/experiment-decision-rejection";
import { specialistTaskSchema, type RoleResult } from "@/lib/contracts/experiment-runner";
import { m4RequestBundleHash, prepareM4Request } from "@/lib/experiment-runner/m4-request";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import type { WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

// The saved request deliberately has the historical tester context: it predates
// the eligibility marker that prevents new exhausted revision requests. Claims,
// original GET authentication and settlement still use the real implementation.
// This fixture proves semantic rejection, not validity of a complete J13 graph.
async function setup(imageCount = 2) {
  const db = await createTestDatabase({ seedAgents: false }); databases.push(db);
  const policy = { ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash() };
  const authority = { policy, grant: { campaignId: id(1), reference: "decision-rejection-fixture",
    continuations: [{ runId: id(10), operationId: id(12), decisionRejection: "revision_allowance_exhausted_v1" as const,
      reference: "exact historical reviewer rejection" }] } };
  const repository = createExperimentRepository(db, { m4Authority: authority, m4ExecutionEnabled: true });
  for (const [index, persona] of (["playful_kid", "enthusiast_parent", "professional_creator"] as const).entries()) {
    const runId = index === 2 ? id(10) : id(30 + index), bookletId = index === 2 ? id(11) : id(40 + index);
    await repository.createRun({ runId, bookletId, persona, mode: "balanced", campaignId: id(1), nowMs: 1,
      configuration: policy.publications.filter(p => p.persona === null || p.persona === persona)
        .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({
          role, taskId, appId, publishedWorkflowId, toolProviderId, ...(finalPageIllustration ? { finalPageIllustration } : {}),
        })) });
    if (index < 2) await db.collections.experiment_runs.updateOne({ _id: runId }, { $set: {
      status: "completed", evaluationStatus: "complete", generationCompletedAtMs: 1,
    } });
  }
  await db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { imageRevisions: imageCount } });
  await db.collections.artifacts.insertOne({ _id: id(20), experimentRunId: id(10), bookletId: id(11),
    taskId: "J13", subjectKind: "page", subjectId: id(21), artifactType: "final_page_illustration",
    state: "draft", currentVersionId: id(22), createdAtMs: 1, updatedAtMs: 1 });
  await db.collections.artifact_versions.insertOne({ _id: id(22), artifactId: id(20), versionNumber: 1,
    schemaVersion: "2", contentJson: "{}", dependencyVersionIdsJson: "[]", createdBy: "application",
    sourceVersionId: null, sourceExecutionBatchId: null, createdAtMs: 1 });
  const run = (await repository.getRun(id(10)))!;
  const operation = await repository.prepareOperation({ runId: id(10), operationId: id(12), expectedRevision: run.revision,
    role: "tester", taskId: null, subjectKind: "book", subjectId: id(11), inputFingerprint: "b".repeat(64),
    attempt: 1, providerKind: "text", nowMs: 2 });
  const binding = policy.publications.find(p => p.role === "tester" && p.persona === "professional_creator")!;
  const contextJson = JSON.stringify({ role: "tester", bookletId: id(11), pendingDecision: null,
    revisionCounts: { text: 0, image: imageCount }, eligibleTaskIds: ["J13"],
    currentArtifacts: [{ taskId: "J13", currentVersionId: id(22), subjectKind: "page", subjectId: id(21), state: "draft" }] });
  const request = prepareM4Request(policy, { role: "tester", taskId: null, persona: "professional_creator", report: false },
    contextJson, { taskId: ["J13"], taskIds: ["J13"], action: ["revise"], subjectId: [id(11)], subjectKind: ["book"],
      artifactVersionId: [id(22)], versionIds: [id(22)], questionId: [], delegationId: [],
      revisionTargetTaskIds: ["J13"], "revisionVersionIds:J13": [id(22)] });
  const sourceFingerprint = await withMongoTransaction(db, session => m4SourceFingerprint(db, session, run));
  await db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { m4Preparation: {
    policyHash: run.m4!.policyHash, configurationHash: run.configurationHash,
    definitionHash: request.definitionHash, requestDigest: request.requestDigest, requestJson: request.requestJson,
    contextJson, systemPrompt: request.systemPrompt, modelParametersJson: JSON.stringify(request.modelParameters),
    sourceFingerprint, operationFingerprint: m4OperationFingerprint(operation), publishedWorkflowId: binding.publishedWorkflowId,
    parentWorkflowRunId: null, preparedAtMs: 3,
  } } });
  await repository.beginDispatch({ runId: id(10), operationId: id(12), parentWorkflowRunId: null, nowMs: 4 });
  const identity = { runId: id(10), operationId: id(12), workflowRunId: id(13), parentWorkflowRunId: null, nowMs: 5 };
  await repository.recordDispatchIdentity(identity);
  await repository.verifyDispatchPublication({ ...identity, workflowId: binding.publishedWorkflowId });
  await repository.claimOperation({ ...identity, nowMs: 6 });
  const result: RoleResult = { kind: "decision", payload: { decision: { action: "revise", taskId: "J13",
    artifactVersionId: id(22), instruction: "Render at the working canvas size." } } };
  const wrapper = { schemaVersion: "booklet_provider_v1", content: JSON.stringify({ result }), providerEvidence: {
    provider: "openai", apiBaseUrl: "https://api.openai.com/v1",
    stdioSdk: { version: "0.10.2", readerSha256: "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22" },
    responseId: "resp_fake", requestId: "req_fake", model: "gpt-6-luna", serviceTier: "default", status: "completed",
    refused: false, incompleteReason: null, requestDigest: request.requestDigest, countedInputTokens: 100,
    usage: { source: "provider_reported", inputTokens: 100, outputTokens: 100, cachedInputTokens: 0,
      cacheWriteInputTokens: null, reasoningOutputTokens: 0 },
  } };
  const runtime: WorkflowRuntime = { start: vi.fn(async () => { throw new Error("Provider POST forbidden"); }),
    retrieve: vi.fn(async () => ({ kind: "execution" as const, execution: { id: id(13), workflow_id: binding.publishedWorkflowId,
      status: "succeeded" as const, outputs: { booklet_provider_result: JSON.stringify(wrapper) } } })) };
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid", callbackKey: "fixture",
    bindings: policy.publications.map(p => ({ ...p, taskId: specialistTaskSchema.nullable().parse(p.taskId), apiKey: "fake-key" })) };
  expect(await createM4ProviderResults(db, authority, config, runtime).observe({ runId: id(10), operationId: id(12), nowMs: 7 }))
    .toMatchObject({ kind: "result", result });
  const completion = { envelope: { runId: id(10), operationId: id(12), workflowRunId: id(13), inputFingerprint: "b".repeat(64), result },
    parentWorkflowRunId: null, nowMs: 8 };
  if (imageCount === 2) await expect(repository.completeOperation(completion)).rejects.toMatchObject({ code: "invalid_result" });
  await repository.blockCompletionFailure(completion);
  const snapshot = async () => ({ run: (await repository.getRun(id(10)))!, op: (await repository.getOperation(id(12)))!,
    campaign: await db.collections.experiment_campaigns.findOne({ _id: id(1) }) });
  const close = () => withMongoTransaction(db, async session => {
    const currentRun = (await db.collections.experiment_runs.findOne({ _id: id(10) }, { session }))!;
    const currentOp = (await db.collections.experiment_operations.findOne({ _id: id(12) }, { session }))!;
    return closeM4DecisionRejection(db, session, authority, currentRun, currentOp, 10);
  });
  return { db, repository, authority, runtime, snapshot, close };
}

describe("authenticated semantic decision rejection", () => {
  it("closes a valid-schema exhausted revision without changing original evidence or liabilities", async () => {
    const env = await setup(), before = await env.snapshot();
    expect(m4DecisionRejectionFacts(env.authority, before.run, before.op)).toMatchObject({
      kind: "revision_allowance_exhausted_v1", revisionCount: 2, revisionLimit: 2, taskId: "J13", artifactVersionId: id(22),
    });
    expect(await env.close()).toMatchObject({ status: "blocked", activeOperationId: null });
    const after = await env.snapshot();
    expect(after.op).toMatchObject({ state: "failed", safeFailure: "definite_failure", lifecycle: { phase: "finished", unresolved: false } });
    expect(after.op.m4Observation).toEqual(before.op.m4Observation);
    expect(after.op.m4Preparation).toEqual(before.op.m4Preparation);
    expect(after.op.m4Reservation).toEqual(before.op.m4Reservation);
    expect(after.campaign).toEqual(before.campaign);
    expect(after.run.counters).toEqual(before.run.counters);
    expect(await env.close()).toBeNull();
    expect(env.runtime.start).not.toHaveBeenCalled();
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(1);
  });

  it("does not classify an available revision as rejected", async () => {
    const env = await setup(1), before = await env.snapshot();
    expect(m4DecisionRejectionFacts(env.authority, before.run, before.op)).toBeNull();
    expect(await env.close()).toBeNull();
    expect(await env.snapshot()).toEqual(before);
  });

  it("requires explicit decision-rejection authority, not a generic continuation grant", async () => {
    const env = await setup(), before = await env.snapshot();
    const authority = { ...env.authority, grant: { ...env.authority.grant, continuations: [{ runId: id(10),
      operationId: id(12), reference: "generic continuation is insufficient" }] } };
    expect(await withMongoTransaction(env.db, session => closeM4DecisionRejection(env.db, session,
      authority, before.run, before.op, 10))).toBeNull();
    expect(await env.snapshot()).toEqual(before);
  });

  it.each(["role", "target", "digest", "publication", "count", "issue"] as const)("rejects changed %s proof", async field => {
    const env = await setup(), { run, op } = await env.snapshot();
    const changed = structuredClone(op);
    if (field === "role") changed.role = "manager";
    if (field === "target") changed.subjectId = id(99);
    if (field === "digest") changed.m4Preparation!.requestDigest = "f".repeat(64);
    if (field === "publication") changed.verifiedWorkflowId = id(99);
    if (field === "issue") changed.m4Observation!.issue = "creative_invalid";
    expect(m4DecisionRejectionFacts(env.authority, field === "count" ? { ...run, imageRevisions: 1 } : run, changed)).toBeNull();
  });

  it.each(["authorizationClaim", "resultFinalizationClaim", "imageCompletionClaim"] as const)("retains expired %s as unresolved", async key => {
    const env = await setup();
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { [key]: { ownerId: id(80), expiresAtMs: 1 } } });
    const before = await env.snapshot();
    expect(await env.close()).toBeNull();
    expect(await env.snapshot()).toEqual(before);
  });

  it.each(["message", "approval", "version", "asset", "delegation"] as const)("rejects global %s output under another owner", async kind => {
    const env = await setup();
    // Deliberately store foreign ownership: the rejection verifier must search globally.
    const collection = kind === "message" ? env.db.collections.messages : kind === "approval" ? env.db.collections.approvals :
      kind === "version" ? env.db.collections.artifact_versions : kind === "asset" ? env.db.collections.assets : env.db.collections.experiment_delegations;
    const row = { _id: kind === "asset" ? id(12) : id(90), bookletId: id(91), experimentRunId: id(92), runId: id(92),
      ...(kind === "message" ? { operationId: id(12) } : kind === "version" ? { sourceOperationId: id(12) } : { testerDecisionId: id(12) }) };
    await collection.insertOne(row as never);
    const before = await env.snapshot();
    expect(await env.close()).toBeNull();
    expect(await env.snapshot()).toEqual(before);
  });

  it("rolls closure back when its enclosing transaction fails", async () => {
    const env = await setup(), before = await env.snapshot();
    await expect(withMongoTransaction(env.db, async session => {
      expect(await closeM4DecisionRejection(env.db, session, env.authority, before.run, before.op, 10)).not.toBeNull();
      throw new Error("Reject later source/accounting verification");
    })).rejects.toThrow("Reject later");
    expect(await env.snapshot()).toEqual(before);
  });

  it("verifies retained rejection after generation and rejects forged provenance", async () => {
    const env = await setup(); await env.close();
    const { run, op } = await env.snapshot();
    const historical = { ...run, generationCompletedAtMs: 20, evaluationStatus: "complete" as const };
    expect(await withMongoTransaction(env.db, session => verifyM4DecisionRejection(env.db, session, env.authority, historical, op))).toBe(true);
    const forged = { ...op, m4DecisionRejection: { ...op.m4DecisionRejection!, revisionLimit: 3 } };
    expect(await withMongoTransaction(env.db, session => verifyM4DecisionRejection(env.db, session, env.authority, historical, forged))).toBe(false);
  });

  it("closes once under concurrency without a provider request", async () => {
    const env = await setup();
    const results = await Promise.all([env.close(), env.close()]);
    expect(results.filter(result => result !== null)).toHaveLength(1);
    expect((await env.snapshot()).op.m4DecisionRejection).toBeDefined();
    expect(env.runtime.start).not.toHaveBeenCalled();
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(1);
  });

  it("keeps continued semantic rejection attributable after later generation", async () => {
    const env = await setup(), before = await env.snapshot();
    await withMongoTransaction(env.db, async session => {
      const closed = await closeM4DecisionRejection(env.db, session, env.authority, before.run, before.op, 10);
      expect(closed).not.toBeNull();
      const failed = (await env.db.collections.experiment_operations.findOne({ _id: id(12) }, { session }))!;
      await createExperimentCampaignLedger(env.db, env.authority).continueFailure(session, closed!, failed, 11);
      const queued = (await env.db.collections.experiment_runs.findOneAndUpdate({ _id: id(10) },
        { $set: { status: "queued", safeFailure: null } }, { session, returnDocument: "after" }))!;
      await verifyM4Accounting(env.db, session, queued);
    });
    const after = await env.snapshot();
    expect(after.op.m4Observation).toEqual(before.op.m4Observation);
    expect(after.op.m4Reservation).toEqual(before.op.m4Reservation);
    await withMongoTransaction(env.db, async session => {
      const completed = (await env.db.collections.experiment_runs.findOneAndUpdate({ _id: id(10) },
        { $set: { generationCompletedAtMs: 20, evaluationStatus: "pending" } }, { session, returnDocument: "after" }))!;
      await verifyM4Accounting(env.db, session, completed);
    });
    expect(env.runtime.start).not.toHaveBeenCalled();
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(1);
  });
});
