import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import type { AssetStore } from "@/lib/assets/asset-store";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
const key = { "x-booklet-tool-key": "x".repeat(32) };

class MemoryStore implements AssetStore {
  readonly files = new Map<string, Uint8Array>();
  fail = false;
  async put(uri: string, content: Uint8Array, mimeType: string) {
    if (this.fail) throw new Error("private store failure");
    if (this.files.has(uri)) throw new Error("exists");
    this.files.set(uri, Uint8Array.from(content));
    return { uri, mimeType, byteLength: content.byteLength };
  }
  async get(uri: string) { const value = this.files.get(uri); if (!value) throw new Error("missing"); return Uint8Array.from(value); }
  async exists(uri: string) { return this.files.has(uri); }
}

async function setup() {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const repository = createExperimentRepository(database);
  const runId = id(1), bookletId = id(2), operationId = id(3), workflowRunId = id(4), sourceVersionId = id(5);
  await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 });
  await database.collections.artifacts.insertOne({ _id: id(6), bookletId, artifactType: "book_concept_brief", state: "approved", currentVersionId: sourceVersionId, taskId: "J01", subjectKind: "book", subjectId: bookletId, experimentRunId: runId, createdAtMs: 1, updatedAtMs: 1 });
  await database.collections.artifact_versions.insertOne({ _id: sourceVersionId, schemaVersion: "2", artifactId: id(6), versionNumber: 1, contentJson: "{}", dependencyVersionIdsJson: "[]", createdBy: "specialist", sourceVersionId: null, sourceExecutionBatchId: null, createdAtMs: 1 });
  await database.collections.approvals.insertOne({ _id: id(7), bookletId, artifactVersionId: sourceVersionId, scope: "artifact", subjectKey: null, action: "approve", origin: "explicit", sourceApprovalId: null, cardResponseId: null, qualityReviewId: null, experimentRunId: runId, testerDecisionId: id(8), delegationId: null, reviewGroupId: null, createdAtMs: 1 });
  const imageRequest = { kind: "reference" as const, prompt: "A synthetic reference fixture.", sourceVersionIds: [sourceVersionId], styleVersionId: null };
  const inputFingerprint = imageRequestFingerprint(imageRequest);
  await repository.prepareOperation({ operationId, runId, expectedRevision: 0, role: "image", taskId: null, subjectKind: "book", subjectId: bookletId, inputFingerprint, attempt: 1, providerKind: "image", imageRequest, nowMs: 2 });
  const query = new URLSearchParams({ runId, operationId, workflowRunId, inputFingerprint });
  const url = `http://localhost:3000/api/experiments/booklet-tools/image?${query}`;
  const fixtureUrl = url.replace("/image?", "/image-fixture?");
  const store = new MemoryStore();
  const http = createBookletRunnerHttp({ database: () => database, store: () => store, config: () => ({ enabled: true, config: { enabled: true, baseUrl: "https://dify.example.test", publicOrigin: "http://localhost:3000", callbackKey: key["x-booklet-tool-key"], bindings: [] } }), mutate: async (operation) => operation(), admit: async () => {} });
  const bytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#74aadd" } }).png().toBuffer();
  const post = (content: Uint8Array, target = url, headers: Record<string, string> = {}) => http.imageComplete(new Request(target, { method: "POST", headers: { ...key, ...headers }, body: new Uint8Array(content) }));
  const get = (target = fixtureUrl) => http.imageFixture(new Request(target, { headers: key }));
  return { database, repository, runId, operationId, workflowRunId, inputFingerprint, sourceVersionId, store, http, bytes, post, get, url, fixtureUrl };
}

