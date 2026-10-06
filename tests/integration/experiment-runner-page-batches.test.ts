import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExperimentPageBatchRepository } from "@/db/experiment-page-batches";
import { createRepositories } from "@/db/repositories";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import type { AssetStore } from "@/lib/assets/asset-store";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const { verifySources, verifyVersion } = vi.hoisted(() => ({ verifySources: vi.fn(), verifyVersion: vi.fn() }));
vi.mock("@/db/experiment-pages", () => ({ verifyCurrentPageIllustrationSources: verifySources }));
vi.mock("@/db/experiment-page-illustrations", () => ({ createExperimentPageIllustrationAssembly: () => ({ verifyVersion }) }));
const databases: Database[] = [];
afterEach(async () => { verifySources.mockReset(); verifyVersion.mockReset(); await Promise.all(databases.splice(0).map(closeTestDatabase)); });
async function setup() {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const configuration = [{ role: "manager", taskId: null },
    ...Array.from({ length: 12 }, (_, index) => ({ role: "specialist", taskId: `J${String(index + 1).padStart(2, "0")}` })),
    { role: "tester", taskId: null }, { role: "image", taskId: null, finalPageIllustration: true }]
    .map((binding, index) => ({ ...binding, appId: id(100 + index), publishedWorkflowId: id(200 + index), toolProviderId: null }));
  await createExperimentRepository(database).createRun({ runId: id(1), bookletId: id(2), persona: "playful_kid", mode: "simulated", configuration, nowMs: 1 });
  const run = (await database.collections.experiment_runs.findOne({ _id: id(1) }))!;
  const batch = { schemaVersion: "2", runId: run._id, configurationHash: run.configurationHash, layoutVersionId: id(3), selection: "selected_batch",
    pages: [{ pageId: id(4), pageBibleVersionId: id(5), previousPageVersionId: null }, { pageId: id(6), pageBibleVersionId: id(7), previousPageVersionId: null }] };
  verifySources.mockImplementation(async (_database, _session, _run, pageId) => {
    const pageBibleVersionId = pageId === id(4) ? id(5) : id(7);
    return { layoutVersionId: id(3), pageBibleVersionId, request: { request: { kind: "page_source", prompt: "Exact lettering",
      sourceVersionIds: [pageBibleVersionId, id(3), id(10)], styleVersionId: id(10) } } };
  });
  return { database, run, batch, repository: () => createExperimentPageBatchRepository({ database, store: {} as AssetStore, now: () => 2 }) };
}

