import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/db/client";
import type { AssetStore, StoredAsset } from "@/lib/assets/asset-store";
import { ArtifactService } from "@/lib/application/artifact-service";
import { BookletService } from "@/lib/application/booklet-service";
import { GenerationService } from "@/lib/application/generation-service";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import { FakeImageProvider } from "@/lib/images/fake-image-provider";

const databases: Array<ReturnType<typeof createDatabase>> = [];
afterEach(() => databases.splice(0).forEach((database) => database.$client.close()));

class MemoryAssetStore implements AssetStore {
  private readonly values = new Map<string, Uint8Array>();
  async put(uri: string, content: Uint8Array, mimeType: string): Promise<StoredAsset> { this.values.set(uri, content); return { uri, mimeType, byteLength: content.byteLength }; }
  async get(uri: string): Promise<Uint8Array> { const value = this.values.get(uri); if (!value) throw new Error("missing asset"); return value; }
  async exists(uri: string): Promise<boolean> { return this.values.has(uri); }
}

describe("reference generation", () => {
  it("generates persisted canonical assets in order and updates only the Visual Bible version", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "kids-reference-generation-"));
    const database = createDatabase(`file:${path.join(directory, "booklets.db")}`);
    databases.push(database);
    await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
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
    const generation = new GenerationService({ database, artifacts, assets, provider: new FakeImageProvider(), imageModel: "fake-image" });
    const job = await generation.createReferenceJob(booklet.id);
    await generation.runReferenceJob(booklet.id, job.id);
    const items = await (await import("@/db/repositories")).createRepositories(database).jobs.getItems(job.id);
    const bible = await artifacts.get(booklet.id, "visual_bible");
    const content = bible.currentVersion?.content as { characters: Array<{ currentReferenceAssetId: string | null }>; locations: Array<{ currentReferenceAssetId: string | null }> };

    expect(items.map((item) => item.status)).toEqual(["succeeded", "succeeded"]);
    expect(content.characters[0]?.currentReferenceAssetId).toBeTruthy();
    expect(content.locations[0]?.currentReferenceAssetId).toBeTruthy();
    expect(await assets.exists(`${booklet.id}/references/characters/${robin}/${content.characters[0]?.currentReferenceAssetId}.png`)).toBe(true);
    expect(bible.currentVersion?.versionNumber).toBe(2);
  });
});
