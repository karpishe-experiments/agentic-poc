import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import type { ExperimentOperationDocument } from "@/db/documents";
import { createExperimentRepository } from "@/db/experiment-repository";
import { specialistTaskSchema } from "@/lib/contracts/experiment-runner";
import { configurationSnapshot, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";
import { m4RequestBundleHash } from "@/lib/experiment-runner/m4-request";
import type { WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
const identity = { runId: id(10), operationId: id(12), workflowRunId: id(13), parentWorkflowRunId: id(14) };

async function setup(state: "started" | "prepared" | "succeeded" = "started") {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const authority = { policy: { ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash() },
    grant: { campaignId: id(1), reference: "offline-image-failure-fixture" } };
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "http://localhost:3000", callbackKey: "x".repeat(32),
    m4: { state: "granted", authority }, bindings: authority.policy.publications.map((binding) => ({ ...binding,
      taskId: specialistTaskSchema.nullable().parse(binding.taskId), apiKey: "fake-image-key" })) };
  const repository = createExperimentRepository(database, { m4Authority: authority, m4ExecutionEnabled: true });
  const now = Date.now();
  await repository.createRun({ runId: identity.runId, bookletId: id(11), persona: "playful_kid", mode: "balanced", campaignId: id(1),
    configuration: configurationSnapshot(config, "playful_kid"), nowMs: now });
  const imageBinding = config.bindings.find((binding) => binding.role === "image")!;
  // Isolated persisted-state fixture for failure transitions only. These methods
  // consume no source/image bytes; the complete offline Kid test proves admission.
  // No text operation is relabeled and no monetary reservation is invented.
  const operation: ExperimentOperationDocument = {
    _id: identity.operationId, runId: identity.runId, role: "image", taskId: "J08", subjectKind: "book", subjectId: id(11),
    idempotencyKey: "a".repeat(64), inputFingerprint: "b".repeat(64), attempt: 1, mode: "balanced", providerKind: "image", state,
    workflowRunId: identity.workflowRunId, parentWorkflowRunId: identity.parentWorkflowRunId, workflowTaskId: id(15),
    verifiedWorkflowId: imageBinding.publishedWorkflowId, dispatchStartedAtMs: now, deadlineAtMs: now + 300_000,
    reservationCount: state === "prepared" ? 0 : 1, resultJson: state === "succeeded" ? '{"assetId":"retained-fixture"}' : null,
    resultDigest: state === "succeeded" ? "c".repeat(64) : null, materializationJson: state === "succeeded" ? '{"retained":true}' : null,
    warningsJson: "[]", expectedTargetVersionId: null, dependencyVersionIds: [], safeFailure: null,
    authorizationClaim: null, imageCompletionClaim: null, resultFinalizationClaim: null, imageFailureHistory: [],
    lifecycle: { startedAtMs: now, lastProgressAtMs: now, ownerId: id(16), phase: state === "succeeded" ? "finished" : "running" },
    createdAtMs: now, updatedAtMs: now,
  };
  await database.collections.experiment_operations.insertOne(operation);
  await database.collections.experiment_runs.updateOne({ _id: identity.runId }, { $set: {
    status: state === "succeeded" ? "queued" : "running", activeOperationId: state === "succeeded" ? null : operation._id,
    counters: { logicalText: 0, payableText: 0, logicalImage: operation.reservationCount, payableImage: 0, steps: operation.reservationCount },
  } });
  const runtime: WorkflowRuntime = { start: vi.fn(async () => { throw new Error("No workflow POST allowed"); }),
    retrieve: vi.fn(async () => ({ kind: "unknown" as const })), stop: vi.fn(async () => ({ kind: "acknowledged" as const })) };
  const http = createBookletRunnerHttp({ database: () => database, config: () => ({ enabled: true, config }), runtime: () => runtime, mutate: (action) => action() });
  const dispatcher = createExperimentDispatcher({ database, config, runtime, mutate: async (action) => action() });
  const records = async () => ({ run: await repository.getRun(identity.runId), operation: await repository.getOperation(identity.operationId),
    campaign: await database.collections.experiment_campaigns.findOne({ _id: id(1) }) });
  return { database, repository, http, dispatcher, runtime, imageBinding, now, records };
}

describe("Balanced simulated-image failure campaign boundary", () => {
  it.each(["definite_failure", "unknown_outcome"] as const)("stops the campaign on HTTP %s and preserves the claimed attempt on replay", async (category) => {
    const env = await setup(); const before = await env.records();
    const request = (workflowRunId = identity.workflowRunId) => new Request("http://localhost:3000/api/experiments/booklet-tools/failure", {
      method: "POST", headers: { "x-booklet-tool-key": "x".repeat(32) }, body: JSON.stringify({ ...identity, workflowRunId, category }),
    });
    expect((await env.http.tool(request(id(999)), "failure")).status).toBe(409);
    expect(await env.records()).toEqual(before);
    const response = await env.http.tool(request(), "failure");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { state: category === "definite_failure" ? "failed" : "unknown" } });
    const after = await env.records();
    expect(after.campaign).toMatchObject({ state: "stopped", requests: 0, reservedMicrodollars: 0, settledMicrodollars: 0 });
    expect(after.run).toMatchObject({ status: "blocked", safeFailure: category,
      activeOperationId: category === "definite_failure" ? null : identity.operationId, counters: before.run!.counters });
    expect(after.operation).toMatchObject({ reservationCount: 1, resultJson: null, resultDigest: null, materializationJson: null,
      workflowRunId: identity.workflowRunId, parentWorkflowRunId: identity.parentWorkflowRunId, verifiedWorkflowId: env.imageBinding.publishedWorkflowId });
    expect(after.operation!.m4Reservation).toBeUndefined();
    expect(after.operation!.imageFailureHistory).toHaveLength(1);
    expect(after.operation!.imageFailureHistory![0].category).toBe(category);
    expect((await env.http.tool(request(), "failure")).status).toBe(200);
    expect(await env.records()).toEqual(after);
    await env.dispatcher.advance(identity.runId);
    expect(env.runtime.start).not.toHaveBeenCalled();
    expect(await env.database.collections.experiment_operations.countDocuments({ runId: identity.runId })).toBe(1);
    expect((await env.records()).campaign).toEqual(after.campaign);
  });

  it("stops on a completed image's conflicting terminal status without changing its result or asset", async () => {
    const env = await setup("succeeded");
    await env.database.collections.assets.insertOne({ _id: identity.operationId, bookletId: id(11), kind: "image", uri: "offline/retained.png",
      mimeType: "image/png", width: 8, height: 8, sourceAssetId: null, metadataJson: '{"fixture":"retained"}', createdAtMs: env.now });
    const before = await env.records();
    const asset = await env.database.collections.assets.findOne({ _id: identity.operationId });
    await env.repository.recordTerminalConflict({ ...identity, workflowId: env.imageBinding.publishedWorkflowId, status: "failed", nowMs: env.now + 1 });
    const after = await env.records();
    expect(after.campaign).toMatchObject({ state: "stopped", requests: 0, reservedMicrodollars: 0 });
    expect(after.run).toMatchObject({ status: "blocked", safeFailure: "definite_failure", counters: before.run!.counters });
    expect(after.operation).toEqual(before.operation);
    expect(await env.database.collections.assets.findOne({ _id: identity.operationId })).toEqual(asset);
    await env.repository.recordTerminalConflict({ ...identity, workflowId: env.imageBinding.publishedWorkflowId, status: "failed", nowMs: env.now + 2 });
    expect(await env.records()).toEqual(after);
    await env.dispatcher.advance(identity.runId);
    expect(env.runtime.start).not.toHaveBeenCalled();
  });

  it("stops at the logical image allowance without reserving or claiming another image", async () => {
    const env = await setup("prepared");
    const run = (await env.repository.getRun(identity.runId))!;
    // The allowance boundary is reached before any source consumption. Earlier
    // image history is outside this isolated counter-boundary fixture.
    await env.database.collections.experiment_runs.updateOne({ _id: identity.runId }, { $set: {
      "counters.logicalImage": run.limits.image, "counters.steps": run.limits.image,
    } });
    const before = await env.records();
    expect(await env.repository.claimOperation({ ...identity, nowMs: env.now + 1 })).toMatchObject({ started: false, reason: "limit_exhausted" });
    const after = await env.records();
    expect(after.campaign).toMatchObject({ state: "stopped", requests: 0, reservedMicrodollars: 0, settledMicrodollars: 0 });
    expect(after.run).toMatchObject({ status: "blocked", safeFailure: "limit_exhausted", counters: before.run!.counters });
    expect(after.operation).toEqual(before.operation);
    expect(after.operation).toMatchObject({ state: "prepared", reservationCount: 0 });
    await env.dispatcher.advance(identity.runId);
    expect(env.runtime.start).not.toHaveBeenCalled();
  });

  it.each(["expired", "stop"] as const)("stops the campaign for %s preparation while retaining its lease and zero requests", async (action) => {
    const env = await setup("prepared");
    // Represent a preparation-only saved state, with no operation/provider work.
    await env.database.collections.experiment_operations.deleteOne({ _id: identity.operationId });
    const preparation = { ownerId: id(60), startedAtMs: env.now - 300_001,
      deadlineAtMs: action === "expired" ? env.now - 1 : env.now + 300_000 };
    await env.database.collections.experiment_runs.updateOne({ _id: identity.runId }, { $set: {
      activeOperationId: null, preparation,
    } });
    const before = await env.records();
    if (action === "expired") expect(await env.dispatcher.advance(identity.runId)).toBe("blocked");
    else await env.dispatcher.inspectPreparation({ runId: identity.runId, preparationId: preparation.ownerId,
      expectedRevision: before.run!.revision, stop: true });
    const after = await env.records();
    expect(after.run).toMatchObject({ status: "blocked", safeFailure: "unknown_outcome", activeOperationId: null,
      counters: before.run!.counters, preparation: { ...preparation, outcome: "failed", unresolved: true } });
    if (action === "stop") expect(after.run!.preparation!.stopRequestedAtMs).toBeTypeOf("number");
    expect(after.campaign).toMatchObject({ state: "stopped", requests: 0, reservedMicrodollars: 0, settledMicrodollars: 0 });
    expect(await env.database.collections.experiment_operations.countDocuments({ runId: identity.runId })).toBe(0);
    expect(env.runtime.start).not.toHaveBeenCalled();
    expect(env.runtime.retrieve).not.toHaveBeenCalled();
    expect(env.runtime.stop).not.toHaveBeenCalled();
  });
});
