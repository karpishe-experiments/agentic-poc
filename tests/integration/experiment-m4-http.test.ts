import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createM4TextPreparation } from "@/db/experiment-text-preparation";
import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";
import { configurationSnapshot, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import type { RuntimeResult, WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { m4Hash, m4RequestBundleHash } from "@/lib/experiment-runner/m4-request";
import { specialistTaskSchema } from "@/lib/contracts/experiment-runner";
import { OperationBudgetExpired, RECONCILIATION_RESERVE_MS, withOperationBudget } from "@/lib/operations/budget";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";
import { loadPublishedRehearsal, publishedReturn } from "@/tests/helpers/m4-published-rehearsal";
import manifest from "@/lib/experiment-runner/m4-campaign-manifest.json";
import { m4PolicySchema, m4PolicySnapshot, m4TokenPolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { writeFileSync } from "node:fs";

const databases: Database[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.splice(0).map(closeTestDatabase)); });
const identity = { runId: id(10), operationId: id(12), workflowRunId: id(13), parentWorkflowRunId: null };
function callback(body: unknown = identity) {
  return new Request("http://localhost:3000/api/experiments/booklet-tools/authorize", { method: "POST",
    headers: { "x-booklet-tool-key": "x".repeat(32) }, body: JSON.stringify(body) });
}
function create(body: unknown, key = id(50)) {
  return new Request("http://localhost:3000/api/experiments/booklet-runs", { method: "POST",
    headers: { origin: "http://localhost:3000", "idempotency-key": key }, body: JSON.stringify(body) });
}
async function setup(prepare = true, amended = false) {
  const db = await createTestDatabase({ seedAgents: false }); databases.push(db);
  const policy = m4PolicySchema.parse({ ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash(),
    ...(process.env.M4_PUBLICATION_REHEARSAL === "1" ? { publications: manifest.policy.publications, pluginIdentity: manifest.policy.pluginIdentity } : {}) });
  const adapterUpdate = { fromIdentity: policy.pluginIdentity, version: "1.0.7-dev5" as const,
    packageSha256: "b".repeat(64), identity: `langgenius/openai:1.0.7-dev5@${"e".repeat(64)}`, reference: "fake-reviewed-package" };
  const tokenPolicy = m4TokenPolicySnapshot({ version: "m4_context_policy_v2", basePolicyHash: m4PolicySnapshot(policy).hash,
    maxInputTokens: 128000, warningInputTokens: 32000, requiredProviderAdapterIdentity: adapterUpdate.identity,
    requiredProviderPackageSha256: adapterUpdate.packageSha256, reference: "fake-reviewed-policy" });
  const authority = { policy, grant: { campaignId: id(1), reference: "fake-provider-only",
    ...(amended ? { providerAdapterUpdate: adapterUpdate, tokenPolicy } : {}) } };
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "http://localhost:3000", callbackKey: "x".repeat(32),
    bindings: policy.publications.map((binding) => ({ ...binding, taskId: specialistTaskSchema.nullable().parse(binding.taskId), apiKey: "fake-test-key" })),
    m4: { state: "granted", authority } };
  const repository = createExperimentRepository(db, { m4Authority: authority, m4ExecutionEnabled: true });
  const retrieve = vi.fn(async (): Promise<RuntimeResult> => ({ kind: "execution", execution: {
    id: id(13), workflow_id: policy.publications.find((item) => item.role === "manager")!.publishedWorkflowId, status: "running", task_id: id(14),
  } }));
  const runtime: WorkflowRuntime = { retrieve, start: vi.fn(async () => { throw new Error("No POST allowed"); }) };
  const http = createBookletRunnerHttp({ database: () => db, config: () => ({ enabled: true, config }), runtime: () => runtime, mutate: (operation) => operation() });
  if (prepare) {
    const nowMs = Date.now();
    await repository.createRun({ runId: id(10), bookletId: id(11), persona: "playful_kid", mode: "balanced", campaignId: id(1),
      configuration: configurationSnapshot(config, "playful_kid"), nowMs });
    await repository.prepareOperation({ runId: id(10), operationId: id(12), expectedRevision: 0, role: "manager", taskId: null,
      subjectKind: "book", subjectId: id(11), inputFingerprint: "b".repeat(64), attempt: 1, providerKind: "text", nowMs });
    await createM4TextPreparation(db, authority).prepare({ runId: id(10), operationId: id(12), nowMs });
    await repository.beginDispatch({ runId: id(10), operationId: id(12), parentWorkflowRunId: null, nowMs });
  }
  return { db, repository, http, retrieve, runtime, config };
}

