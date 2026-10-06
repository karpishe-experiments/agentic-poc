import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExperimentReferenceUploads } from "@/db/experiment-reference-uploads";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import type { AssetStore } from "@/lib/assets/asset-store";
import type { BookletBinding } from "@/lib/experiment-runner/config";
import type { ReferenceUploadResult } from "@/lib/experiment-runner/reference-transport";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const { verifySources } = vi.hoisted(() => ({ verifySources: vi.fn() }));
vi.mock("@/db/experiment-pages", () => ({ verifyCurrentPageIllustrationSources: verifySources }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const databases: Database[] = [];
afterEach(async () => { verifySources.mockReset(); await Promise.all(databases.splice(0).map(closeTestDatabase)); });

async function setup(count = 2) {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const runId = id(1), bookletId = id(2), operationId = id(3), pageId = id(4), parentWorkflowRunId = id(5);
  const configuration = [{ role: "manager", taskId: null },
    ...Array.from({ length: 12 }, (_, index) => ({ role: "specialist", taskId: `J${String(index + 1).padStart(2, "0")}` })),
    { role: "tester", taskId: null }, { role: "image", taskId: null, finalPageIllustration: true }]
    .map((item, index) => ({ ...item, appId: id(100 + index), publishedWorkflowId: id(200 + index), toolProviderId: null }));
  await createExperimentRepository(database).createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration, nowMs: 1 });
  const request = { kind: "page_source" as const, prompt: "Approved native lettering", sourceVersionIds: [id(10), id(11)], styleVersionId: id(11) };
  const attachments = Array.from({ length: count }, (_, index) => ({ panelKey: "one", subjectKind: "character" as const,
    subjectId: id(20 + index), assetId: id(30 + index), artifactVersionId: id(40 + index), bytes: new Uint8Array([index + 1]),
    mimeType: "image/png" as const, byteLength: 1, sha256: String(index + 1).repeat(64), width: 2, height: 2 }));
  verifySources.mockResolvedValue({ request: { request }, attachments, warnings: [] });
  const base = { runId, attempt: 1, mode: "simulated" as const, parentWorkflowRunId: null, reservationCount: 0,
    deadlineAtMs: null, resultJson: null, resultDigest: null, warningsJson: "[]", expectedTargetVersionId: null,
    dependencyVersionIds: [], materializationJson: null, safeFailure: null, createdAtMs: 1, updatedAtMs: 1 };
  await database.collections.experiment_operations.insertMany([
    { ...base, _id: id(6), role: "manager", taskId: null, subjectKind: "book", subjectId: bookletId, providerKind: "text",
      state: "succeeded", workflowRunId: parentWorkflowRunId, verifiedWorkflowId: id(200), reservationCount: 1,
      idempotencyKey: "manager", inputFingerprint: "a".repeat(64),
      resultJson: JSON.stringify({ kind: "delegate", payload: { taskId: "J13", subjectKind: "page", subjectId: pageId } }) },
    { ...base, _id: operationId, role: "image", taskId: "J13", subjectKind: "page", subjectId: pageId, providerKind: "image",
      state: "prepared", workflowRunId: null, idempotencyKey: "image", inputFingerprint: imageRequestFingerprint(request),
      imageRequestJson: JSON.stringify(request), dependencyVersionIds: request.sourceVersionIds },
  ]);
  await database.collections.experiment_runs.updateOne({ _id: runId }, { $set: { activeOperationId: operationId } });
  const binding: BookletBinding = { role: "image", taskId: null, persona: null, appId: id(114), publishedWorkflowId: id(214),
    toolProviderId: null, apiKey: "private-test-key", finalPageIllustration: true };
  const upload = vi.fn(async (_binding: BookletBinding, _run: string, bytes: Uint8Array): Promise<ReferenceUploadResult> => {
    const item = attachments[bytes[0]! - 1]!;
    return { kind: "uploaded", id: id(50 + bytes[0]!), sha256: item.sha256, byteLength: item.byteLength, mimeType: item.mimeType };
  });
  const service = createExperimentReferenceUploads({ database, store: {} as AssetStore, upload });
  return { database, runId, operationId, binding, upload, service, input: { runId, operationId, parentWorkflowRunId } };
}

