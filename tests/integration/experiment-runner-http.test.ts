import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";
import type { ConfigState } from "@/lib/experiment-runner/config";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const ids = Array.from({ length: 9 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const config: ConfigState = { enabled: true, config: {
  enabled: true, baseUrl: "https://dify.example.test", publicOrigin: "http://localhost:3000", callbackKey: "x".repeat(32),
  bindings: [
    { role: "manager", taskId: null, persona: null, appId: ids[0], publishedWorkflowId: ids[3], toolProviderId: null, apiKey: "secret-manager" },
    { role: "specialist", taskId: "J01", persona: null, appId: ids[1], publishedWorkflowId: ids[4], toolProviderId: null, apiKey: "secret-J01" },
    { role: "specialist", taskId: "J02", persona: null, appId: ids[2], publishedWorkflowId: ids[5], toolProviderId: null, apiKey: "secret-J02" },
    { role: "tester", taskId: null, persona: "playful_kid", appId: ids[6], publishedWorkflowId: ids[3], toolProviderId: null, apiKey: "secret-kid" },
    { role: "tester", taskId: null, persona: "enthusiast_parent", appId: ids[7], publishedWorkflowId: ids[4], toolProviderId: null, apiKey: "secret-parent" },
    { role: "tester", taskId: null, persona: "professional_creator", appId: ids[8], publishedWorkflowId: ids[5], toolProviderId: null, apiKey: "secret-creator" },
  ],
} };
const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
function post(body: unknown, key = ids[0]) {
  return new Request("http://localhost:3000/api/experiments/booklet-runs", { method: "POST", headers: { origin: "http://localhost:3000", "idempotency-key": key }, body: JSON.stringify(body) });
}

describe("booklet runner HTTP persistence", () => {
  it("creates one simulated run per replay key, rejects changed input and exposes no configuration", async () => {
    const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
    const http = createBookletRunnerHttp({ database: () => database, config: () => config, mutate: (operation) => operation() });
    const input = { persona: "playful_kid", mode: "simulated" };
    const created = await http.create(post(input));
    expect(created.status).toBe(201);
    const body = await created.json() as { data: { runId: string; revision: number } };
    expect(body.data.revision).toBe(0);
    expect(JSON.stringify(body)).not.toContain("secret-");
    expect((await http.create(post(input))).status).toBe(200);
    expect((await http.create(post({ ...input, persona: "enthusiast_parent" }))).status).toBe(409);
    expect((await http.create(post({ ...input, mode: "real" }, ids[1]))).status).toBe(422);
    expect(await database.collections.experiment_runs.countDocuments()).toBe(1);
    const detail = await http.detail(new Request("http://localhost:3000"), body.data.runId);
    expect(detail.status).toBe(200);
    const paused = await http.control(new Request("http://localhost:3000", { method: "POST", headers: { origin: "http://localhost:3000" }, body: JSON.stringify({ expectedRevision: 0 }) }), body.data.runId, "pause");
    expect(paused.status).toBe(200);
    const stale = await http.control(new Request("http://localhost:3000", { method: "POST", headers: { origin: "http://localhost:3000" }, body: JSON.stringify({ expectedRevision: 0 }) }), body.data.runId, "resume");
    expect(stale.status).toBe(409);
  });
  it("keeps manager context when Pause commits after authorization claims", async () => {
    const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
    const repository = createExperimentRepository(database);
    const [runId, bookletId, operationId, workflowRunId] = ids;
    await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 });
    await repository.prepareOperation({ operationId, runId, expectedRevision: 0, role: "manager", taskId: null, subjectKind: "book", subjectId: bookletId, inputFingerprint: "a".repeat(64), attempt: 1, providerKind: "text", nowMs: 2 });
    await repository.beginDispatch({ runId, operationId, parentWorkflowRunId: null, nowMs: 3 });
    const http = createBookletRunnerHttp({ database: () => database, config: () => config, mutate: async (operation) => {
      const claimed = await operation();
      await repository.pause({ runId, expectedRevision: (await repository.getRun(runId))!.revision, nowMs: Date.now() });
      return claimed;
    } });
    const response = await http.tool(new Request("http://localhost:3000/authorize", { method: "POST", headers: { "x-booklet-tool-key": "x".repeat(32) }, body: JSON.stringify({ runId, operationId, workflowRunId, parentWorkflowRunId: null }) }), "authorize");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { started: true, context: { role: "manager", eligibleRoute: "J01", run: { pauseRequested: true, nextNarrativeTask: null } } } });
    expect((await repository.getRun(runId))?.pauseRequested).toBe(true);
  });
  it("returns only saved materialization identifiers and warnings after a callback", async () => {
    const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
    const repository = createExperimentRepository(database);
    const runId = ids[0]; const bookletId = ids[1]; const operationId = ids[2]; const workflowRunId = ids[3];
    await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 });
    await repository.prepareOperation({ operationId, runId, expectedRevision: 0, role: "manager", taskId: null, subjectKind: "book", subjectId: bookletId, inputFingerprint: "a".repeat(64), attempt: 1, providerKind: "text", nowMs: 2 });
    await repository.beginDispatch({ runId, operationId, parentWorkflowRunId: null, nowMs: 3 });
    const http = createBookletRunnerHttp({ database: () => database, config: () => config, mutate: (operation) => operation() });
    const identity = { runId, operationId, workflowRunId, parentWorkflowRunId: null };
    const callback = (action: "authorize" | "result", body: unknown) => http.tool(new Request(`http://localhost:3000/${action}`, { method: "POST", headers: { "x-booklet-tool-key": "x".repeat(32) }, body: JSON.stringify(body) }), action);
    expect((await callback("authorize", identity)).status).toBe(200);
    const payload = { ...identity, inputFingerprint: "a".repeat(64), result: { kind: "ask", payload: { question: "What color is the kite?" } } };
    const response = await callback("result", payload);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { reused: false, state: "succeeded", materialization: { questionId: operationId } } });
    const replay = await callback("result", payload);
    expect(await replay.json()).toEqual({ data: { reused: true, state: "succeeded", materialization: { questionId: operationId } } });
  });
});
