import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { createRepositories } from "@/db/repositories";
import type { AssetStore, StoredAsset } from "@/lib/assets/asset-store";
import { BookletService } from "@/lib/application/booklet-service";
import { GenerationService } from "@/lib/application/generation-service";
import { CandidateExecutionService } from "@/lib/application/candidate-execution-service";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import { imageRequestSchema } from "@/lib/contracts/images";
import { genUICardSchema } from "@/lib/contracts/cards";
import { FakeImageProvider } from "@/lib/images/fake-image-provider";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); vi.restoreAllMocks(); });

class MemoryAssetStore implements AssetStore {
  private readonly values = new Map<string, Uint8Array>();
  async put(uri: string, content: Uint8Array, mimeType: string): Promise<StoredAsset> { this.values.set(uri, content); return { uri, mimeType, byteLength: content.byteLength }; }
  async get(uri: string): Promise<Uint8Array> { const value = this.values.get(uri); if (!value) throw new Error("missing asset"); return value; }
  async exists(uri: string): Promise<boolean> { return this.values.has(uri); }
}

function request() {
  return imageRequestSchema.parse({
    schemaVersion: SCHEMA_VERSION, operation: "generate", model: "fake-image", quality: "disabled", geometry: "square_1_1", references: [], editTargetAssetId: null,
    promptPlan: { purpose: "canonical visual reference", subject: "Robin", action: "Create a clear reference pose.", location: "A calm garden", visualStyle: "Soft watercolor", continuityConstraints: ["Keep the red chest."], preserve: ["Recognizable red chest."] },
    prompt: "A safe test prompt that must not appear in execution evidence.",
  });
}

async function waitFor(assertion: () => Promise<void>, attempts = 80) {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { await assertion(); return; } catch (error) { last = error; await new Promise((resolve) => setTimeout(resolve, 15)); }
  }
  throw last;
}

describe("generation diagnostics", () => {
  it("persists a safe Agent run failure and leaves the next item pending", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "Robin shares rainwater." });
    const repositories = createRepositories(database);
    vi.spyOn(CandidateExecutionService.prototype, "executeImage").mockRejectedValue(new Error("simulated provider connection reset"));
    const jobId = "00000000-0000-4000-8000-000000000711";
    const firstItemId = "00000000-0000-4000-8000-000000000712";
    const secondItemId = "00000000-0000-4000-8000-000000000713";
    await repositories.jobs.createOrGet({
      id: jobId, bookletId: booklet.id, jobType: "references", idempotencyKey: `diagnostics:${jobId}`, input: {}, createdAtMs: Date.now(),
      items: [
        { id: firstItemId, itemKey: "character:00000000-0000-4000-8000-000000000714", position: 0, input: { item: { entityId: "00000000-0000-4000-8000-000000000714", kind: "character", name: "Robin", visualDetails: ["Red chest"], continuityConstraints: [], referenceRequired: true }, request: request() } },
        { id: secondItemId, itemKey: "location:00000000-0000-4000-8000-000000000715", position: 1, input: { item: { entityId: "00000000-0000-4000-8000-000000000715", kind: "location", name: "Garden", visualDetails: ["Round pond"], continuityConstraints: [], referenceRequired: true }, request: request() } },
      ],
    });

    await new GenerationService({ database, repositories, assets: new MemoryAssetStore(), provider: new FakeImageProvider(), imageModel: "fake-image" }).runReferenceJob(booklet.id, jobId);
    await waitFor(async () => {
      const items = await repositories.jobs.getItems(jobId);
      expect(items).toMatchObject([{ id: firstItemId, status: "failed" }, { id: secondItemId, status: "pending" }]);
    });
    const card = genUICardSchema.parse(await repositories.conversation.getActiveCard(booklet.id));
    if (card.family !== "agent_run" || !card.payload.batchId) throw new Error("Expected failed Agent run card.");
    const executionItems = await repositories.execution.getItems(card.payload.batchId);
    expect(executionItems).toContainEqual(expect.objectContaining({ status: "failed", safeError: expect.objectContaining({ message: "simulated provider connection reset" }) }));
  });
});
