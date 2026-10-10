import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExperimentImageRepository } from "@/db/experiment-images";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import type { AssetStore } from "@/lib/assets/asset-store";
import { createExperimentImageStorage } from "@/lib/experiment-runner/image-storage";
import { MAX_EXPERIMENT_IMAGE_BYTES, validateExperimentImage } from "@/lib/experiment-runner/image-validation";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

class MemoryStore implements AssetStore {
  public readonly files = new Map<string, Uint8Array>();
  public failPut = false;
  public afterPut?: () => Promise<void>;
  public existsCalls = 0;
  public getCalls = 0;
  async put(uri: string, content: Uint8Array, mimeType: string) {
    if (this.failPut) throw new Error("private store error");
    if (this.files.has(uri)) throw new Error("exists");
    this.files.set(uri, Uint8Array.from(content));
    await this.afterPut?.();
    return { uri, mimeType, byteLength: content.byteLength };
  }
  async get(uri: string) { this.getCalls++; const bytes = this.files.get(uri); if (!bytes) throw new Error("missing"); return Uint8Array.from(bytes); }
  async exists(uri: string) { this.existsCalls++; return this.files.has(uri); }
}

async function setup(options: { skipPrepare?: boolean } = {}) {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const repository = createExperimentRepository(database);
  const runId = id(1), bookletId = id(2), operationId = id(3), workflowRunId = id(4), sourceVersionId = id(5);
  await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 });
  await database.collections.artifacts.insertOne({ _id: id(6), bookletId, artifactType: "book_concept_brief", state: "approved", currentVersionId: sourceVersionId, taskId: "J01", subjectKind: "book", subjectId: bookletId, experimentRunId: runId, createdAtMs: 1, updatedAtMs: 1 });
  await database.collections.artifact_versions.insertOne({ _id: sourceVersionId, schemaVersion: "2", artifactId: id(6), versionNumber: 1, contentJson: "{}", dependencyVersionIdsJson: "[]", createdBy: "specialist", sourceVersionId: null, sourceExecutionBatchId: null, createdAtMs: 1 });
  await database.collections.approvals.insertOne({ _id: id(7), bookletId, artifactVersionId: sourceVersionId, scope: "artifact", subjectKey: null, action: "approve", origin: "explicit", sourceApprovalId: null, cardResponseId: null, qualityReviewId: null, experimentRunId: runId, testerDecisionId: id(8), delegationId: null, reviewGroupId: null, createdAtMs: 1 });
  const request = { kind: "reference" as const, prompt: "A synthetic reference fixture.", sourceVersionIds: [sourceVersionId], styleVersionId: null };
  const identity = { runId, operationId, workflowRunId, parentWorkflowRunId: null, inputFingerprint: imageRequestFingerprint(request) };
  const claimIdentity = { runId, operationId, workflowRunId, parentWorkflowRunId: null };
  const prepareInput = { operationId, runId, expectedRevision: 0, role: "image", taskId: null, subjectKind: "book", subjectId: bookletId, inputFingerprint: identity.inputFingerprint, attempt: 1, providerKind: "image", imageRequest: request, nowMs: 2 };
  if (!options.skipPrepare) await repository.prepareOperation(prepareInput);
  const store = new MemoryStore();
  const bytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#74aadd" } }).png().toBuffer();
  let clock = 10;
  const storage = () => createExperimentImageStorage({ database, store, now: () => clock, newClaimId: () => id(clock) });
  return { database, repository, runId, operationId, identity, claimIdentity, request, prepareInput, store, bytes, storage, setClock: (value: number) => { clock = value; }, sourceVersionId };
}

