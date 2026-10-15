import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExperimentStyleAssembly } from "@/db/experiment-style";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { parseReferenceProposal, styleModuleHash } from "@/lib/contracts/experiment-references";
import { styleSampleRequests } from "@/lib/experiment-runner/reference-requests";
import { createExperimentImageStorage } from "@/lib/experiment-runner/image-storage";
import type { AssetStore } from "@/lib/assets/asset-store";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { retainM4ImageTestPolicy } from "@/tests/helpers/m4-image-state";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
class MemoryStore implements AssetStore {
  files = new Map<string, Uint8Array>();
  afterGet?: () => Promise<void>;
  async put(uri: string, content: Uint8Array, mimeType: string) {
    this.files.set(uri, Uint8Array.from(content)); return { uri, mimeType, byteLength: content.byteLength };
  }
  async get(uri: string) {
    const bytes = this.files.get(uri); if (!bytes) throw new Error("missing");
    await this.afterGet?.(); return Uint8Array.from(bytes);
  }
  async exists(uri: string) { return this.files.has(uri); }
}
const moduleText = "  soft ink\nclear silhouettes  \n";
const style = { schemaVersion: "2", title: "Style", stylePromptModule: moduleText, stylePromptModuleHash: styleModuleHash(moduleText),
  styleDefinition: { mediumAndLineWork: "ink", shapeLanguageAndProportions: "rounded", colourAndContrast: "warm",
    textureAndRendering: "paper", lightingAndAtmosphere: "gentle", emotionalTone: "hopeful", accessibilityAndReadability: "clear" },
  typographyDirection: "large text", speechAndThoughtBubbleDirection: "round bubbles", exclusions: [], approvalQuestions: [],
  samplePlan: [{ sampleKey: "sample_1", purpose: "Emotion" }, { sampleKey: "sample_2", purpose: "Place" }] };

async function setup(sampleCount = 2) {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const repository = createExperimentRepository(database);
  const runId = id(1), bookletId = id(2), draftStyleVersionId = id(3), styleArtifactId = id(4);
  await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 });
  const sourceIds = [10, 11, 12, 13, 14].map(id);
  for (const [index, taskId] of ["J01", "J02", "J05", "J06", "J07"].entries()) {
    await database.collections.artifacts.insertOne({ _id: id(20 + index), bookletId, artifactType: `source_${taskId}`,
      taskId: taskId as "J01" | "J02" | "J05" | "J06" | "J07", experimentRunId: runId, subjectKind: "book", subjectId: bookletId,
      state: "approved", currentVersionId: sourceIds[index], createdAtMs: 1, updatedAtMs: 1 });
    await database.collections.artifact_versions.insertOne({ _id: sourceIds[index], artifactId: id(20 + index),
      schemaVersion: "2", versionNumber: 1, contentJson: "{}", dependencyVersionIdsJson: "[]", createdBy: "agent",
      sourceVersionId: null, sourceExecutionBatchId: null, createdAtMs: 1 });
    await database.collections.approvals.insertOne({ _id: id(30 + index), bookletId, artifactVersionId: sourceIds[index],
      scope: "artifact", subjectKey: null, action: "approve", origin: "explicit", sourceApprovalId: null, cardResponseId: null,
      qualityReviewId: null, experimentRunId: runId, testerDecisionId: id(40), createdAtMs: 1 });
  }
  await database.collections.artifacts.insertOne({ _id: styleArtifactId, bookletId, artifactType: "visual_style_package",
    taskId: "J08", experimentRunId: runId, subjectKind: "book", subjectId: bookletId, state: "draft",
    currentVersionId: draftStyleVersionId, createdAtMs: 1, updatedAtMs: 1 });
  await database.collections.artifact_versions.insertOne({ _id: draftStyleVersionId, artifactId: styleArtifactId,
    versionNumber: 1, schemaVersion: "2", contentJson: JSON.stringify(style), dependencyVersionIdsJson: JSON.stringify(sourceIds),
    createdBy: "agent", sourceVersionId: null, sourceExecutionBatchId: null, sourceOperationId: id(50),
    warningsJson: '[{"field":"tone","message":"Saved draft warning"}]', createdAtMs: 1 });
  const sources = { draftStyleVersionId, conceptVersionId: sourceIds[0], outlineVersionId: sourceIds[1],
    manuscriptVersionId: sourceIds[2], finalCharactersVersionId: sourceIds[3], finalLocationsVersionId: sourceIds[4] };
  const store = new MemoryStore();
  const bytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#74aadd" } }).png().toBuffer();
  const sampleOperationIds = [id(60), id(61)];
  const requests = styleSampleRequests(style, sources);
  for (let index = 0; index < sampleCount; index++) {
    const request = requests[index].request;
    const identity = { runId, operationId: sampleOperationIds[index], workflowRunId: id(70 + index),
      parentWorkflowRunId: id(80), inputFingerprint: imageRequestFingerprint(request) };
    const run = await repository.getRun(runId); if (!run) throw new Error("missing run");
    await repository.prepareOperation({ operationId: identity.operationId, runId, expectedRevision: run.revision,
      role: "image", taskId: "J08", subjectKind: "book", subjectId: bookletId, inputFingerprint: identity.inputFingerprint,
      attempt: 1, providerKind: "image", imageRequest: request, nowMs: 10 + index * 10 });
    await repository.claimOperation({ runId, operationId: identity.operationId, workflowRunId: identity.workflowRunId,
      parentWorkflowRunId: identity.parentWorkflowRunId, nowMs: 11 + index * 10 });
    await createExperimentImageStorage({ database, store, now: () => 12 + index * 10 }).complete({ identity, content: bytes });
  }
  const input = { runId, draftStyleVersionId, sampleOperationIds };
  const service = () => createExperimentStyleAssembly({ database, store, now: () => 100 });
  return { database, repository, input, service, store, sourceIds, styleArtifactId, bytes };
}

