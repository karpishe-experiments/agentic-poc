import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import type { AssetStore, StoredAsset } from "@/lib/assets/asset-store";
import { ArtifactService } from "@/lib/application/artifact-service";
import { BookletService } from "@/lib/application/booklet-service";
import { GenerationService } from "@/lib/application/generation-service";
import { ImageAgentRunService } from "@/lib/application/image-agent-run-service";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import { FakeImageProvider } from "@/lib/images/fake-image-provider";

const databases: Database[] = [];

afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

async function eventually<T>(read: () => Promise<T | null>): Promise<T> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for image Agent Run materialization.");
}

class MemoryAssetStore implements AssetStore {
  private readonly values = new Map<string, Uint8Array>();
  async put(uri: string, content: Uint8Array, mimeType: string): Promise<StoredAsset> { this.values.set(uri, content); return { uri, mimeType, byteLength: content.byteLength }; }
  async get(uri: string): Promise<Uint8Array> { const value = this.values.get(uri); if (!value) throw new Error("missing asset"); return value; }
  async exists(uri: string): Promise<boolean> { return this.values.has(uri); }
}

describe("reference generation", () => {
  it("generates persisted canonical assets in order and updates only the Visual Bible version", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "Robin shares rainwater." });
    const artifacts = new ArtifactService({ database });
    await artifacts.revise(booklet.id, "audience_profile", { schemaVersion: SCHEMA_VERSION, ageBand: "6-8", interests: ["gardens"], readingNeeds: "Clear sentences", tone: "Warm", avoidList: [], knownFacts: ["garden"], openAssumptions: [] }, { createdBy: "agent" });
    let detail = await artifacts.get(booklet.id, "audience_profile");
    await artifacts.approve(booklet.id, "audience_profile", detail.currentVersion!.id);
    const robin = "00000000-0000-4000-8000-000000000711";
    const garden = "00000000-0000-4000-8000-000000000712";
    await artifacts.revise(booklet.id, "story_plan", { schemaVersion: SCHEMA_VERSION, premise: "Robin shares rainwater.", theme: "Care", characters: [{ entityId: robin, name: "Robin", narrativeRole: "hero", goal: "Share water", relationships: [], named: true, continuityRelevant: true, recurringVisualSubject: true }], settings: [{ entityId: garden, name: "Garden", narrativeRole: "setting", named: true, continuityRelevant: true, recurringVisualSubject: true }], storyArc: "Robin learns to share.", keyEvents: ["Robin finds water."], ending: "Everyone shares.", ageFitNotes: "Ages 6–8", continuityConstraints: ["Keep the garden calm."] }, { createdBy: "agent" });
    detail = await artifacts.get(booklet.id, "story_plan");
    await artifacts.approve(booklet.id, "story_plan", detail.currentVersion!.id);
    await artifacts.revise(booklet.id, "visual_style", { schemaVersion: SCHEMA_VERSION, styleId: "soft-watercolor", name: "Soft watercolor", rationale: "Warm", visualDirection: "Soft", palette: ["blue"], texture: "Paper", lighting: "Morning", styleReferenceAssetIds: ["00000000-0000-4000-8000-000000000001"] }, { createdBy: "agent" });
    detail = await artifacts.get(booklet.id, "visual_style");
    await artifacts.approve(booklet.id, "visual_style", detail.currentVersion!.id);
    await artifacts.revise(booklet.id, "visual_bible", { schemaVersion: SCHEMA_VERSION, characters: [{ entityId: robin, name: "Robin", visualDetails: ["Red chest"], continuityConstraints: ["Keep red chest."], referenceRequired: true, currentReferenceAssetId: null, revisionNumber: 1 }], locations: [{ entityId: garden, name: "Garden", visualDetails: ["Round pond"], continuityConstraints: ["Keep pond."], referenceRequired: true, currentReferenceAssetId: null, revisionNumber: 1 }], styleReferences: ["00000000-0000-4000-8000-000000000001"] }, { createdBy: "agent" });

    const assets = new MemoryAssetStore();
    const generation = new GenerationService({ database, artifacts, assets, provider: new FakeImageProvider(), imageModel: "fake-image", imageQuality: "low" });
    const job = await generation.createReferenceJob(booklet.id);
    await generation.runReferenceJob(booklet.id, job.id);
    const items = await eventually(async () => {
      const current = await (await import("@/db/repositories")).createRepositories(database).jobs.getItems(job.id);
      return current.every((item) => item.status === "succeeded") ? current : null;
    });
    const bible = await eventually(async () => {
      const current = await artifacts.get(booklet.id, "visual_bible");
      const value = current.currentVersion?.content as { characters?: Array<{ currentReferenceAssetId: string | null }> } | undefined;
      return value?.characters?.[0]?.currentReferenceAssetId ? current : null;
    });
    const content = bible.currentVersion?.content as { characters: Array<{ currentReferenceAssetId: string | null }>; locations: Array<{ currentReferenceAssetId: string | null }> };

    expect(items.map((item) => item.status)).toEqual(["succeeded", "succeeded"]);
    expect(items.map((item) => (item.input as { request: { quality: string } }).request.quality)).toEqual(["low", "low"]);
    expect(content.characters[0]?.currentReferenceAssetId).toBeTruthy();
    expect(content.locations[0]?.currentReferenceAssetId).toBeTruthy();
    const selectedAsset = await (await import("@/db/repositories")).createRepositories(database).assets.get(content.characters[0]!.currentReferenceAssetId!);
    expect(selectedAsset?.metadata).toMatchObject({ candidate: true });
    const executionItem = await database.collections.execution_items.findOne({ candidateAssetId: selectedAsset!.id });
    expect(executionItem).toMatchObject({ status: "succeeded" });
    expect(await assets.exists(selectedAsset!.uri)).toBe(true);
    expect(bible.currentVersion?.versionNumber).toBe(2);
  });

  it("composes only the selected page candidate into the generation item", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "A child discovers a garden book." });
    const repositories = (await import("@/db/repositories")).createRepositories(database);
    const assets = new MemoryAssetStore();
    const jobId = "00000000-0000-4000-8000-000000000751";
    const itemId = "00000000-0000-4000-8000-000000000752";
    const page = { schemaVersion: "1", pageId: "00000000-0000-4000-8000-000000000753", pageIndex: 0, kind: "cover", sceneAction: "A child opens a bright book.", characterIds: [], locationIds: [], incidentalVisualDetails: [], compositionIntent: "Keep the title clear.", continuityNotes: [], readerText: "A bright adventure begins.", relevantReferenceIds: [], textSafeRegion: { x: 0.1, y: 0.72, width: 0.8, height: 0.2 } };
    const request = { schemaVersion: "1" as const, operation: "generate" as const, model: "fake-image", prompt: "A bright book in a garden.", promptPlan: { purpose: "cover", subject: "child", action: "opens a book", location: "garden", visualStyle: "watercolor", continuityConstraints: [], preserve: [] }, geometry: "square_1_1" as const, quality: "low" as const, references: [], editTargetAssetId: null };
    await repositories.jobs.createOrGet({ id: jobId, bookletId: booklet.id, jobType: "pages", idempotencyKey: `page-agent-run:${booklet.id}`, input: {}, items: [{ id: itemId, itemKey: "page:cover", position: 0, input: { page, geometry: "square_1_1", request } }], createdAtMs: Date.now() });
    const claimed = await repositories.jobs.claimNextPending(jobId, Date.now());
    await new ImageAgentRunService({ database, repositories, assets, runtimeMode: "fake" }).createReady({ bookletId: booklet.id, jobId, itemId: claimed!.id, itemKey: claimed!.itemKey, position: claimed!.position, target: "page", subjectLabel: "the cover", request, page });
    const completed = await eventually(async () => { const items = await repositories.jobs.getItems(jobId); return items[0]?.status === "succeeded" ? items[0] : null; });
    expect(completed.assetId).toBeTruthy();
    const result = completed.result as { sourceAssetId: string; composedAssetId: string; executionBatchId: string };
    expect(result).toMatchObject({ sourceAssetId: expect.any(String), composedAssetId: completed.assetId, executionBatchId: expect.any(String) });
    const composed = await repositories.assets.get(completed.assetId!);
    expect(composed).toMatchObject({ kind: "page_composed", sourceAssetId: result.sourceAssetId });
    expect(await assets.exists(composed!.uri)).toBe(true);
  });});
