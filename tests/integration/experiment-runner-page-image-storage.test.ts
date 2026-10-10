import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExperimentImageRepository } from "@/db/experiment-images";
import { createExperimentImageStorage } from "@/lib/experiment-runner/image-storage";
import { validateExperimentImage } from "@/lib/experiment-runner/image-validation";
import type { AssetStore } from "@/lib/assets/asset-store";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const { verifySources } = vi.hoisted(() => ({ verifySources: vi.fn() }));
vi.mock("@/db/experiment-pages", () => ({ verifyCurrentPageIllustrationSources: verifySources }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const databases: Database[] = [];
afterEach(async () => { verifySources.mockReset(); await Promise.all(databases.splice(0).map(closeTestDatabase)); });

async function setup() {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const runId = id(1), bookletId = id(2), operationId = id(3), pageId = id(4);
  const configuration = [{ role: "manager", taskId: null },
    ...Array.from({ length: 12 }, (_, index) => ({ role: "specialist", taskId: `J${String(index + 1).padStart(2, "0")}` })),
    { role: "tester", taskId: null }, { role: "image", taskId: null, finalPageIllustration: true }]
    .map((item, index) => ({ ...item, appId: id(100 + index), publishedWorkflowId: id(200 + index), toolProviderId: null }));
  await createExperimentRepository(database).createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration, nowMs: 1 });
  const request = { kind: "page_source" as const, prompt: "Saved exact lettering and style", sourceVersionIds: [id(10), id(11)], styleVersionId: id(11) };
  const identity = { runId, operationId, workflowRunId: id(5), parentWorkflowRunId: id(6), inputFingerprint: imageRequestFingerprint(request) };
  await database.collections.experiment_operations.insertOne({ _id: operationId, runId, role: "image", taskId: "J13",
    subjectKind: "page", subjectId: pageId, mode: "simulated", providerKind: "image", state: "started", attempt: 1,
    idempotencyKey: "page", inputFingerprint: identity.inputFingerprint, workflowRunId: identity.workflowRunId,
    parentWorkflowRunId: identity.parentWorkflowRunId, dispatchStartedAtMs: 2, reservationCount: 1, deadlineAtMs: 600_002,
    imageRequestJson: JSON.stringify(request), dependencyVersionIds: request.sourceVersionIds, expectedTargetVersionId: null,
    resultJson: null, resultDigest: null, materializationJson: null, warningsJson: "[]", safeFailure: null, createdAtMs: 2, updatedAtMs: 2 });
  await database.collections.experiment_runs.updateOne({ _id: runId }, { $set: { activeOperationId: operationId, status: "running" } });
  const files = new Map<string, Uint8Array>();
  const store: AssetStore = {
    put: vi.fn(async (uri, content, mimeType) => { files.set(uri, Uint8Array.from(content)); return { uri, mimeType, byteLength: content.byteLength }; }),
    async get(uri) { const bytes = files.get(uri); if (!bytes) throw new Error("missing"); return Uint8Array.from(bytes); },
    async exists(uri) { return files.has(uri); },
  };
  verifySources.mockResolvedValue({ request: { request }, attachments: [], warnings: [] });
  const content = new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: "#66aadd" } }).png().toBuffer());
  return { database, runId, operationId, identity, request, content, store, files,
    images: createExperimentImageRepository(database, { store: () => store }),
    storage: createExperimentImageStorage({ database, store, now: () => 3 }) };
}

