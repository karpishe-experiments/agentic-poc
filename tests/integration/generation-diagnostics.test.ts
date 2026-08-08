import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import type { AssetStore, StoredAsset } from "@/lib/assets/asset-store";
import { BookletService } from "@/lib/application/booklet-service";
import { GenerationService } from "@/lib/application/generation-service";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import { imageRequestSchema, imageResultSchema } from "@/lib/contracts/images";
import { FakeImageProvider } from "@/lib/images/fake-image-provider";
import type { ImageProvider } from "@/lib/images/provider";
import { GenerationDiagnostics } from "@/lib/jobs/generation-diagnostics";

const databases: Array<ReturnType<typeof createDatabase>> = [];

afterEach(() => {
  databases.splice(0).forEach((database) => database.$client.close());
  vi.restoreAllMocks();
});

class MemoryAssetStore implements AssetStore {
  private readonly values = new Map<string, Uint8Array>();
  async put(uri: string, content: Uint8Array, mimeType: string): Promise<StoredAsset> { this.values.set(uri, content); return { uri, mimeType, byteLength: content.byteLength }; }
  async get(uri: string): Promise<Uint8Array> { const value = this.values.get(uri); if (!value) throw new Error("missing asset"); return value; }
  async exists(uri: string): Promise<boolean> { return this.values.has(uri); }
}

function request() {
  return imageRequestSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    operation: "generate",
    model: "fake-image",
    promptPlan: {
      purpose: "canonical visual reference",
      subject: "Robin",
      action: "Create a clear reference pose.",
      location: "A calm garden",
      visualStyle: "Soft watercolor",
      continuityConstraints: ["Keep the red chest."],
      preserve: ["Recognizable red chest."],
    },
    prompt: "A safe test prompt that must not appear in diagnostics.",
    geometry: "square_1_1",
    quality: "balanced",
    references: [],
    editTargetAssetId: null,
  });
}

