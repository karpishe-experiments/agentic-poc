import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { Database } from "@/db/client";
import { createExperimentPageIllustrationAssembly } from "@/db/experiment-page-illustrations";
import { createExperimentRepository } from "@/db/experiment-repository";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import type { AssetStore } from "@/lib/assets/asset-store";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const { verifySources } = vi.hoisted(() => ({ verifySources: vi.fn() }));
vi.mock("@/db/experiment-pages", () => ({ verifyCurrentPageIllustrationSources: verifySources }));

const databases: Database[] = [];
afterEach(async () => { verifySources.mockReset(); await Promise.all(databases.splice(0).map(closeTestDatabase)); });

async function setup(withReferences = false) {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const runId = id(1), bookletId = id(2), pageId = id(3), operationId = id(4), managerWorkflowId = id(5), imageWorkflowId = id(6);
  const repository = createExperimentRepository(database);
  const configuration = [
    { role: "manager", taskId: null }, ...Array.from({ length: 12 }, (_, index) => ({ role: "specialist", taskId: `J${String(index + 1).padStart(2, "0")}` })),
    { role: "tester", taskId: null }, { role: "image", taskId: null, finalPageIllustration: true },
  ].map((item, index) => ({ ...item, appId: id(100 + index), publishedWorkflowId: id(200 + index), toolProviderId: null }));
  await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration, nowMs: 1 });
  const request = { kind: "page_source" as const, prompt: "Exact lettering", sourceVersionIds: [id(10), id(11), ...(withReferences ? [id(12)] : [])], styleVersionId: id(11) };
  const bytes = new Uint8Array(await sharp({ create: { width: 3, height: 2, channels: 3, background: "#77aacc" } }).png().toBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex"), uri = `experiments/${bookletId}/${runId}/${operationId}/attempt-1/image.png`;
  const files = new Map([[uri, bytes]]);
  const store = { async put() { throw new Error("unused"); }, async exists(key: string) { return files.has(key); },
    async get(key: string) { const value = files.get(key); if (!value) throw new Error("missing"); return Uint8Array.from(value); } } as AssetStore;
  const references = withReferences ? [{ subjectKind: "character", subjectId: id(15), assetId: id(16), artifactVersionId: id(12),
    mimeType: "image/png", sha256: digest, byteLength: bytes.byteLength, width: 3, height: 2 }] : [];
  const acknowledgements = references.map(({ subjectKind, ...reference }) => ({ ...reference, role: subjectKind, uploadFileId: id(17) }));
  verifySources.mockResolvedValue({ page: { pageIndex: 1 }, pageBibleVersionId: id(10), request: { request }, attachments: references, warnings: [] });
  await database.collections.experiment_operations.insertMany([
    { _id: id(20), runId, role: "manager", taskId: null, subjectKind: "book", subjectId: bookletId, idempotencyKey: "manager", inputFingerprint: "a".repeat(64), attempt: 1, mode: "simulated", providerKind: "text", state: "succeeded", workflowRunId: managerWorkflowId, parentWorkflowRunId: null, verifiedWorkflowId: id(200), reservationCount: 1, deadlineAtMs: null, resultJson: JSON.stringify({ kind: "delegate", payload: { taskId: "J13", subjectKind: "page", subjectId: pageId } }), resultDigest: null, warningsJson: "[]", expectedTargetVersionId: null, dependencyVersionIds: [], materializationJson: null, safeFailure: null, createdAtMs: 1, updatedAtMs: 1 },
    { _id: operationId, runId, role: "image", taskId: "J13", subjectKind: "page", subjectId: pageId, idempotencyKey: "page", inputFingerprint: imageRequestFingerprint(request), attempt: 1, mode: "simulated", providerKind: "image", state: "succeeded", workflowRunId: imageWorkflowId, parentWorkflowRunId: managerWorkflowId, verifiedWorkflowId: id(214), imageRequestJson: JSON.stringify(request), referenceUploadsJson: "[]", imageCompletionDigest: digest, imageCompletionClaim: null, reservationCount: 1, deadlineAtMs: null, resultJson: JSON.stringify({ assetId: operationId, sha256: digest, uri }), resultDigest: digest, warningsJson: "[]", expectedTargetVersionId: null, dependencyVersionIds: request.sourceVersionIds, materializationJson: JSON.stringify({ assetId: operationId, sha256: digest, uri }), safeFailure: null, createdAtMs: 1, updatedAtMs: 1 },
  ]);
  await database.collections.assets.insertOne({ _id: operationId, bookletId, kind: "page_source", uri, mimeType: "image/png", width: 3, height: 2, sourceAssetId: null,
    metadataJson: JSON.stringify({ sha256: digest, byteLength: bytes.byteLength, operationId, attempt: 1, workflowRunId: imageWorkflowId, parentWorkflowRunId: managerWorkflowId, inputFingerprint: imageRequestFingerprint(request), sourceVersionIds: request.sourceVersionIds, request }), createdAtMs: 1 });
  await database.collections.experiment_operations.updateOne({ _id: operationId }, { $set: { referenceUploadsJson: JSON.stringify(acknowledgements) } });
  return { database, store, files, runId, pageId, operationId, service: () => createExperimentPageIllustrationAssembly({ database, store, now: () => 2 }) };
}