describe("experiment image HTTP callbacks", () => {
  it("authorizes through the ordinary callback, downloads and saves one fixture", async () => {
    const env = await setup();
    await env.repository.beginDispatch({ runId: env.runId, operationId: env.operationId, parentWorkflowRunId: null, nowMs: Date.now() });
    const identity = { runId: env.runId, operationId: env.operationId, workflowRunId: env.workflowRunId, parentWorkflowRunId: null };
    const authorize = () => env.http.tool(new Request("http://localhost:3000/api/experiments/booklet-tools/authorize", { method: "POST", headers: key, body: JSON.stringify(identity) }), "authorize");
    const authorization = await authorize();
    expect(authorization.status).toBe(200);
    expect((await authorization.json()).data).toMatchObject({ started: true, context: { role: "image", mode: "simulated", inputFingerprint: env.inputFingerprint, imageRequest: { kind: "reference", sourceVersionIds: [env.sourceVersionId] } } });
    expect((await (await authorize()).json()).data.started).toBe(false);
    const fixture = await env.get();
    expect(fixture.status).toBe(200);
    const bytes = new Uint8Array(await fixture.arrayBuffer());
    expect((await env.post(bytes)).status).toBe(200);
    const asset = await env.database.collections.assets.findOne({ _id: env.operationId });
    expect(asset).toMatchObject({ width: 8, height: 8, mimeType: "image/png" });
    expect(await env.store.get(asset!.uri)).toEqual(bytes);
    expect(await env.repository.getRun(env.runId)).toMatchObject({ counters: { logicalImage: 1, payableImage: 0 } });
  });
  it("requires an already reserved operation and returns deterministic PNG without a debit", async () => {
    const env = await setup();
    expect((await env.get()).status).toBe(409);
    expect((await env.post(env.bytes)).status).toBe(409);
    await env.repository.claimOperation({ runId: env.runId, operationId: env.operationId, workflowRunId: env.workflowRunId, parentWorkflowRunId: null, nowMs: 3 });
    const first = await env.get(); const second = await env.get();
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("image/png");
    expect(first.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(new Uint8Array(await second.arrayBuffer()));
    expect(await env.repository.getRun(env.runId)).toMatchObject({ counters: { logicalImage: 1, payableImage: 0 } });
  });
  it("stores exact uploaded bytes, ignores declared MIME, and reuses identical completion", async () => {
    const env = await setup();
    await env.repository.claimOperation({ runId: env.runId, operationId: env.operationId, workflowRunId: env.workflowRunId, parentWorkflowRunId: null, nowMs: 3 });
    const first = await env.post(env.bytes, env.url, { "content-type": "image/jpeg" });
    expect(first.status).toBe(200);
    const result = (await first.json()).data;
    expect(result).toMatchObject({ assetId: env.operationId, state: "succeeded", reused: false });
    expect(JSON.stringify(result)).not.toContain("uri");
    const asset = await env.database.collections.assets.findOne({ _id: env.operationId });
    expect(asset?.mimeType).toBe("image/png");
    expect(await env.store.get(asset!.uri)).toEqual(Uint8Array.from(env.bytes));
    expect((await (await env.post(env.bytes)).json()).data.reused).toBe(true);
    expect((await env.post(await sharp(env.bytes).negate().png().toBuffer())).status).toBe(409);
    expect(await env.repository.getRun(env.runId)).toMatchObject({ counters: { logicalImage: 1, payableImage: 0 } });
  });
  it("rejects wrong lineage, stale sources, late blockers and corrupt uploads", async () => {
    const env = await setup();
    await env.repository.claimOperation({ runId: env.runId, operationId: env.operationId, workflowRunId: env.workflowRunId, parentWorkflowRunId: null, nowMs: 3 });
    expect((await env.get(env.fixtureUrl.replace(env.workflowRunId, id(99)))).status).toBe(409);
    expect((await env.post(new Uint8Array([1, 2, 3]))).status).toBe(422);
    await env.database.collections.artifacts.updateOne({ currentVersionId: env.sourceVersionId }, { $set: { state: "needs_review" } });
    expect((await env.get()).status).toBe(409);
    expect((await env.post(env.bytes)).status).toBe(409);
    expect(await env.database.collections.assets.countDocuments()).toBe(0);
  });
  it("allows late pause but does not turn a storage failure into success", async () => {
    const env = await setup();
    await env.repository.claimOperation({ runId: env.runId, operationId: env.operationId, workflowRunId: env.workflowRunId, parentWorkflowRunId: null, nowMs: 3 });
    await env.repository.pause({ runId: env.runId, expectedRevision: 2, nowMs: 4 });
    expect((await env.get()).status).toBe(200);
    env.store.fail = true;
    expect((await env.post(env.bytes)).status).toBe(409);
    expect(await env.database.collections.assets.countDocuments()).toBe(0);
    env.store.fail = false;
    expect((await env.post(env.bytes)).status).toBe(200);
    expect(await env.repository.getRun(env.runId)).toMatchObject({ status: "paused", counters: { logicalImage: 1, payableImage: 0 } });
  });
  it("keeps POST maintenance-closed without changing counters or assets", async () => {
    const env = await setup();
    await env.repository.claimOperation({ runId: env.runId, operationId: env.operationId, workflowRunId: env.workflowRunId, parentWorkflowRunId: null, nowMs: 3 });
    const guarded = createBookletRunnerHttp({ database: () => env.database, store: () => env.store, config: () => ({ enabled: true, config: { enabled: true, baseUrl: "https://dify.example.test", publicOrigin: "http://localhost:3000", callbackKey: key["x-booklet-tool-key"], bindings: [] } }), mutate: async () => { throw new Error("maintenance"); } });
    expect((await guarded.imageComplete(new Request(env.url, { method: "POST", headers: key, body: new Uint8Array(env.bytes) }))).status).toBe(503);
    expect(await env.database.collections.assets.countDocuments()).toBe(0);
    expect(await env.repository.getRun(env.runId)).toMatchObject({ counters: { logicalImage: 1, payableImage: 0 } });
  });
  it("matches saved parent identity and permits an unknown in-flight completion", async () => {
    const env = await setup();
    const parentWorkflowRunId = id(77);
    await env.repository.claimOperation({ runId: env.runId, operationId: env.operationId, workflowRunId: env.workflowRunId, parentWorkflowRunId, nowMs: 3 });
    expect((await env.get()).status).toBe(409);
    const parentUrl = `${env.url}&parentWorkflowRunId=${parentWorkflowRunId}`;
    const parentFixtureUrl = `${env.fixtureUrl}&parentWorkflowRunId=${parentWorkflowRunId}`;
    expect((await env.get(parentFixtureUrl)).status).toBe(200);
    await env.repository.failOperation({ runId: env.runId, operationId: env.operationId, workflowRunId: env.workflowRunId, parentWorkflowRunId, category: "unknown_outcome", nowMs: 4 });
    expect((await env.get(parentFixtureUrl)).status).toBe(200);
    expect((await env.post(env.bytes, parentUrl)).status).toBe(200);
    expect((await env.repository.getOperation(env.operationId))?.imageFailureHistory).toEqual([{ category: "unknown_outcome", recordedAtMs: 4 }]);
  });
});
