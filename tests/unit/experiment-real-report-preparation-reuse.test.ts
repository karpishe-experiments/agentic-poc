import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRealReportPreparation } from "@/db/experiment-real-report-preparation";
import type { AssetStore } from "@/lib/assets/asset-store";
import type { Database } from "@/db/client";
import type { BookletBinding } from "@/lib/experiment-runner/config";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), metadata: vi.fn(), validate: vi.fn() }));
vi.mock("@/db/client", () => ({ withMongoTransaction: async (_database: unknown, work: (session: object) => Promise<unknown>) => work({}) }));
vi.mock("@/db/experiment-completion", () => ({ verifyExperimentGeneration: mocks.verify }));
vi.mock("@/db/experiment-verification-metadata", () => ({ verificationMetadata: mocks.metadata }));
vi.mock("@/lib/experiment-runner/image-validation", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/experiment-runner/image-validation")>(), validateExperimentImage: mocks.validate,
}));
vi.mock("@/lib/experiment-runner/execution-policy", () => ({ executionPolicySnapshot: () => ({ hash: "profile", policy: { mode: "real", tokenPolicy: {}, publications: [{ role: "tester", taskId: null, persona: "playful_kid", appId: "app", publishedWorkflowId: "workflow" }] } }) }));
vi.mock("@/lib/experiment-runner/m4-request", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/experiment-runner/m4-request")>(),
  m4Hash: () => "request-digest", m4AuthorizedCarrier: () => ({ requestJson: "{}" }), m4CanonicalJson: JSON.stringify,
}));
vi.mock("@/lib/experiment-runner/real-report-carrier", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/experiment-runner/real-report-carrier")>(),
  realReportCarrier: ({ images }: { images: Array<{ manifest: unknown }> }) => ({ carrierJson: "carrier", carrier: { manifestDigest: "manifest", finalRequestDigest: "final", textRequestDigest: "text", orderedImages: images.map(image => image.manifest) } }),
}));

describe("Real report preparation transaction original reads", () => {
  const originals = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];
  const assets = originals.map((bytes, index) => ({ _id: `asset-${index}`, bookletId: "book", uri: `image-${index}`,
    metadataJson: JSON.stringify({ sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.byteLength }),
    mimeType: "image/png", width: 1, height: 1 }));
  let run: Record<string, unknown>;
  let operation: Record<string, unknown>;
  let get: ReturnType<typeof vi.fn>;
  let preparation: ReturnType<typeof createRealReportPreparation>;
  let upload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    run = { _id: "run", bookletId: "book", mode: "real", persona: "playful_kid", execution: { profileJson: "{}", profileHash: "profile" },
      activeOperationId: "report", status: "running", pauseRequested: false, revision: 1 };
    operation = { _id: "report", runId: "run", mode: "real", role: "tester", providerKind: "text", state: "prepared",
      dispatchStartedAtMs: null, reservationCount: 0, deadlineAtMs: 1_000_000_000, m4Preparation: { requestJson: "{}", requestDigest: "request-digest" },
      realReportUploadJournalJson: undefined };
    const stored = new Map(assets.map((asset, index) => [asset.uri, originals[index]!]));
    get = vi.fn(async (uri: string) => stored.get(uri)!);
    const database = { collections: {
      experiment_runs: { findOne: vi.fn(async () => run), updateOne: vi.fn(async () => ({ modifiedCount: 1 })) },
      experiment_operations: { findOne: vi.fn(async () => operation), updateOne: vi.fn(async (_filter: unknown, change: { $set: Record<string, unknown> }) => {
        Object.assign(operation, change.$set); return { modifiedCount: 1 };
      }) },
    } } as unknown as Database;
    mocks.metadata.mockResolvedValue({ assets });
    mocks.verify.mockImplementation(async (_db, _session, _run, _store, _id, _phase, _now, _reads, attempt) => {
      for (const asset of assets) {
        const evidence = JSON.parse(asset.metadataJson);
        await attempt.read({ assetId: asset._id, uri: asset.uri, ...evidence });
      }
      return { finalPages: assets.map((asset, index) => ({ assetId: asset._id, versionId: `version-${index}` })) };
    });
    mocks.validate.mockImplementation(async (bytes: Uint8Array) => ({ mimeType: "image/png", width: 1, height: 1,
      byteLength: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") }));
    upload = vi.fn(async (_binding: BookletBinding, _runId: string, bytes: Uint8Array) => ({ kind: "uploaded" as const, id: `file-${upload.mock.calls.length}`,
      sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.byteLength, mimeType: "image/png" as const }));
    preparation = createRealReportPreparation({ database, store: { get } as unknown as AssetStore,
      upload: upload as unknown as Parameters<typeof createRealReportPreparation>[0]["upload"] });
  });

  const identity = { runId: "run", operationId: "report", nowMs: 1 };
  const binding = { appId: "app", publishedWorkflowId: "workflow" } as BookletBinding;

  it("uses one GET per final original in each current transaction across upload boundaries", async () => {
    expect(await preparation.prepare(identity, binding)).toMatchObject({ kind: "ready", fileIds: ["file-1", "file-2"] });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(get.mock.calls.map(call => call[0])).toEqual(["image-0", "image-1", "image-0", "image-1", "image-0", "image-1"]);
  });

  it("rejects changed original bytes on the next current transaction", async () => {
    get.mockImplementation(async (uri: string) => uri === "image-0" && upload.mock.calls.length > 0 ? new Uint8Array([9, 9, 9]) : originals[Number(uri.slice(-1))]!);
    await expect(preparation.prepare(identity, binding)).rejects.toThrow("Image digest differs");
    expect(upload).toHaveBeenCalledTimes(1);
    expect(get.mock.calls.map(call => call[0])).toEqual(["image-0", "image-1", "image-0"]);
  });
});