describe("generation diagnostics", () => {
  it("persists a safe failure trail, a waiting heartbeat, and continues to the next item", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const directory = await mkdtemp(path.join(os.tmpdir(), "kids-generation-diagnostics-"));
    const database = createDatabase(`file:${path.join(directory, "booklets.db")}`);
    databases.push(database);
    await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
    const booklet = await new BookletService({ database }).create({ idea: "Robin shares rainwater." });
    const repositories = createRepositories(database);
    const fake = new FakeImageProvider();
    let calls = 0;
    const provider: ImageProvider = {
      runtime: fake.runtime,
      capabilities: fake.capabilities,
      async execute(input) {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error("simulated provider connection reset"), { status: 503, code: "ECONNRESET", type: "server_error", request_id: "req_diagnostic" });
        await new Promise((resolve) => setTimeout(resolve, 15));
        return fake.execute(input);
      },
    };
    const jobId = randomUUID();
    const firstItemId = randomUUID();
    const secondItemId = randomUUID();
    await repositories.jobs.createOrGet({
      id: jobId,
      bookletId: booklet.id,
      jobType: "references",
      idempotencyKey: `diagnostics:${jobId}`,
      input: {},
      createdAtMs: Date.now(),
      items: [
        { id: firstItemId, itemKey: "character:00000000-0000-4000-8000-000000000711", position: 0, input: { item: { entityId: "00000000-0000-4000-8000-000000000711", kind: "character", name: "Robin", visualDetails: ["Red chest"], continuityConstraints: [], referenceRequired: true }, request: request() } },
        { id: secondItemId, itemKey: "location:00000000-0000-4000-8000-000000000712", position: 1, input: { item: { entityId: "00000000-0000-4000-8000-000000000712", kind: "location", name: "Garden", visualDetails: ["Round pond"], continuityConstraints: [], referenceRequired: true }, request: request() } },
      ],
    });
    const diagnosticsRoot = path.join(directory, "diagnostic-output");
    const generation = new GenerationService({
      database,
      repositories,
      assets: new MemoryAssetStore(),
      provider,
      imageModel: "fake-image",
      diagnostics: new GenerationDiagnostics(diagnosticsRoot),
      diagnosticWaitMs: 1,
    });

    await generation.runReferenceJob(booklet.id, jobId);

    const items = await repositories.jobs.getItems(jobId);
    const trail = (await readFile(path.join(diagnosticsRoot, "diagnostics", "jobs", `${jobId}.ndjson`), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { event: string; error?: { status?: number; code?: string; requestId?: string } });

    expect(items.map((item) => item.status)).toEqual(["failed", "succeeded"]);
    expect(trail).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "provider_request_started", itemId: firstItemId }),
      expect.objectContaining({ event: "provider_request_threw", itemId: firstItemId, error: expect.objectContaining({ status: 503, code: "ECONNRESET", requestId: "req_diagnostic" }) }),
      expect.objectContaining({ event: "job_item_failed", itemId: firstItemId }),
      expect.objectContaining({ event: "provider_request_still_waiting", itemId: secondItemId }),
      expect.objectContaining({ event: "provider_request_completed", itemId: secondItemId, resultStatus: "succeeded" }),
    ]));
    expect(JSON.stringify(trail)).not.toContain("A safe test prompt");
  });

  it("halts on exhausted billing and resumes the failed item plus retained pending items after retry", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const directory = await mkdtemp(path.join(os.tmpdir(), "kids-generation-blocked-"));
    const database = createDatabase(`file:${path.join(directory, "booklets.db")}`);
    databases.push(database);
    await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
    const booklet = await new BookletService({ database }).create({ idea: "Robin shares rainwater." });
    const repositories = createRepositories(database);
    const fake = new FakeImageProvider();
    let balanceAvailable = false;
    let calls = 0;
    const provider: ImageProvider = {
      runtime: "real",
      capabilities: fake.capabilities,
      async execute(input) {
        calls += 1;
        if (balanceAvailable) return fake.execute(input);
        return imageResultSchema.parse({
          status: "failed",
          provider: "openai",
          model: input.model,
          providerRequestId: null,
          mimeType: null,
          bytesBase64: null,
          width: null,
          height: null,
          usage: null,
          error: {
            kind: "blocked",
            message: "You have no credits remaining.",
            providerError: { status: 429, code: "credit_balance_exhausted", type: "insufficient_quota", requestId: null },
          },
        });
      },
    };
    const jobId = randomUUID();
    const failedItemId = randomUUID();
    const pendingItemId = randomUUID();
    await repositories.jobs.createOrGet({
      id: jobId,
      bookletId: booklet.id,
      jobType: "references",
      idempotencyKey: `blocked:${jobId}`,
      input: {},
      createdAtMs: Date.now(),
      items: [
        { id: failedItemId, itemKey: "character:00000000-0000-4000-8000-000000000721", position: 0, input: { item: { entityId: "00000000-0000-4000-8000-000000000721", kind: "character", name: "Robin", visualDetails: ["Red chest"], continuityConstraints: [], referenceRequired: true }, request: request() } },
        { id: pendingItemId, itemKey: "location:00000000-0000-4000-8000-000000000722", position: 1, input: { item: { entityId: "00000000-0000-4000-8000-000000000722", kind: "location", name: "Garden", visualDetails: ["Round pond"], continuityConstraints: [], referenceRequired: true }, request: request() } },
      ],
    });
    const generation = new GenerationService({
      database,
      repositories,
      assets: new MemoryAssetStore(),
      provider,
      imageModel: "fake-image",
      diagnostics: new GenerationDiagnostics(path.join(directory, "diagnostic-output")),
      diagnosticWaitMs: 0,
    });

    await generation.runReferenceJob(booklet.id, jobId);

    expect(calls).toBe(1);
    expect(await repositories.jobs.getStatus(jobId)).toMatchObject({
      status: "failed",
      items: [
        { id: failedItemId, status: "failed", attemptCount: 1 },
        { id: pendingItemId, status: "pending", attemptCount: 0 },
      ],
    });
    expect(await repositories.jobs.listActiveByBooklet(booklet.id)).toEqual([
      expect.objectContaining({ id: jobId, status: "failed", progress: { completed: 0, total: 2 } }),
    ]);

    // Existing jobs may have persisted this provider code as transient before the classifier was fixed.
    await repositories.jobs.failItem({
      jobId,
      itemId: failedItemId,
      error: {
        kind: "transient",
        message: "You have no credits remaining.",
        providerError: { status: 429, code: "credit_balance_exhausted", type: "insufficient_quota", requestId: null },
      },
      finishedAtMs: Date.now(),
    });
    await generation.runReferenceJob(booklet.id, jobId);
    expect(calls).toBe(1);
    expect(await repositories.jobs.getStatus(jobId)).toMatchObject({ status: "failed" });

    balanceAvailable = true;
    await generation.retryReferenceItem(booklet.id, jobId, failedItemId);

    expect(calls).toBe(3);
    expect(await repositories.jobs.getStatus(jobId)).toMatchObject({
      status: "succeeded",
      items: [
        { id: failedItemId, status: "succeeded", attemptCount: 2 },
        { id: pendingItemId, status: "succeeded", attemptCount: 1 },
      ],
    });
  });
});