describe("J13 fixture and original-image storage source checks", () => {
  it("rolls back the early lease write when claim source verification fails", async () => {
    const env = await setup();
    verifySources.mockRejectedValue(new Error("Sources changed before claim."));
    await expect(env.images.claim({ ...env.identity,
      validatedImage: await validateExperimentImage(env.content), claimId: id(900), nowMs: 3,
    })).rejects.toThrow("Sources changed before claim.");
    const operation = await env.database.collections.experiment_operations.findOne({ _id: env.operationId });
    expect(operation?.imageCompletionClaim).toBeUndefined();
    expect(operation?.imageCompletionDigest).toBeUndefined();
    expect(operation?.state).toBe("started");
  });

  it("keeps observation writes out of the final source verification transaction", async () => {
    const env = await setup();
    const repository = createExperimentRepository(env.database);
    let finalChecks = 0;
    verifySources.mockImplementation(async (...args) => {
      if (args[5]?.verifyBytes !== false) {
        finalChecks++;
        expect(await repository.beginObservation(env.operationId, 4)).toBeNull();
        await repository.requestObservation(env.operationId);
      }
      return { request: { request: env.request }, attachments: [], warnings: [] };
    });
    const saved = await env.storage.complete({ identity: env.identity, content: env.content });
    expect(saved.operation.state).toBe("succeeded");
    expect(finalChecks).toBe(1);
    expect(await repository.beginObservation(env.operationId, 5)).not.toBeNull();
  });

  it("uses the supplied original asset store at fixture, claim and finalization", async () => {
    const env = await setup();
    expect(await env.images.authorizeFixture(env.identity)).toEqual(env.request);
    const saved = await env.storage.complete({ identity: env.identity, content: env.content });
    expect(saved.reused).toBe(false);
    if (!saved.asset) throw new Error("Completed image has no saved asset.");
    expect(saved.asset.kind).toBe("page_source");
    expect(await env.store.get(saved.asset.uri)).toEqual(env.content);
    expect(verifySources).toHaveBeenCalledTimes(4);
    expect(verifySources.mock.calls.slice(0, 3).every((call) => call[5]?.verifyBytes === false)).toBe(true);
    expect(verifySources.mock.calls[3]?.[5]?.verifyBytes).toBe(true);
    expect(verifySources.mock.calls.every((call) => call[4] === env.store)).toBe(true);
    expect((await env.storage.complete({ identity: env.identity, content: env.content })).reused).toBe(true);
    expect(await env.database.collections.assets.countDocuments({ _id: env.operationId })).toBe(1);
  });

  it("rejects stale source bytes before fixture or output storage", async () => {
    const env = await setup(); verifySources.mockRejectedValue(new Error("Selected reference bytes changed."));
    await expect(env.images.authorizeFixture(env.identity)).rejects.toThrow("Selected reference bytes changed.");
    await expect(env.storage.complete({ identity: env.identity, content: env.content })).rejects.toThrow("Selected reference bytes changed.");
    expect(env.store.put).not.toHaveBeenCalled();
    expect(await env.database.collections.assets.countDocuments({ _id: env.operationId })).toBe(0);
  });

  it("rechecks sources after byte storage before publishing the saved asset", async () => {
    const env = await setup();
    vi.mocked(env.store.put).mockImplementation(async (uri, bytes, mimeType) => {
      env.files.set(uri, Uint8Array.from(bytes));
      verifySources.mockRejectedValue(new Error("Sources changed during storage."));
      return { uri, mimeType, byteLength: bytes.byteLength };
    });
    await expect(env.storage.complete({ identity: env.identity, content: env.content })).rejects.toThrow("Sources changed during storage.");
    expect(env.files.size).toBe(1);
    expect(await env.database.collections.assets.countDocuments({ _id: env.operationId })).toBe(0);
    expect((await env.database.collections.experiment_operations.findOne({ _id: env.operationId }))!.state).toBe("started");
  });

  it("rejects mismatched requests and unenabled saved profiles", async () => {
    const env = await setup();
    verifySources.mockResolvedValue({ request: { request: { ...env.request, prompt: "Another page" } } });
    await expect(env.images.authorizeFixture(env.identity)).rejects.toMatchObject({ code: "conflict" });
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { configurationJson: "[]" } });
    await expect(env.images.authorizeFixture(env.identity)).rejects.toMatchObject({ code: "invalid_state" });
    expect(env.store.put).not.toHaveBeenCalled();
  });
});