describe("J13 page illustration assembly", () => {
  it("saves one page draft and replays the same completed operation", async () => {
    const env = await setup(); const input = { runId: env.runId, pageId: env.pageId, imageOperationId: env.operationId };
    const first = await env.service().assemble(input), replay = await env.service().assemble(input);
    expect(first.reused).toBe(false); expect(replay).toMatchObject({ reused: true, version: { _id: first.version._id } });
    expect(JSON.parse(first.version.contentJson)).toMatchObject({ pageId: env.pageId, operationId: env.operationId, output: { mimeType: "image/png" } });
    expect(await env.database.collections.artifact_dependencies.countDocuments({ downstreamVersionId: first.version._id })).toBe(2);
  });

  it("rejects a wrong manager page and corrupt or missing completed output", async () => {
    const env = await setup();
    await env.database.collections.experiment_operations.updateOne({ _id: id(20) }, { $set: { resultJson: JSON.stringify({ kind: "delegate", payload: { taskId: "J13", subjectKind: "page", subjectId: id(99) } }) } });
    await expect(env.service().assemble({ runId: env.runId, pageId: env.pageId, imageOperationId: env.operationId })).rejects.toMatchObject({ code: "invalid_state" });
    await env.database.collections.experiment_operations.updateOne({ _id: id(20) }, { $set: { resultJson: JSON.stringify({ kind: "delegate", payload: { taskId: "J13", subjectKind: "page", subjectId: env.pageId } }) } });
    env.files.set((await env.database.collections.assets.findOne({ _id: env.operationId }))!.uri, new Uint8Array([1]));
    await expect(env.service().assemble({ runId: env.runId, pageId: env.pageId, imageOperationId: env.operationId })).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("rejects a legacy saved configuration without the final-page flag", async () => {
    const env = await setup();
    const run = (await env.database.collections.experiment_runs.findOne({ _id: env.runId }))!;
    const legacy = JSON.parse(run.configurationJson).map((entry: Record<string, unknown>) => {
      const copy = { ...entry }; delete copy.finalPageIllustration; return copy;
    });
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { configurationJson: JSON.stringify(legacy) } });
    await expect(env.service().assemble({ runId: env.runId, pageId: env.pageId, imageOperationId: env.operationId })).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("rejects an image publication that differs from the saved binding", async () => {
    const env = await setup();
    await env.database.collections.experiment_operations.updateOne({ _id: env.operationId }, { $set: { verifiedWorkflowId: id(999) } });
    await expect(env.service().assemble({ runId: env.runId, pageId: env.pageId, imageOperationId: env.operationId })).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("retains selected upload evidence and rejects an acknowledgement with changed original metadata", async () => {
    const env = await setup(true);
    const operation = (await env.database.collections.experiment_operations.findOne({ _id: env.operationId }))!;
    const uploads = JSON.parse(operation.referenceUploadsJson!);
    await env.database.collections.experiment_operations.updateOne({ _id: env.operationId }, {
      $set: { referenceUploadsJson: JSON.stringify([{ ...uploads[0], sha256: "0".repeat(64) }]) } });
    await expect(env.service().assemble({ runId: env.runId, pageId: env.pageId, imageOperationId: env.operationId })).rejects.toMatchObject({ code: "conflict" });
    await env.database.collections.experiment_operations.updateOne({ _id: env.operationId }, { $set: { referenceUploadsJson: operation.referenceUploadsJson } });
    const saved = await env.service().assemble({ runId: env.runId, pageId: env.pageId, imageOperationId: env.operationId });
    expect(JSON.parse(saved.version.contentJson).attachments).toMatchObject([{ role: "character", uploadFileId: id(17), uploadUser: `booklet-${env.runId}` }]);
  });

  it("keeps canonical MIME and a warning without rejecting a usable output", async () => {
    const env = await setup();
    await env.database.collections.assets.updateOne({ _id: env.operationId }, { $set: { mimeType: "image/jpeg" } });
    const input = { runId: env.runId, pageId: env.pageId, imageOperationId: env.operationId };
    const first = await env.service().assemble(input);
    expect(JSON.parse(first.version.contentJson).output.mimeType).toBe("image/png");
    expect(JSON.parse(first.version.warningsJson!)[0]).toMatchObject({ field: "image" });
    await env.database.collections.assets.updateOne({ _id: env.operationId }, { $set: { mimeType: "image/png" } });
    expect((await env.service().assemble(input)).version._id).toBe(first.version._id);
    await env.database.client.withSession((session) => env.service().verifyVersion({ runId: env.runId, versionId: first.version._id }, session));
  });

  it("records approved-canvas geometry and aspect deviations without rejecting a usable output", async () => {
    const env = await setup();
    const run = await env.database.collections.experiment_runs.findOne({ _id: env.runId });
    const operation = await env.database.collections.experiment_operations.findOne({ _id: env.operationId });
    const request = JSON.parse(operation!.imageRequestJson!);
    verifySources.mockResolvedValue({
      page: { pageIndex: 1 }, pageBibleVersionId: id(10), request: { request }, attachments: [], warnings: [],
      layout: { canvas: {
        trim: { width: 400, height: 300, unit: "mm" }, orientation: "landscape",
        aspectRatio: { width: 4, height: 3 }, workingPixels: { width: 4, height: 3 },
        bleed: { top: 0, right: 0, bottom: 0, left: 0, unit: "mm" },
        binding: { edge: "left", allowance: 0, unit: "mm" },
        liveTextSafeMargins: { top: 0, right: 0, bottom: 0, left: 0, unit: "mm" }, readingDirection: "left_to_right",
      } },
    });
    expect(run).not.toBeNull();
    const saved = await env.service().assemble({ runId: env.runId, pageId: env.pageId, imageOperationId: env.operationId });
    const warnings = JSON.parse(saved.version.warningsJson!);
    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: "Saved page output geometry 3x2 differs from approved working canvas 4x3." }),
      expect.objectContaining({ message: "Saved page output aspect ratio 3:2 differs from approved canvas aspect ratio 4:3." }),
    ]));
  });

  it("rejects incomplete saved dependencies and changed current sources", async () => {
    const env = await setup();
    const input = { runId: env.runId, pageId: env.pageId, imageOperationId: env.operationId };
    const first = await env.service().assemble(input);
    await env.database.collections.artifact_dependencies.deleteOne({ downstreamVersionId: first.version._id });
    await expect(env.service().assemble(input)).rejects.toMatchObject({ code: "conflict" });
    verifySources.mockRejectedValue(new Error("Current page sources changed."));
    await expect(env.service().assemble(input)).rejects.toThrow("Current page sources changed.");
    expect(await env.database.collections.artifact_versions.countDocuments({ artifactId: first.version.artifactId })).toBe(1);
  });

  it("preserves earlier versions and unrelated pages during an eligible replacement", async () => {
    const env = await setup();
    const first = await env.service().assemble({ runId: env.runId, pageId: env.pageId, imageOperationId: env.operationId });
    const unrelated = { _id: id(90), bookletId: id(2), artifactType: "J13", taskId: "J13" as const,
      experimentRunId: env.runId, subjectKind: "page" as const, subjectId: id(91), state: "draft", currentVersionId: null, createdAtMs: 1, updatedAtMs: 1 };
    await env.database.collections.artifacts.insertOne(unrelated);
    const operation = (await env.database.collections.experiment_operations.findOne({ _id: env.operationId }))!;
    const asset = (await env.database.collections.assets.findOne({ _id: env.operationId }))!;
    const nextId = id(40), nextWorkflowId = id(41), nextUri = asset.uri.replace(env.operationId, nextId).replace("attempt-1", "attempt-2");
    const summary = JSON.stringify({ assetId: nextId, sha256: operation.resultDigest, uri: nextUri });
    await env.database.collections.experiment_operations.insertOne({ ...operation, _id: nextId, idempotencyKey: "replacement", attempt: 2,
      workflowRunId: nextWorkflowId, expectedTargetVersionId: first.version._id, resultJson: summary, materializationJson: summary });
    const metadata = JSON.parse(asset.metadataJson!);
    await env.database.collections.assets.insertOne({ ...asset, _id: nextId, uri: nextUri,
      metadataJson: JSON.stringify({ ...metadata, operationId: nextId, attempt: 2, workflowRunId: nextWorkflowId }) });
    env.files.set(nextUri, env.files.get(asset.uri)!);
    await expect(env.service().assemble({ runId: env.runId, pageId: env.pageId, imageOperationId: nextId })).rejects.toMatchObject({ code: "conflict" });
    await env.database.collections.artifacts.updateOne({ _id: first.version.artifactId }, { $set: { state: "needs_review" } });
    const second = await env.service().assemble({ runId: env.runId, pageId: env.pageId, imageOperationId: nextId });
    expect(second.version.sourceVersionId).toBe(first.version._id);
    expect(JSON.parse(second.version.contentJson).candidateLineage.previousPageVersionId).toBe(first.version._id);
    expect(await env.database.collections.artifact_versions.countDocuments({ artifactId: first.version.artifactId })).toBe(2);
    expect(await env.database.collections.artifacts.findOne({ _id: unrelated._id })).toEqual(unrelated);
    expect((await env.service().assemble({ runId: env.runId, pageId: env.pageId, imageOperationId: nextId })).reused).toBe(true);
  });
});
