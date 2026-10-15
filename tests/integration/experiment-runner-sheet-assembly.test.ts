import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExperimentSheetAssembly } from "@/db/experiment-sheets";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { parseReferenceProposal, styleModuleHash } from "@/lib/contracts/experiment-references";
import { referenceSheetRequest } from "@/lib/experiment-runner/reference-requests";
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
  async put(uri: string, content: Uint8Array, mimeType: string) { this.files.set(uri, Uint8Array.from(content)); return { uri, mimeType, byteLength: content.byteLength }; }
  async get(uri: string) { const value = this.files.get(uri); if (!value) throw new Error("missing"); await this.afterGet?.(); return Uint8Array.from(value); }
  async exists(uri: string) { return this.files.has(uri); }
}
const styleText = "  soft ink\nclear silhouettes  \n";
const character = (characterId: string) => ({ characterId, nameOrRole: "Inventor", narrativeFunction: "Lead", background: "Invents",
  lifeStage: "Child", physicalDescription: "Short hair", personalityAndActing: "Curious", attireRequirements: ["coat"], accessories: [],
  expressions: ["joy", "concern", "relief"], openQuestions: [], unitIds: [id(90), id(91)], recurrence: "recurring", sheetRequired: true });
const location = { locationId: id(21), title: "Park", storyPurpose: "Kite rescue", basicDescription: "Open park", stableAnchors: ["gate"],
  requiredFeatures: [], continuityNotes: [], openQuestions: [], unitIds: [id(90)], sheetRequired: true };
const common = { schemaVersion: "2", title: "Sheet", finalListVersionId: id(10), styleVersionId: id(11), stylePromptModule: styleText,
  stylePromptModuleHash: styleModuleHash(styleText), sheetPromptModule: "One montage, no labels.", reviewQuestions: [] };
const style = { schemaVersion: "2", title: "Style", stylePromptModule: styleText, stylePromptModuleHash: styleModuleHash(styleText),
  styleDefinition: { mediumAndLineWork: "ink", shapeLanguageAndProportions: "rounded", colourAndContrast: "warm", textureAndRendering: "paper",
    lightingAndAtmosphere: "gentle", emotionalTone: "hopeful", accessibilityAndReadability: "clear" }, typographyDirection: "large text",
  speechAndThoughtBubbleDirection: "round bubbles", exclusions: [], approvalQuestions: [], draftStyleVersionId: id(50),
  samples: [1, 2].map((n) => ({ sampleKey: `sample_${n}`, purpose: "Style check", build: { prompt: styleText,
    stylePromptModuleHash: styleModuleHash(styleText), operationId: id(50 + n), assetId: id(60 + n), sourceVersionIds: [id(50)] } })) };