describe("J13 durable reference upload preparation", () => {
  it("persists each marker before POST, keeps selected order, and reuses completed acknowledgements", async () => {
    const env = await setup();
    const original = env.upload.getMockImplementation()!;
    env.upload.mockImplementation(async (...args) => {
      const operation = await env.database.collections.experiment_operations.findOne({ _id: env.operationId });
      expect(JSON.parse(operation!.referenceUploadJournalJson!).at(-1).state).toBe("started");
      return original(...args);
    });
    expect(await env.service.prepare(env.input, env.binding)).toEqual({ kind: "ready", fileIds: [id(51), id(52)] });
    expect(await env.service.prepare(env.input, env.binding)).toEqual({ kind: "ready", fileIds: [id(51), id(52)] });
    expect(env.upload).toHaveBeenCalledTimes(2);
    expect((await env.database.collections.experiment_runs.findOne({ _id: env.runId }))!.counters.logicalImage).toBe(0);
  });

  it("does not repeat a lost upload response or an interrupted started marker", async () => {
    const env = await setup(1); env.upload.mockResolvedValue({ kind: "unknown" });
    expect(await env.service.prepare(env.input, env.binding)).toEqual({ kind: "unknown" });
    expect(await env.service.prepare(env.input, env.binding)).toEqual({ kind: "unknown" });
    const operation = (await env.database.collections.experiment_operations.findOne({ _id: env.operationId }))!;
    const journal = JSON.parse(operation.referenceUploadJournalJson!); journal[0].state = "started";
    await env.database.collections.experiment_operations.updateOne({ _id: env.operationId }, { $set: { referenceUploadJournalJson: JSON.stringify(journal) } });
    expect(await env.service.prepare(env.input, env.binding)).toEqual({ kind: "unknown" });
    expect(env.upload).toHaveBeenCalledTimes(1);
  });

  it("retains a definite rejection without repeating its POST", async () => {
    const env = await setup(1); env.upload.mockResolvedValue({ kind: "rejected", reason: "http_rejected" });
    expect(await env.service.prepare(env.input, env.binding)).toEqual({ kind: "rejected" });
    expect(await env.service.prepare(env.input, env.binding)).toEqual({ kind: "rejected" });
    expect(env.upload).toHaveBeenCalledTimes(1);
  });

  it("records a verified empty route without uploading", async () => {
    const env = await setup(0);
    expect(await env.service.prepare(env.input, env.binding)).toEqual({ kind: "ready", fileIds: [] });
    expect(env.upload).not.toHaveBeenCalled();
    expect((await env.database.collections.experiment_operations.findOne({ _id: env.operationId }))!.referenceUploadsJson).toBe("[]");
  });

  it("rejects wrong binding, wrong manager selection, paused work and changed sources before another POST", async () => {
    const env = await setup(1);
    await expect(env.service.prepare(env.input, { ...env.binding, appId: id(999) })).rejects.toMatchObject({ code: "conflict" });
    await expect(env.service.prepare({ ...env.input, parentWorkflowRunId: id(999) }, env.binding)).rejects.toMatchObject({ code: "conflict" });
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { pauseRequested: true } });
    await expect(env.service.prepare(env.input, env.binding)).rejects.toMatchObject({ code: "conflict" });
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { pauseRequested: false } });
    await env.service.prepare(env.input, env.binding);
    verifySources.mockResolvedValue({ request: { request: { kind: "page_source", prompt: "Changed", sourceVersionIds: [id(10), id(11)], styleVersionId: id(11) } }, attachments: [] });
    await expect(env.service.prepare(env.input, env.binding)).rejects.toMatchObject({ code: "conflict" });
    expect(env.upload).toHaveBeenCalledTimes(1);
  });

  it("treats an inconsistent acknowledgement as unknown and never repeats it", async () => {
    const env = await setup(1); env.upload.mockResolvedValue({ kind: "uploaded", id: id(51), sha256: "0".repeat(64), byteLength: 1, mimeType: "image/png" });
    expect(await env.service.prepare(env.input, env.binding)).toEqual({ kind: "unknown" });
    expect(await env.service.prepare(env.input, env.binding)).toEqual({ kind: "unknown" });
    expect(env.upload).toHaveBeenCalledTimes(1);
  });

  it("admits only one concurrent upload and lets its in-flight acknowledgement finish", async () => {
    const env = await setup(1);
    const original = env.upload.getMockImplementation()!;
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    env.upload.mockImplementation(async (...args) => { entered(); await gate; return original(...args); });
    const first = env.service.prepare(env.input, env.binding);
    await started;
    expect(await env.service.prepare(env.input, env.binding)).toEqual({ kind: "unknown" });
    release();
    expect(await first).toEqual({ kind: "ready", fileIds: [id(51)] });
    expect(env.upload).toHaveBeenCalledTimes(1);
  });

  it("preserves completed prefix uploads when the next acknowledgement is lost", async () => {
    const env = await setup(2);
    const original = env.upload.getMockImplementation()!;
    env.upload.mockImplementation(async (...args) => args[2][0] === 2 ? { kind: "unknown" } : original(...args));
    expect(await env.service.prepare(env.input, env.binding)).toEqual({ kind: "unknown" });
    expect(await env.service.prepare(env.input, env.binding)).toEqual({ kind: "unknown" });
    const saved = (await env.database.collections.experiment_operations.findOne({ _id: env.operationId }))!;
    expect(JSON.parse(saved.referenceUploadsJson!)).toMatchObject([{ uploadFileId: id(51), assetId: id(30) }]);
    expect(JSON.parse(saved.referenceUploadJournalJson!).map((item: { state: string }) => item.state)).toEqual(["uploaded", "unknown"]);
    expect(env.upload).toHaveBeenCalledTimes(2);
  });

  it("does not start a POST when Pause commits between the source read and admission", async () => {
    const env = await setup(1);
    const original = verifySources.getMockImplementation()!;
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const read = new Promise<void>((resolve) => { entered = resolve; });
    verifySources.mockImplementationOnce(async (...args) => { entered(); await gate; return original(...args); });
    const preparing = env.service.prepare(env.input, env.binding);
    await read;
    const run = (await env.database.collections.experiment_runs.findOne({ _id: env.runId }))!;
    await createExperimentRepository(env.database).pause({ runId: env.runId, expectedRevision: run.revision, nowMs: 2 });
    release();
    await expect(preparing).rejects.toMatchObject({ code: "conflict" });
    expect(env.upload).not.toHaveBeenCalled();
    expect((await env.database.collections.experiment_operations.findOne({ _id: env.operationId }))!.referenceUploadJournalJson).toBeUndefined();
  });

  it("saves an admitted in-flight acknowledgement after Pause and reuses it on Resume", async () => {
    const env = await setup(1);
    const original = env.upload.getMockImplementation()!;
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const sent = new Promise<void>((resolve) => { entered = resolve; });
    env.upload.mockImplementation(async (...args) => { entered(); await gate; return original(...args); });
    const preparing = env.service.prepare(env.input, env.binding);
    await sent;
    const repository = createExperimentRepository(env.database);
    const run = (await repository.getRun(env.runId))!;
    const paused = await repository.pause({ runId: env.runId, expectedRevision: run.revision, nowMs: 2 });
    release();
    await expect(preparing).rejects.toMatchObject({ code: "conflict" });
    expect(JSON.parse((await env.database.collections.experiment_operations.findOne({ _id: env.operationId }))!.referenceUploadsJson!)).toMatchObject([{ uploadFileId: id(51) }]);
    await repository.resume({ runId: env.runId, expectedRevision: paused.revision, nowMs: 3 });
    expect(await env.service.prepare(env.input, env.binding)).toEqual({ kind: "ready", fileIds: [id(51)] });
    expect(env.upload).toHaveBeenCalledTimes(1);
  });
});