describe("experiment image storage", () => {
  it("stores original bytes once, retains lineage, and does not charge a simulated provider", async () => {
    const env = await setup();
    await expect(env.storage().complete({ identity: env.identity, content: env.bytes })).rejects.toMatchObject({ code: "invalid_state" });
    await env.repository.claimOperation({ ...env.claimIdentity, nowMs: 3 });
    const saved = await env.storage().complete({ identity: env.identity, content: env.bytes });
    expect(env.store.existsCalls).toBe(0);
    expect(env.store.getCalls).toBe(1);
    expect(saved.reused).toBe(false);
    expect(saved.asset).toMatchObject({ _id: env.operationId, mimeType: "image/png", width: 3, height: 2 });
    expect(await env.store.get(saved.asset!.uri)).toEqual(Uint8Array.from(env.bytes));
    expect(JSON.parse(saved.asset!.metadataJson!)).toMatchObject({ sourceVersionIds: [env.sourceVersionId], inputFingerprint: env.identity.inputFingerprint, workflowRunId: env.identity.workflowRunId });
    expect(await env.repository.getRun(env.runId)).toMatchObject({ status: "queued", activeOperationId: null, counters: { logicalImage: 1, payableImage: 0 } });
    env.store.existsCalls = 0;
    env.store.getCalls = 0;
    expect((await env.storage().complete({ identity: env.identity, content: env.bytes })).reused).toBe(true);
    expect(env.store.existsCalls).toBe(0);
    expect(env.store.getCalls).toBe(1);
    const different = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#ff0000" } }).png().toBuffer();
    await expect(env.storage().complete({ identity: env.identity, content: different })).rejects.toMatchObject({ code: "conflict" });
    expect(env.store.files.size).toBe(1);
  });

  it("verifies retained bytes with one GET after an exclusive-write collision", async () => {
    const env = await setup();
    await env.repository.claimOperation({ ...env.claimIdentity, nowMs: 3 });
    const uri = `experiments/${id(2)}/${env.runId}/${env.operationId}/attempt-1/image.png`;
    env.store.files.set(uri, Uint8Array.from(env.bytes));
    const saved = await env.storage().complete({ identity: env.identity, content: env.bytes });
    expect(saved.asset!.uri).toBe(uri);
    expect(env.store.existsCalls).toBe(0);
    expect(env.store.getCalls).toBe(1);
    expect((await env.repository.getRun(env.runId))?.counters.logicalImage).toBe(1);
  });

  it("rejects conflicting retained bytes without overwriting them", async () => {
    const env = await setup();
    await env.repository.claimOperation({ ...env.claimIdentity, nowMs: 3 });
    const uri = `experiments/${id(2)}/${env.runId}/${env.operationId}/attempt-1/image.png`;
    const retained = new Uint8Array([1, 2, 3]);
    env.store.files.set(uri, retained);
    await expect(env.storage().complete({ identity: env.identity, content: env.bytes }))
      .rejects.toMatchObject({ code: "invalid_state" });
    expect(env.store.files.get(uri)).toEqual(retained);
    expect(env.store.existsCalls).toBe(0);
    expect(env.store.getCalls).toBe(1);
    expect(await env.database.collections.assets.countDocuments()).toBe(0);
  });

  it("allows one concurrent completion claim and preserves an expired claim digest", async () => {
    const env = await setup(); await env.repository.claimOperation({ ...env.claimIdentity, nowMs: 3 });
    const images = createExperimentImageRepository(env.database);
    const validatedImage = await validateExperimentImage(env.bytes);
    const first = { ...env.identity, validatedImage, claimId: id(70), nowMs: 10 };
    const results = await Promise.allSettled([images.claim(first), images.claim({ ...first, claimId: id(71) })]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    await expect(images.claim({ ...first, claimId: id(72), nowMs: 60_009 })).rejects.toMatchObject({ code: "conflict" });
    env.setClock(60_011);
    const recovered = await env.storage().complete({ identity: env.identity, content: env.bytes });
    expect(recovered.reused).toBe(false);
    expect(recovered.operation.imageCompletionDigest).toBe(validatedImage.sha256);
  });

  it("releases a failed store claim, then recovers retained original bytes without another image request", async () => {
    const env = await setup(); await env.repository.claimOperation({ ...env.claimIdentity, nowMs: 3 });
    env.store.failPut = true;
    await expect(env.storage().complete({ identity: env.identity, content: env.bytes })).rejects.toMatchObject({ code: "invalid_state" });
    expect((await env.repository.getOperation(env.operationId))?.imageCompletionClaim).toBeNull();
    env.store.failPut = false;
    const image = await env.storage().complete({ identity: env.identity, content: env.bytes });
    expect(image.asset!.uri).toContain(env.operationId);
    expect((await env.repository.getRun(env.runId))?.counters.logicalImage).toBe(1);
  });

  it("treats missing or corrupt bytes as a blocker even after database completion", async () => {
    const env = await setup(); await env.repository.claimOperation({ ...env.claimIdentity, nowMs: 3 });
    const saved = await env.storage().complete({ identity: env.identity, content: env.bytes });
    env.store.files.delete(saved.asset!.uri);
    await expect(env.storage().complete({ identity: env.identity, content: env.bytes })).rejects.toMatchObject({ code: "invalid_state" });
    env.store.files.set(saved.asset!.uri, new Uint8Array([1, 2, 3]));
    await expect(env.storage().complete({ identity: env.identity, content: env.bytes })).rejects.toMatchObject({ code: "invalid_state" });
    expect(await env.database.collections.assets.countDocuments()).toBe(1);
  });

  it("rejects a source changed after storage and keeps the old operation unfinished", async () => {
    const env = await setup(); await env.repository.claimOperation({ ...env.claimIdentity, nowMs: 3 });
    env.store.afterPut = async () => { await env.database.collections.artifacts.updateOne({ _id: id(6) }, { $set: { state: "needs_review" } }); };
    await expect(env.storage().complete({ identity: env.identity, content: env.bytes })).rejects.toMatchObject({ code: "conflict" });
    expect((await env.repository.getOperation(env.operationId))?.state).toBe("started");
    expect(await env.database.collections.assets.countDocuments()).toBe(0);
  });

  it("accepts late Pause and recovers an unknown or failed operation without debit", async () => {
    const paused = await setup(); await paused.repository.claimOperation({ ...paused.claimIdentity, nowMs: 3 });
    await paused.repository.pause({ runId: paused.runId, expectedRevision: 2, nowMs: 4 });
    await paused.storage().complete({ identity: paused.identity, content: paused.bytes });
    expect(await paused.repository.getRun(paused.runId)).toMatchObject({ status: "paused", activeOperationId: null, counters: { logicalImage: 1, payableImage: 0 } });
    const failed = await setup(); await failed.repository.claimOperation({ ...failed.claimIdentity, nowMs: 3 });
    await failed.repository.failOperation({ ...failed.claimIdentity, category: "definite_failure", nowMs: 4 });
    const recovered = await failed.storage().complete({ identity: failed.identity, content: failed.bytes });
    expect(recovered.operation).toMatchObject({ state: "succeeded", imageFailureHistory: [{ category: "definite_failure" }] });
    expect(await failed.repository.getRun(failed.runId)).toMatchObject({ status: "queued", safeFailure: null, counters: { logicalImage: 1, payableImage: 0 } });
    const unknown = await setup(); await unknown.repository.claimOperation({ ...unknown.claimIdentity, nowMs: 3 });
    await unknown.repository.failOperation({ ...unknown.claimIdentity, category: "unknown_outcome", nowMs: 4 });
    const recoveredUnknown = await unknown.storage().complete({ identity: unknown.identity, content: unknown.bytes });
    expect(recoveredUnknown.operation).toMatchObject({ state: "succeeded", imageFailureHistory: [{ category: "unknown_outcome" }] });
    expect(await unknown.repository.getRun(unknown.runId)).toMatchObject({ status: "queued", safeFailure: null, counters: { logicalImage: 1, payableImage: 0 } });
  });

  it("rejects a changed source before reservation and a foreign source at preparation", async () => {
    const changed = await setup();
    await changed.database.collections.artifacts.updateOne({ _id: id(6) }, { $set: { state: "needs_review" } });
    await expect(changed.repository.claimOperation({ ...changed.claimIdentity, nowMs: 3 })).rejects.toMatchObject({ code: "conflict" });
    expect(await changed.repository.getRun(changed.runId)).toMatchObject({ counters: { logicalImage: 0, payableImage: 0 } });
    const foreign = await setup({ skipPrepare: true });
    await foreign.database.collections.artifacts.updateOne({ _id: id(6) }, { $set: { experimentRunId: id(99) } });
    await expect(foreign.repository.prepareOperation(foreign.prepareInput)).rejects.toMatchObject({ code: "conflict" });
  });

  it("does not clear a definite run blocker unrelated to a started operation", async () => {
    const env = await setup(); await env.repository.claimOperation({ ...env.claimIdentity, nowMs: 3 });
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { status: "blocked", safeFailure: "definite_failure" } });
    await expect(env.storage().complete({ identity: env.identity, content: env.bytes })).rejects.toMatchObject({ code: "invalid_state" });
    expect(await env.database.collections.assets.countDocuments()).toBe(0);
  });

  it("rejects a rejection record as source approval", async () => {
    const env = await setup({ skipPrepare: true });
    await env.database.collections.approvals.updateOne({ _id: id(7) }, { $set: { action: "reject" } });
    await expect(env.repository.prepareOperation(env.prepareInput)).rejects.toMatchObject({ code: "conflict" });
  });

  it("retains each failure timestamp through recovery", async () => {
    const env = await setup(); await env.repository.claimOperation({ ...env.claimIdentity, nowMs: 3 });
    await env.repository.failOperation({ ...env.claimIdentity, category: "unknown_outcome", nowMs: 4 });
    await env.repository.failOperation({ ...env.claimIdentity, category: "definite_failure", nowMs: 5 });
    const recovered = await env.storage().complete({ identity: env.identity, content: env.bytes });
    expect(recovered.operation.imageFailureHistory).toEqual([
      { category: "unknown_outcome", recordedAtMs: 4 },
      { category: "definite_failure", recordedAtMs: 5 },
    ]);
    expect((await env.storage().complete({ identity: env.identity, content: env.bytes })).operation.imageFailureHistory).toHaveLength(2);
    expect((await env.repository.getRun(env.runId))?.counters.logicalImage).toBe(1);
  });

  it("rejects oversized content before copying or claiming it", async () => {
    const env = await setup(); await env.repository.claimOperation({ ...env.claimIdentity, nowMs: 3 });
    await expect(env.storage().complete({ identity: env.identity, content: new Uint8Array(MAX_EXPERIMENT_IMAGE_BYTES + 1) })).rejects.toMatchObject({ code: "too_large" });
    expect((await env.repository.getOperation(env.operationId))?.imageCompletionClaim).toBeUndefined();
  });

  it("checks the active image identity before decoding invalid callback bytes", async () => {
    const env = await setup();
    await expect(env.storage().complete({ identity: env.identity, content: new Uint8Array([1]) })).rejects.toMatchObject({ code: "invalid_state" });
    expect((await env.repository.getOperation(env.operationId))?.imageCompletionClaim).toBeUndefined();
    expect(env.store.files.size).toBe(0);
  });
});