async function setup(task: "J09" | "J10" = "J09") {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const repository = createExperimentRepository(database), runId = id(1), bookletId = id(2), draftSheetVersionId = id(3), artifactId = id(4);
  await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 });
  const subjectId = task === "J09" ? id(20) : id(21), subjectKind = task === "J09" ? "character" : "location";
  const proposal = task === "J09" ? { ...common, characterId: subjectId, characterDesignProfile: "Inventor", attireRequirements: ["coat"],
    accessories: [], requiredViews: ["front", "back", "side", "neutral_facial"], additionalExpressions: ["joy", "concern", "relief"] }
    : { ...common, locationId: subjectId, locationDefinitionProfile: "Park", stableAnchors: ["gate"], requiredFeatures: [], overview: "isometric",
      supportingViews: [{ angle: "entry", shows: "gate" }, { angle: "reverse", shows: "path" }] };
  const list = task === "J09" ? { schemaVersion: "2", title: "Cast", characters: [character(id(20)), character(id(22))], profileGuidance: [], representationAndContinuity: [], approvalQuestions: [] }
    : { schemaVersion: "2", title: "Places", locations: [location], profileGuidance: [], worldSafetyAndAccessibility: [], approvalQuestions: [] };
  for (const [index, sourceTask] of [task === "J09" ? "J06" : "J07", "J08"].entries()) {
    await database.collections.artifacts.insertOne({ _id: id(30 + index), bookletId, artifactType: `source_${sourceTask}`, taskId: sourceTask as "J06" | "J07" | "J08",
      experimentRunId: runId, subjectKind: "book", subjectId: bookletId, state: "approved", currentVersionId: id(10 + index), createdAtMs: 1, updatedAtMs: 1 });
    await database.collections.artifact_versions.insertOne({ _id: id(10 + index), artifactId: id(30 + index), schemaVersion: "2", versionNumber: 1,
      contentJson: JSON.stringify(index ? style : list), dependencyVersionIdsJson: "[]", createdBy: "agent", sourceVersionId: null, sourceExecutionBatchId: null, createdAtMs: 1 });
    await database.collections.approvals.insertOne({ _id: id(40 + index), bookletId, artifactVersionId: id(10 + index), scope: "artifact", subjectKey: null,
      action: "approve", origin: "explicit", sourceApprovalId: null, cardResponseId: null, qualityReviewId: null, experimentRunId: runId, testerDecisionId: id(42), createdAtMs: 1 });
  }
  await database.collections.artifacts.insertOne({ _id: artifactId, bookletId, artifactType: task === "J09" ? "character_sheet_package" : "location_sheet_package",
    taskId: task, experimentRunId: runId, subjectKind, subjectId, state: "draft", currentVersionId: draftSheetVersionId, createdAtMs: 1, updatedAtMs: 1 });
  await database.collections.artifact_versions.insertOne({ _id: draftSheetVersionId, artifactId, schemaVersion: "2", versionNumber: 1, contentJson: JSON.stringify(proposal),
    dependencyVersionIdsJson: JSON.stringify([id(10), id(11)]), createdBy: "agent", sourceVersionId: null, sourceExecutionBatchId: null,
    sourceOperationId: id(70), warningsJson: '[{"field":"design","message":"Review silhouette"}]', createdAtMs: 1 });
  const store = new MemoryStore(), request = referenceSheetRequest(task, proposal);
  const bytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#74aadd" } }).png().toBuffer();
  const identity = { runId, operationId: id(71), workflowRunId: id(72), parentWorkflowRunId: id(73), inputFingerprint: imageRequestFingerprint(request) };
  const run = await repository.getRun(runId); if (!run) throw new Error("missing");
  await repository.prepareOperation({ operationId: identity.operationId, runId, expectedRevision: run.revision, role: "image", taskId: task,
    subjectKind, subjectId, inputFingerprint: identity.inputFingerprint, attempt: 1, providerKind: "image", imageRequest: request, nowMs: 2 });
  await repository.claimOperation({ runId, operationId: identity.operationId, workflowRunId: identity.workflowRunId,
    parentWorkflowRunId: identity.parentWorkflowRunId, nowMs: 3 });
  await createExperimentImageStorage({ database, store, now: () => 4 }).complete({ identity, content: bytes });
  const input = { runId, draftSheetVersionId, imageOperationId: identity.operationId };
  const service = () => createExperimentSheetAssembly({ database, store, now: () => 100 });
  return { database, repository, store, input, artifactId, service, task };
}