describe("granted M4 HTTP boundary with fake Dify reads", () => {
  it("authenticates the policy carrier separately and preserves the saved provider request and reservation digest", async () => {
    const { http, repository, runtime } = await setup(true, true);
    const preparation = (await repository.getOperation(id(12)))!.m4Preparation!;
    const response = await http.tool(callback(), "authorize");
    expect(response.status).toBe(200);
    const body = await response.json();
    const carrier = JSON.parse(body.data.m4.requestJson);
    expect(carrier.bookletPolicy).toMatchObject({ contractVersion: "booklet_carrier_v2", requestDigest: preparation.requestDigest,
      tokenPolicy: { hash: preparation.tokenPolicy!.hash, maxInputTokens: 128000, warningInputTokens: 32000 } });
    expect(body.data.m4.requestDigest).toBe(m4Hash(body.data.m4.requestJson));
    expect(body.data.m4.requestDigest).not.toBe(preparation.requestDigest);
    delete carrier.bookletPolicy;
    expect(carrier).toEqual(JSON.parse(preparation.requestJson));
    const saved = (await repository.getOperation(id(12)))!;
    expect(saved.m4Preparation).toEqual(preparation);
    expect(saved.m4Reservation).toMatchObject({ requestDigest: preparation.requestDigest,
      effectivePolicyHash: preparation.tokenPolicy!.hash, maxInputTokens: 128000 });
    expect((await http.tool(callback(), "authorize")).status).toBe(200);
    expect(runtime.start).not.toHaveBeenCalled();
  });
  it("creates once when valid binding order differs from the manifest without rewriting its snapshot", async () => {
    const { http, db, config, runtime } = await setup(false);
    // The protected prepared settings place image before manager; the frozen
    // manifest places image last. Both contain exactly the same identities.
    const image = config.bindings.find((binding) => binding.role === "image")!;
    config.bindings = [image, ...config.bindings.filter((binding) => binding !== image)];
    const response = await http.create(create({ persona: "playful_kid", mode: "balanced" }));
    expect(response.status).toBe(201);
    const saved = await db.collections.experiment_runs.findOne({});
    expect(JSON.parse(saved!.configurationJson)).toEqual(configurationSnapshot(config, "playful_kid"));
    expect(saved!.configurationHash).toBe(m4Hash(saved!.configurationJson));
    expect((await http.create(create({ persona: "playful_kid", mode: "balanced" }))).status).toBe(200);
    expect(await db.collections.experiment_runs.countDocuments({})).toBe(1);
    expect(await db.collections.experiment_campaigns.countDocuments({})).toBe(1);
    expect(await db.collections.experiment_operations.countDocuments({})).toBe(0);
    expect(runtime.start).not.toHaveBeenCalled();
  });
  it("admits the largest escaped authorization envelope and preserves its bytes through the graph carrier", async () => {
    const { http, db, repository } = await setup();
    const operation = (await repository.getOperation(id(12)))!;
    const payload = JSON.parse(operation.m4Preparation!.requestJson);
    // Synthetic boundary input, not a claim that 1 MiB fits the provider token
    // limit. Provider input counting remains an independent admission boundary.
    payload.input[0].content = "";
    const encode = (padding: number) => {
      payload.input[0].content = "x".repeat(padding);
      // Keep canonical ordering from the original prepared object.
      return JSON.stringify(payload);
    };
    const envelope = (requestJson: string) => JSON.stringify({ data: { started: true, reason: null,
      role: operation.role, taskId: operation.taskId, subjectKind: operation.subjectKind, subjectId: operation.subjectId,
      mode: operation.mode, inputFingerprint: operation.inputFingerprint,
      m4: { requestJson, requestDigest: m4Hash(requestJson), timeoutSeconds: 120,
        deadlineAtMs: operation.deadlineAtMs! - RECONCILIATION_RESERVE_MS, report: false } } });
    const requestJson = encode(1_048_576 - Buffer.byteLength(envelope(encode(0))));
    expect(Buffer.byteLength(envelope(requestJson))).toBe(1_048_576);
    await db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: {
      "m4Preparation.requestJson": requestJson, "m4Preparation.requestDigest": m4Hash(requestJson),
    } });
    const started = performance.now();
    const response = await http.tool(callback(), "authorize");
    const body = await response.text();
    const authorizationMs = performance.now() - started;
    expect(response.status).toBe(200);
    expect(Buffer.byteLength(body)).toBe(1_048_576);
    expect((await repository.getOperation(id(12)))!.deadlineAtMs).toBe(operation.deadlineAtMs);
    if (process.env.M4_PUBLICATION_REHEARSAL === "1") {
      const graph = (await loadPublishedRehearsal()).find((item) => item.role === "manager")!;
      const returned = publishedReturn(graph.graph, body, "scripted-provider-boundary-result", requestJson, false);
      writeFileSync("output/issue65-m4-rehearsal-payload.json", JSON.stringify({ providerRequests: 0,
        publicationId: graph.publicationId, authorizationBytes: Buffer.byteLength(body),
        resultBytes: Buffer.byteLength(returned.output), authorizationMs, decodeReturnMs: returned.decodeReturnMs }, null, 2));
    }
  });
  it("owns the campaign identity and denies ungranted, Real, successors and extra campaign inputs", async () => {
    const { http, db, config } = await setup(false);
    config.m4 = { state: "ready" };
    expect((await http.create(create({ persona: "playful_kid", mode: "balanced" }))).status).toBe(422);
    config.m4 = { state: "granted", authority: { policy: { ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash() }, grant: { campaignId: id(1), reference: "fake-only" } } };
    expect((await http.create(create({ persona: "playful_kid", mode: "real" }))).status).toBe(422);
    expect((await http.create(create({ persona: "playful_kid", mode: "balanced", predecessorRunId: id(9) }))).status).toBe(422);
    expect((await http.create(create({ persona: "playful_kid", mode: "balanced", campaignId: id(9) }))).status).toBe(400);
    expect((await http.create(create({ persona: "playful_kid", mode: "balanced" }))).status).toBe(201);
    expect((await http.create(create({ persona: "playful_kid", mode: "balanced" }))).status).toBe(200);
    expect(await db.collections.experiment_runs.findOne({})).toMatchObject({ m4: { campaignId: id(1) } });
    expect(await db.collections.experiment_campaigns.findOne({})).toMatchObject({ requests: 0 });
  });
  it("verifies original execution, returns only bounded prepared bytes and reserves once on duplicate", async () => {
    const { http, db, repository, retrieve, runtime, config } = await setup();
    const prepared = (await repository.getOperation(id(12)))!.m4Preparation!;
    const response = await http.tool(callback(), "authorize");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ started: true, mode: "balanced", m4: { requestJson: prepared.requestJson, requestDigest: prepared.requestDigest, report: false, timeoutSeconds: 120 } });
    expect(body.data).not.toHaveProperty("context");
    expect(body.data.m4.deadlineAtMs).toBe((await repository.getOperation(id(12)))!.deadlineAtMs! - RECONCILIATION_RESERVE_MS);
    expect(JSON.stringify(body)).not.toContain("fake-test-key");
    expect(retrieve).toHaveBeenCalledWith(config.bindings[0], id(13), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect((await repository.getOperation(id(12)))).toMatchObject({ workflowRunId: id(13), workflowTaskId: id(14), verifiedWorkflowId: config.bindings[0].publishedWorkflowId, reservationCount: 1 });
    expect(await (await http.tool(callback(), "authorize")).json()).toMatchObject({ data: { started: false, reason: "already_started", m4: null } });
    expect(await db.collections.experiment_campaigns.findOne({})).toMatchObject({ requests: 1 });
    expect(runtime.start).not.toHaveBeenCalled();
    expect(retrieve).toHaveBeenCalledTimes(1);
  });
  it("commits authenticated identity, publication and reservation in one transaction", async () => {
    const { http, db, repository } = await setup();
    const sessions = vi.spyOn(db.client, "startSession");
    const operationReads = vi.spyOn(db.collections.experiment_operations, "findOne");
    const runReads = vi.spyOn(db.collections.experiment_runs, "findOne");
    expect((await http.tool(callback(), "authorize")).status).toBe(200);
    // Mongo also opens implicit per-command sessions outside transactions.
    expect(sessions.mock.calls.filter(([options]) => options === undefined)).toHaveLength(1);
    // Initial callback snapshot plus fresh atomic claim snapshot. The source
    // fingerprint adds one projected parent-manager lookup to operation reads.
    expect(operationReads).toHaveBeenCalledTimes(3);
    expect(runReads).toHaveBeenCalledTimes(2);
    expect(await repository.getOperation(id(12))).toMatchObject({ reservationCount: 1,
      workflowRunId: id(13), workflowTaskId: id(14), verifiedWorkflowId: id(200) });
  });
  it("rejects a conflicting retained task identity without reserving", async () => {
    const { http, db } = await setup();
    await db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: {
      workflowRunId: id(13), workflowTaskId: id(999),
    } });
    expect((await http.tool(callback(), "authorize")).status).toBe(409);
    expect(await db.collections.experiment_operations.findOne({ _id: id(12) })).toMatchObject({
      workflowTaskId: id(999), reservationCount: 0, authorizationClaim: null,
    });
    expect(await db.collections.experiment_campaigns.findOne({})).toMatchObject({ requests: 0 });
  });
  it("cleans its lease when the actual callback budget expires after lease acquisition", async () => {
    const { http, db } = await setup();
    const original = db.collections.experiment_operations.findOneAndUpdate.bind(db.collections.experiment_operations);
    let clock = Date.now();
    const leaseWrite = vi.spyOn(db.collections.experiment_operations, "findOneAndUpdate").mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      clock += 1_001;
      return result;
    });
    await expect(withOperationBudget(clock + 1_000, () => http.tool(callback(), "authorize"), { now: () => clock }))
      .rejects.toBeInstanceOf(OperationBudgetExpired);
    expect(leaseWrite).toHaveBeenCalled();
    expect(await db.collections.experiment_operations.findOne({ _id: id(12) })).toMatchObject({
      reservationCount: 0, authorizationClaim: null,
    });
    expect(await db.collections.experiment_campaigns.findOne({})).toMatchObject({ requests: 0 });
  });
  it("refuses unknown, terminal and wrong-publication GETs before reservation", async () => {
    const { http, db, retrieve, config } = await setup();
    for (const remote of [{ kind: "unknown" },
      { kind: "execution", execution: { id: id(13), workflow_id: id(999), status: "running" } },
      { kind: "execution", execution: { id: id(13), workflow_id: config.bindings[0].publishedWorkflowId, status: "succeeded" } }] as RuntimeResult[]) {
      retrieve.mockResolvedValueOnce(remote);
      expect((await http.tool(callback(), "authorize")).status).toBe(409);
    }
    expect(await db.collections.experiment_campaigns.findOne({})).toMatchObject({ requests: 0 });
  });
  it("admits at most one racing authorization without repeating provider work", async () => {
    const { http, db, runtime } = await setup();
    const responses = await Promise.all([http.tool(callback(), "authorize"), http.tool(callback(), "authorize")]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies.filter((body) => body.data?.started === true)).toHaveLength(1);
    expect(responses.every((response) => [200, 409].includes(response.status))).toBe(true);
    expect(await db.collections.experiment_campaigns.findOne({})).toMatchObject({ requests: 1 });
    expect(runtime.start).not.toHaveBeenCalled();
  });
  it("rejects changed source state after GET before the atomic reservation", async () => {
    const { http, db, retrieve, config } = await setup();
    retrieve.mockImplementationOnce(async () => {
      await db.collections.booklets.updateOne({ _id: id(11) }, { $set: { workingTitle: "Changed while GET was running" } });
      return { kind: "execution", execution: { id: id(13), workflow_id: config.bindings[0].publishedWorkflowId, status: "running" } };
    });
    expect((await http.tool(callback(), "authorize")).status).toBe(409);
    expect(await db.collections.experiment_campaigns.findOne({})).toMatchObject({ requests: 0 });
  });
  it("checks escaped envelope bytes before claiming, even when request JSON alone is below 1 MiB", async () => {
    const { http, db } = await setup();
    const requestJson = JSON.stringify({ input: '"'.repeat(300_000) });
    expect(Buffer.byteLength(requestJson)).toBeLessThan(1_048_576);
    await db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: {
      "m4Preparation.requestJson": requestJson, "m4Preparation.requestDigest": m4Hash(requestJson),
    } });
    expect((await http.tool(callback(), "authorize")).status).toBe(422);
    expect(await db.collections.experiment_campaigns.findOne({})).toMatchObject({ requests: 0 });
    expect(await db.collections.experiment_operations.findOne({ _id: id(12) })).toMatchObject({ reservationCount: 0, workflowRunId: null });
  });
  it("rechecks Pause after authenticated GET without a reservation", async () => {
    const { http, db, repository, retrieve, config } = await setup();
    retrieve.mockImplementationOnce(async () => {
      const run = (await repository.getRun(id(10)))!;
      await repository.pause({ runId: id(10), expectedRevision: run.revision, nowMs: Date.now() });
      return { kind: "execution", execution: { id: id(13), workflow_id: config.bindings[0].publishedWorkflowId, status: "running" } };
    });
    expect(await (await http.tool(callback(), "authorize")).json()).toMatchObject({ data: { started: false, reason: "paused", m4: null } });
    expect(await db.collections.experiment_campaigns.findOne({})).toMatchObject({ requests: 0 });
    expect(await repository.getOperation(id(12))).toMatchObject({ workflowRunId: id(13),
      verifiedWorkflowId: config.bindings[0].publishedWorkflowId, authorizationClaim: null, reservationCount: 0 });
  });
  it("uses text callbacks only to wake observation, including forged content and failure", async () => {
    const { http, db, repository, retrieve, config } = await setup();
    expect((await http.tool(callback(), "authorize")).status).toBe(200);
    config.m4 = { state: "disabled" };
    for (const action of ["result", "failure"] as const) {
      expect(await (await http.tool(callback({ ...identity, result: { arbitrary: "forged" }, usage: { cost: 0 }, category: "definite_failure" }), action)).json())
        .toEqual({ data: { observationRequested: true } });
    }
    expect(await repository.getOperation(id(12))).toMatchObject({ state: "started", resultJson: null, reservationCount: 1, nextObservationAtMs: 0 });
    expect(await db.collections.experiment_campaigns.findOne({})).toMatchObject({ requests: 1, settledMicrodollars: 0 });
    expect((await http.tool(callback({ ...identity, workflowRunId: id(999) }), "failure")).status).toBe(409);
    expect((await http.tool(callback(), "context")).status).toBe(422);
    expect(retrieve).toHaveBeenCalledTimes(1);
  });
});