describe("saved style sample assembly", () => {
  it("assembles Balanced synthetic style samples and retains byte and policy checks", async () => {
    const env = await setup();
    const retained = await retainM4ImageTestPolicy(env.database, env.input.runId);
    const saved = await env.service().assemble(env.input);
    expect(saved.reused).toBe(false);
    expect((await env.service().assemble(env.input)).reused).toBe(true);
    expect((await env.repository.getRun(env.input.runId))!.counters).toEqual(retained.counters);
    await env.database.collections.experiment_operations.updateOne({ _id: env.input.sampleOperationIds[0] }, { $set: { mode: "simulated" } });
    await expect(env.service().assemble(env.input)).rejects.toThrow("completed authorized J08");
    await env.database.collections.experiment_operations.updateOne({ _id: env.input.sampleOperationIds[0] }, { $set: { mode: "balanced" } });
    const uri = [...env.store.files.keys()][0]; env.store.files.set(uri, new Uint8Array([1]));
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "invalid_state" });
    expect(await env.database.collections.approvals.countDocuments({ artifactVersionId: saved.version._id })).toBe(0);
  });
  it("assembles two saved samples without approval, provider calls or another reservation", async () => {
    const env = await setup(); const before = await env.repository.getRun(env.input.runId);
    const saved = await env.service().assemble({ ...env.input, sampleOperationIds: [...env.input.sampleOperationIds].reverse() });
    const content = parseReferenceProposal("J08", "assembled", JSON.parse(saved.version.contentJson)).content;
    expect(saved.reused).toBe(false); expect(content.stylePromptModule).toBe(moduleText);
    expect(content.samples.map((sample) => sample.sampleKey)).toEqual(["sample_1", "sample_2"]);
    expect(content.samples.map((sample) => sample.build.assetId)).toEqual(env.input.sampleOperationIds);
    expect(saved.version).toMatchObject({ versionNumber: 2, createdBy: "application", sourceVersionId: env.input.draftStyleVersionId });
    expect(saved.version).not.toHaveProperty("sourceOperationId");
    expect(JSON.parse(saved.version.warningsJson!)).toContainEqual({ field: "tone", message: "Saved draft warning" });
    expect(await env.database.collections.artifact_dependencies.countDocuments({ downstreamVersionId: saved.version._id })).toBe(6);
    expect(await env.database.collections.artifacts.findOne({ _id: env.styleArtifactId })).toMatchObject({ state: "draft", currentVersionId: saved.version._id });
    expect(await env.database.collections.approvals.countDocuments({ artifactVersionId: saved.version._id })).toBe(0);
    expect((await env.repository.getRun(env.input.runId))?.counters).toEqual(before?.counters);
    expect(before?.counters).toMatchObject({ logicalImage: 2, payableImage: 0, payableText: 0 });
    expect((await env.service().assemble(env.input)).version._id).toBe(saved.version._id);
    expect((await env.service().assemble(env.input)).reused).toBe(true);
  });
  it("reuses one assembly under concurrent submission and after restart", async () => {
    const env = await setup(); const results = await Promise.all([env.service().assemble(env.input), env.service().assemble(env.input)]);
    expect(new Set(results.map((result) => result.version._id)).size).toBe(1);
    expect(results.filter((result) => !result.reused)).toHaveLength(1);
    expect(await env.database.collections.artifact_versions.countDocuments({ artifactId: env.styleArtifactId })).toBe(2);
    expect((await env.service().assemble(env.input)).reused).toBe(true);
  });
  it("blocks missing samples and duplicate IDs without changing the draft", async () => {
    const env = await setup(1);
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "invalid_state" });
    await expect(env.service().assemble({ ...env.input, sampleOperationIds: [id(60), id(60)] })).rejects.toThrow();
    expect(await env.database.collections.artifact_versions.countDocuments({ artifactId: env.styleArtifactId })).toBe(1);
  });
  it("blocks corrupt bytes after completion and on an assembly replay", async () => {
    const env = await setup(); const saved = await env.service().assemble(env.input);
    const uri = [...env.store.files.keys()][0]; env.store.files.set(uri, new Uint8Array([1]));
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "invalid_state" });
    expect((await env.database.collections.artifacts.findOne({ _id: env.styleArtifactId }))?.currentVersionId).toBe(saved.version._id);
  });
  it("blocks a missing stored asset before assembly", async () => {
    const env = await setup(); env.store.files.delete([...env.store.files.keys()][0]);
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "invalid_state" });
    expect(await env.database.collections.artifact_versions.countDocuments({ artifactId: env.styleArtifactId })).toBe(1);
  });
  it("rechecks current approvals after storage reads and leaves completed images intact", async () => {
    const env = await setup();
    env.store.afterGet = async () => { env.store.afterGet = undefined;
      await env.database.collections.artifacts.updateOne({ _id: id(20) }, { $set: { state: "needs_review" } }); };
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "conflict" });
    expect(await env.database.collections.assets.countDocuments()).toBe(2);
    expect(await env.database.collections.artifact_versions.countDocuments({ artifactId: env.styleArtifactId })).toBe(1);
    expect((await env.repository.getRun(env.input.runId))?.counters.logicalImage).toBe(2);
  });
  it("rejects wrong slot fingerprints, lineage and missing approval records", async () => {
    const env = await setup();
    await env.database.collections.experiment_operations.updateOne({ _id: id(60) }, { $set: { inputFingerprint: "0".repeat(64) } });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "invalid_state" });
    const request = styleSampleRequests(style, { draftStyleVersionId: id(3), conceptVersionId: id(10), outlineVersionId: id(11), manuscriptVersionId: id(12), finalCharactersVersionId: id(13), finalLocationsVersionId: id(14) })[0].request;
    await env.database.collections.experiment_operations.updateOne({ _id: id(60) }, { $set: { inputFingerprint: imageRequestFingerprint(request), resultDigest: "0".repeat(64) } });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "conflict" });
    await env.database.collections.approvals.deleteOne({ artifactVersionId: id(10) });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "conflict" });
  });
  it("keeps paused work paused and refuses active or terminal runs", async () => {
    const env = await setup(); const run = await env.repository.getRun(env.input.runId); if (!run) throw new Error("missing");
    await env.repository.pause({ runId: run._id, expectedRevision: run.revision, nowMs: 90 });
    await env.service().assemble(env.input);
    expect(await env.repository.getRun(run._id)).toMatchObject({ status: "paused", pauseRequested: true });
    await env.database.collections.experiment_runs.updateOne({ _id: run._id }, { $set: { activeOperationId: id(99) } });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "invalid_state" });
    await env.database.collections.experiment_runs.updateOne({ _id: run._id }, { $set: { activeOperationId: null, status: "completed" } });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "invalid_state" });
  });
  it("rejects stale draft identity and an incomplete assembled dependency graph", async () => {
    const env = await setup(); const saved = await env.service().assemble(env.input);
    await env.database.collections.artifact_dependencies.deleteOne({ downstreamVersionId: saved.version._id, upstreamVersionId: env.sourceIds[0] });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "conflict" });
    await env.database.collections.artifacts.updateOne({ _id: env.styleArtifactId }, { $set: { currentVersionId: id(100) } });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "conflict" });
    expect(await env.database.collections.assets.countDocuments()).toBe(2);
  });
});
