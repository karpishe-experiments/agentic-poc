import { describe, expect, it, vi, beforeEach } from "vitest";
import { currentRealImageRequest } from "@/db/experiment-real-image-preparation";
import { imageRequestFingerprint, type ExperimentImageRequest } from "@/lib/contracts/experiment-image";
import { REAL_IMAGE_MODEL } from "@/lib/experiment-runner/real-image-contract";
import type { Database } from "@/db/client";
import type { ExperimentRunDocument, ExperimentOperationDocument } from "@/db/documents";
import type { AssetStore } from "@/lib/assets/asset-store";
import type { ClientSession } from "mongodb";

const mocks = vi.hoisted(() => ({ pageSources: vi.fn(), otherSources: vi.fn(), current: vi.fn(), policy: vi.fn() }));
vi.mock("@/db/experiment-pages", () => ({ verifyCurrentPageIllustrationSources: mocks.pageSources }));
vi.mock("@/db/experiment-images", () => ({ assertCurrentImageSources: mocks.otherSources }));
vi.mock("@/db/experiment-execution-allowance", () => ({ createExecutionAllowanceLedger: () => ({ current: mocks.current }) }));
vi.mock("@/lib/experiment-runner/execution-policy", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/experiment-runner/execution-policy")>(), executionPolicySnapshot: mocks.policy,
}));

const assetId = "00000000-0000-4000-8000-000000000001";
const versionId = "00000000-0000-4000-8000-000000000002";
const reference = { assetId, artifactVersionId: versionId, sha256: "a".repeat(64), byteLength: 3,
  mimeType: "image/png", width: 1024, height: 1024 };
const logical: ExperimentImageRequest = { kind: "page_source", prompt: "A complete illustrated page", sourceVersionIds: [versionId], styleVersionId: null };
const run = { mode: "real", execution: { campaignId: "campaign" } } as ExperimentRunDocument;
const database = {} as Database;
const session = {} as ClientSession;
const store = {} as AssetStore;
function operation(taskId = "J13", request: ExperimentImageRequest = logical): ExperimentOperationDocument {
  return { mode: "real", providerKind: "image", taskId, subjectId: "page", imageRequestJson: JSON.stringify(request),
    inputFingerprint: imageRequestFingerprint(request), dependencyVersionIds: request.sourceVersionIds,
    deadlineAtMs: 1_000_000, referenceUploadsJson: JSON.stringify([{ ...reference, uploadFileId: "file" }]) } as ExperimentOperationDocument;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.current.mockResolvedValue({ profileJson: "{}" });
  mocks.policy.mockReturnValue({ policy: { mode: "real", realImage: { model: REAL_IMAGE_MODEL, size: "1024x1024",
    quality: "high", background: "opaque", outputFormat: "png", n: 1, retries: 0, timeoutSeconds: 120,
    pageSizePolicy: "approved_canvas_orientation_v1" } } });
  mocks.pageSources.mockImplementation(async () => ({ request: { request: logical },
    layout: { canvas: { orientation: "portrait" } }, attachments: [reference] }));
});

describe("Real image current request", () => {
  it.each([
    ["portrait", "1024x1536"], ["landscape", "1536x1024"], ["square", "1024x1024"],
  ] as const)("maps verified %s canvas to %s for v3", async (orientation, expected) => {
    mocks.pageSources.mockResolvedValue({ request: { request: logical }, layout: { canvas: { orientation } }, attachments: [reference] });
    const result = await currentRealImageRequest(database, session, run, operation(), store);
    expect(result).toMatchObject({ operation: "edit", size: expected, references: [{ assetId, versionId }] });
    expect(result.requestDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each(["execution_v1", "execution_v2"])("retains fixed square for %s", async () => {
    mocks.policy.mockReturnValue({ policy: { mode: "real", realImage: { model: REAL_IMAGE_MODEL, size: "1024x1024",
      quality: "high", background: "opaque", outputFormat: "png", n: 1, retries: 0, timeoutSeconds: 120 } } });
    expect((await currentRealImageRequest(database, session, run, operation(), store)).size).toBe("1024x1024");
  });

  it.each(["J08", "J09", "J10"])("preserves %s reference generation settings", async taskId => {
    const result = await currentRealImageRequest(database, session, run, operation(taskId), store);
    expect(result).toMatchObject({ operation: "generate", size: "1024x1024", references: [] });
    expect(mocks.otherSources).toHaveBeenCalledOnce();
    expect(mocks.pageSources).not.toHaveBeenCalled();
  });

  it("rejects stale page sources and tampered logical digest", async () => {
    mocks.pageSources.mockResolvedValue({ request: { request: { ...logical, prompt: "changed" } },
      layout: { canvas: { orientation: "portrait" } }, attachments: [reference] });
    await expect(currentRealImageRequest(database, session, run, operation(), store)).rejects.toThrow("sources changed");
    expect(mocks.otherSources).not.toHaveBeenCalled();
    const tampered = { ...operation(), inputFingerprint: "0".repeat(64) } as ExperimentOperationDocument;
    await expect(currentRealImageRequest(database, session, run, tampered, store)).rejects.toThrow("logical request differs");
  });

  it("rejects uploaded reference evidence that differs from verified current sources", async () => {
    const stale = { ...operation(), referenceUploadsJson: JSON.stringify([{ ...reference, sha256: "b".repeat(64), uploadFileId: "file" }]) } as ExperimentOperationDocument;
    await expect(currentRealImageRequest(database, session, run, stale, store)).rejects.toThrow("original references differ");
  });
});