async function prepareFirst(env: Awaited<ReturnType<typeof setup>>) {
  await env.repository().select({ jobId: id(8), expectedRevision: 0, batch: env.batch });
  const request = { kind: "page_source" as const, prompt: "Exact lettering", sourceVersionIds: [id(5), id(3), id(10)], styleVersionId: id(10) };
  await env.database.collections.experiment_operations.insertOne({ _id: id(11), runId: id(1), role: "image", taskId: "J13", subjectKind: "page",
    subjectId: id(4), idempotencyKey: "batch-op", inputFingerprint: imageRequestFingerprint(request), imageRequestJson: JSON.stringify(request),
    attempt: 1, mode: "simulated", providerKind: "image", state: "prepared", workflowRunId: null, parentWorkflowRunId: id(12),
    reservationCount: 0, deadlineAtMs: null, resultJson: null, resultDigest: null, warningsJson: "[]", expectedTargetVersionId: null,
    dependencyVersionIds: request.sourceVersionIds, materializationJson: null, safeFailure: null, createdAtMs: 1, updatedAtMs: 1 });
  await env.database.collections.experiment_runs.updateOne({ _id: id(1) }, { $set: { activeOperationId: id(11) }, $inc: { revision: 1 } });
  return { identity: { runId: id(1), jobId: id(8) }, binding: { runId: id(1), jobId: id(8), operationId: id(11), expectedRevision: 2 }, request };
}
describe("saved Dify page batch selection", () => {
  it("does not load a retained active batch from another run of the same booklet", async () => {
    const env = await setup();
    await env.repository().select({ jobId: id(8), expectedRevision: 0, batch: env.batch });
    const job = (await env.database.collections.generation_jobs.findOne({ _id: id(8) }))!;
    const otherBatch = { ...env.batch, runId: id(30) };
    await env.database.collections.generation_jobs.insertOne({ ...job, _id: id(31), idempotencyKey: "other-run",
      inputJson: JSON.stringify(otherBatch) });
    expect((await env.repository().listActive(env.run._id)).map((item) => item.jobId)).toEqual([id(8)]);
    expect((await env.database.collections.generation_jobs.findOne({ _id: id(31) }))!).toEqual({ ...job, _id: id(31),
      idempotencyKey: "other-run", inputJson: JSON.stringify(otherBatch) });
  });

  it("retains clarification history and requires its published, materialized answer before rebinding", async () => {
    const env = await setup(); const { identity, binding } = await prepareFirst(env);
    await env.repository().bind(binding);
    const original = (await env.database.collections.experiment_operations.findOne({ _id: id(11) }))!;
    await env.database.collections.experiment_operations.updateOne({ _id: id(11) }, { $set: { state: "succeeded", workflowRunId: id(18),
      verifiedWorkflowId: id(214), reservationCount: 1, resultJson: JSON.stringify({ kind: "clarification", payload: { question: "Which expression?" } }) } });
    await env.database.collections.experiment_operations.insertOne({ ...original, _id: id(19), idempotencyKey: "successor", parentWorkflowRunId: id(20) });
    await env.database.collections.experiment_runs.updateOne({ _id: id(1) }, { $set: { activeOperationId: id(19) }, $inc: { revision: 1 } });
    const successor = { ...binding, operationId: id(19), expectedRevision: 4 };
    await expect(env.repository().bind(successor)).rejects.toMatchObject({ code: "invalid_state" });
    await env.database.collections.experiment_operations.insertOne({ ...original, _id: id(21), idempotencyKey: "answer", role: "tester", taskId: null,
      subjectKind: "book", subjectId: id(2), providerKind: "text", state: "succeeded", reservationCount: 1, workflowRunId: id(22), verifiedWorkflowId: id(213),
      resultJson: JSON.stringify({ kind: "decision", payload: { decision: { action: "answer", questionId: id(11), text: "Pleased" } } }),
      materializationJson: JSON.stringify({ answeredQuestionId: id(11) }) });
    expect(await env.repository().bind(successor)).toMatchObject({ reused: false });
    const item = (await env.database.collections.generation_items.find({ jobId: id(8) }).sort({ position: 1 }).toArray())[0];
    expect(JSON.parse(item.resultJson!)).toMatchObject({ operationId: id(19), clarificationOperationIds: [id(11)] });
    expect(item.attemptCount).toBe(2);
    expect(await env.repository().reconcile(identity)).toMatchObject({ kind: "waiting", operationId: id(19) });
    expect((await env.database.collections.experiment_operations.findOne({ _id: id(11) }))!.state).toBe("succeeded");
  });

  it("binds only the first owning prepared page and retains unknown work without replay", async () => {
    const env = await setup(); const { identity, binding } = await prepareFirst(env);
    await env.database.collections.experiment_operations.updateOne({ _id: id(11) }, { $set: { subjectId: id(6) } });
    await expect(env.repository().bind(binding)).rejects.toMatchObject({ code: "invalid_state" });
    await env.database.collections.experiment_operations.updateOne({ _id: id(11) }, { $set: { subjectId: id(4) } });
    expect(await env.repository().bind(binding)).toMatchObject({ reused: false });
    expect(await env.repository().bind(binding)).toMatchObject({ reused: true });
    expect(await env.repository().reconcile(identity)).toMatchObject({ kind: "waiting", operationId: id(11) });
    await env.database.collections.experiment_operations.updateOne({ _id: id(11) }, { $set: { state: "unknown", safeFailure: "unknown_outcome" } });
    expect(await env.repository().reconcile(identity)).toMatchObject({ kind: "blocked", operationId: id(11) });
    const revision = (await env.database.collections.experiment_runs.findOne({ _id: id(1) }))!.revision;
    expect(await env.repository().reconcile(identity)).toMatchObject({ kind: "blocked" });
    expect((await env.database.collections.experiment_runs.findOne({ _id: id(1) }))!.revision).toBe(revision);
    const items = (await env.repository().get(identity)).items;
    expect(items.map((item) => item.status)).toEqual(["unknown", "pending"]);
    expect(await env.database.collections.experiment_operations.countDocuments({})).toBe(1);
  });

  it("saves only verified materialized results and retains the page when Pause stops the next item", async () => {
    const env = await setup(); const { identity, binding, request } = await prepareFirst(env);
    await env.repository().bind(binding);
    await env.database.collections.experiment_operations.updateOne({ _id: id(11) }, { $set: { state: "succeeded", imageCompletionDigest: "b".repeat(64),
      workflowRunId: id(13), verifiedWorkflowId: id(214), reservationCount: 1 } });
    await env.database.collections.experiment_runs.updateOne({ _id: id(1) }, { $set: { activeOperationId: null, pauseRequested: true, status: "paused" } });
    await expect(env.repository().reconcile(identity)).rejects.toMatchObject({ code: "invalid_state" });
    const content = { schemaVersion: "2", runId: id(1), pageId: id(4), pageIndex: 1, pageBibleVersionId: id(5), assetId: id(11),
      output: { mimeType: "image/png", sha256: "b".repeat(64), byteLength: 95, width: 3, height: 2 }, request, sourceVersionIds: request.sourceVersionIds,
      operationId: id(11), workflowRunId: id(13), publishedWorkflowId: id(214), parentWorkflowRunId: id(12), inputFingerprint: imageRequestFingerprint(request),
      candidateLineage: { previousPageVersionId: null }, attachments: [], warnings: [] };
    await env.database.collections.artifacts.insertOne({ _id: id(14), bookletId: id(2), artifactType: "J13", taskId: "J13", experimentRunId: id(1),
      subjectKind: "page", subjectId: id(4), state: "draft", currentVersionId: id(15), createdAtMs: 1, updatedAtMs: 1 });
    await env.database.collections.artifact_versions.insertOne({ _id: id(15), artifactId: id(14), versionNumber: 1, schemaVersion: "2",
      contentJson: JSON.stringify(content), dependencyVersionIdsJson: JSON.stringify(request.sourceVersionIds), createdBy: "application", sourceVersionId: null,
      sourceExecutionBatchId: null, sourceOperationId: id(11), warningsJson: "[]", createdAtMs: 1 });
    verifyVersion.mockRejectedValueOnce(new Error("corrupt bytes"));
    await expect(env.repository().reconcile(identity)).rejects.toThrow("corrupt bytes");
    expect((await env.repository().get(identity)).items[0].status).toBe("running");
    expect(await env.repository().reconcile(identity)).toEqual({ kind: "paused" });
    expect(verifyVersion).toHaveBeenCalledWith({ runId: id(1), versionId: id(15) }, expect.anything());
    expect((await env.repository().get(identity)).items[0]).toMatchObject({ status: "succeeded", operationId: id(11), assetId: id(11), pageVersionId: id(15) });
    await env.database.collections.experiment_runs.updateOne({ _id: id(1) }, { $set: { pauseRequested: false, status: "queued" } });
    expect((await env.repository().get(identity)).next).toMatchObject({ kind: "ready", pageId: id(6) });
    expect(await env.database.collections.approvals.countDocuments({})).toBe(0);
  });

  it("admits one winner for concurrent duplicate selections", async () => {
    const env = await setup();
    const results = await Promise.all([id(8), id(9)].map((jobId) => env.repository().select({ jobId, expectedRevision: 0, batch: env.batch })));
    expect(results[0].jobId).toBe(results[1].jobId);
    expect(results.filter((result) => !result.reused)).toHaveLength(1);
    expect(await env.database.collections.generation_jobs.countDocuments({})).toBe(1);
    expect(await env.database.collections.generation_items.countDocuments({})).toBe(2);
    expect((await env.database.collections.experiment_runs.findOne({ _id: id(1) }))!.revision).toBe(1);
  });

  it("retains order and reuses duplicate selection without reserving or dispatching", async () => {
    const env = await setup();
    const input = { jobId: id(8), expectedRevision: 0, batch: env.batch };
    expect(await env.repository().select(input)).toEqual({ jobId: id(8), reused: false });
    expect(await env.repository().select({ ...input, jobId: id(9) })).toEqual({ jobId: id(8), reused: true });
    const items = await env.database.collections.generation_items.find({ jobId: id(8) }).sort({ position: 1 }).toArray();
    expect(items.map((item) => [item.itemKey, item.position, item.status, item.attemptCount])).toEqual([[id(4), 0, "pending", 0], [id(6), 1, "pending", 0]]);
    const run = (await env.database.collections.experiment_runs.findOne({ _id: id(1) }))!;
    expect(run.revision).toBe(1); expect(run.counters).toEqual(env.run.counters); expect(run.activeOperationId).toBeNull();
    expect(await env.database.collections.experiment_operations.countDocuments({})).toBe(0);
    expect(await createRepositories(env.database).jobs.listRunnable()).toEqual([]);
    expect(await env.database.collections.approvals.countDocuments({})).toBe(0);
  });
  it("rejects paused work and stale revisions without creating jobs", async () => {
    const env = await setup();
    const input = { jobId: id(8), expectedRevision: 1, batch: env.batch };
    await expect(env.repository().select(input)).rejects.toMatchObject({ code: "stale_revision" });
    await env.database.collections.experiment_runs.updateOne({ _id: id(1) }, { $set: { pauseRequested: true, status: "paused" } });
    await expect(env.repository().select({ ...input, expectedRevision: 0 })).rejects.toMatchObject({ code: "invalid_state" });
    expect(await env.database.collections.generation_jobs.countDocuments({})).toBe(0);
  });
  it("rolls back when a selected source is stale and prevents overlapping selections", async () => {
    const env = await setup(); const input = { jobId: id(8), expectedRevision: 0, batch: env.batch };
    verifySources.mockResolvedValueOnce({ layoutVersionId: id(30), pageBibleVersionId: id(5) });
    await expect(env.repository().select(input)).rejects.toMatchObject({ code: "conflict" });
    expect((await env.database.collections.experiment_runs.findOne({ _id: id(1) }))!.revision).toBe(0);
    expect(await env.database.collections.generation_items.countDocuments({})).toBe(0);
    await env.repository().select(input);
    await expect(env.repository().select({ ...input, jobId: id(9), expectedRevision: 1,
      batch: { ...env.batch, pages: [...env.batch.pages].reverse() } })).rejects.toMatchObject({ code: "conflict" });
    expect(await env.database.collections.generation_jobs.countDocuments({})).toBe(1);
  });
});