describe("saved sheet assembly", () => {
  it.each(["J09", "J10"] as const)("assembles Balanced %s only from matching retained image evidence", async (task) => {
    const env = await setup(task);
    const retained = await retainM4ImageTestPolicy(env.database, env.input.runId);
    const saved = await env.service().assemble(env.input);
    expect(saved.reused).toBe(false);
    expect((await env.service().assemble(env.input)).reused).toBe(true);
    expect((await env.repository.getRun(env.input.runId))!.counters).toEqual(retained.counters);
    await env.database.collections.experiment_runs.updateOne({ _id: env.input.runId }, { $set: { configurationHash: "0".repeat(64) } });
    await expect(env.service().assemble(env.input)).rejects.toThrow("simulated image policy");
    await env.database.collections.experiment_runs.updateOne({ _id: env.input.runId }, { $set: { configurationHash: retained.configurationHash } });
    env.store.files.set([...env.store.files.keys()][0], new Uint8Array([1]));
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "invalid_state" });
  });
  for (const task of ["J09", "J10"] as const) {
    it(`${task} persists one unapproved assembly and reuses it after restart and concurrent calls`, async () => {
      const env = await setup(task), before = await env.repository.getRun(env.input.runId);
      const results = await Promise.all([env.service().assemble(env.input), env.service().assemble(env.input)]);
      expect(new Set(results.map((r) => r.version._id)).size).toBe(1);
      expect(results.filter((r) => !r.reused)).toHaveLength(1);
      const saved = results[0].version;
      const parsed = parseReferenceProposal(task, "assembled", JSON.parse(saved.contentJson)).content;
      expect(parsed.stylePromptModule).toBe(styleText);
      expect(saved).toMatchObject({ createdBy: "application", sourceVersionId: env.input.draftSheetVersionId, versionNumber: 2 });
      expect(saved).not.toHaveProperty("sourceOperationId");
      expect(JSON.parse(saved.warningsJson!)).toContainEqual({ field: "design", message: "Review silhouette" });
      expect(await env.database.collections.artifact_dependencies.countDocuments({ downstreamVersionId: saved._id })).toBe(3);
      expect(await env.database.collections.approvals.countDocuments({ artifactVersionId: saved._id })).toBe(0);
      expect(await env.database.collections.artifacts.findOne({ _id: env.artifactId })).toMatchObject({ state: "draft", currentVersionId: saved._id });
      expect((await env.service().assemble(env.input)).reused).toBe(true);
      await expect(env.service().assemble({ ...env.input, draftSheetVersionId: saved._id })).rejects.toMatchObject({ code: "invalid_state" });
      expect((await env.repository.getRun(env.input.runId))?.counters).toEqual(before?.counters);
      expect(before?.counters).toMatchObject({ logicalImage: 1, payableImage: 0, payableText: 0 });
    });
  }
  it("rejects corrupt or missing bytes even on replay", async () => {
    const env = await setup(); await env.service().assemble(env.input);
    const uri = [...env.store.files.keys()][0]; env.store.files.set(uri, new Uint8Array([1]));
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "invalid_state" });
    env.store.files.delete(uri);
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "invalid_state" });
  });
  it("rechecks approved sources after reading bytes without regenerating", async () => {
    const env = await setup(); env.store.afterGet = async () => { env.store.afterGet = undefined;
      await env.database.collections.artifacts.updateOne({ _id: id(30) }, { $set: { state: "needs_review" } }); };
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "conflict" });
    expect(await env.database.collections.artifact_versions.countDocuments({ artifactId: env.artifactId })).toBe(1);
    expect(await env.database.collections.assets.countDocuments()).toBe(1);
  });
  it("rejects wrong subject, completed-image lineage and missing approvals", async () => {
    const env = await setup();
    await env.database.collections.experiment_operations.updateOne({ _id: id(71) }, { $set: { subjectId: id(22) } });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "invalid_state" });
    await env.database.collections.experiment_operations.updateOne({ _id: id(71) }, { $set: { subjectId: id(20), resultDigest: "0".repeat(64) } });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "conflict" });
    await env.database.collections.approvals.deleteOne({ artifactVersionId: id(10) });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "conflict" });
  });
  it("preserves pause and rejects active work and incomplete replay edges", async () => {
    const env = await setup(), run = await env.repository.getRun(env.input.runId); if (!run) throw new Error("missing");
    await env.repository.pause({ runId: run._id, expectedRevision: run.revision, nowMs: 90 });
    const saved = await env.service().assemble(env.input);
    expect(await env.repository.getRun(run._id)).toMatchObject({ status: "paused", pauseRequested: true });
    await env.database.collections.artifact_dependencies.deleteOne({ downstreamVersionId: saved.version._id, upstreamVersionId: id(10) });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "conflict" });
    await env.database.collections.experiment_runs.updateOne({ _id: run._id }, { $set: { activeOperationId: id(99) } });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "invalid_state" });
  });
  it("rejects altered approved facts, style text and stale draft identity", async () => {
    const env = await setup("J10");
    const source = await env.database.collections.artifact_versions.findOne({ _id: id(10) }); if (!source) throw new Error("missing");
    const list = JSON.parse(source.contentJson); list.locations[0].requiredFeatures = ["tower"];
    await env.database.collections.artifact_versions.updateOne({ _id: id(10) }, { $set: { contentJson: JSON.stringify(list) } });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "conflict" });
    await env.database.collections.artifact_versions.updateOne({ _id: id(10) }, { $set: { contentJson: source.contentJson } });
    const changedText = `${styleText}new instruction`;
    const changedStyle = { ...style, stylePromptModule: changedText, stylePromptModuleHash: styleModuleHash(changedText),
      samples: style.samples.map((sample) => ({ ...sample, build: { ...sample.build, prompt: changedText, stylePromptModuleHash: styleModuleHash(changedText) } })) };
    await env.database.collections.artifact_versions.updateOne({ _id: id(11) }, { $set: { contentJson: JSON.stringify(changedStyle) } });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "conflict" });
    await env.database.collections.artifact_versions.updateOne({ _id: id(11) }, { $set: { contentJson: JSON.stringify(style) } });
    await env.database.collections.artifacts.updateOne({ _id: env.artifactId }, { $set: { currentVersionId: id(98) } });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "conflict" });
    expect(await env.database.collections.artifact_versions.countDocuments({ artifactId: env.artifactId })).toBe(1);
  });
  it("rejects incomplete operations and terminal or real-mode runs", async () => {
    const env = await setup();
    await env.database.collections.experiment_operations.updateOne({ _id: id(71) }, { $set: { state: "unknown" } });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "invalid_state" });
    await env.database.collections.experiment_operations.updateOne({ _id: id(71) }, { $set: { state: "succeeded" } });
    await env.database.collections.experiment_runs.updateOne({ _id: env.input.runId }, { $set: { status: "completed" } });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "invalid_state" });
    await env.database.collections.experiment_runs.updateOne({ _id: env.input.runId }, { $set: { status: "queued", mode: "real" } });
    await expect(env.service().assemble(env.input)).rejects.toMatchObject({ code: "invalid_state" });
  });
});
