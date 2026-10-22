import { describe, expect, it, vi } from "vitest";
import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";
import type { ConfigState } from "@/lib/experiment-runner/config";
import * as repositoryModule from "@/db/experiment-repository";
import type { Database } from "@/db/client";
import type { AssetStore } from "@/lib/assets/asset-store";

const disabled: ConfigState = { enabled: false, reason: "disabled" };
const invalid: ConfigState = { enabled: false, reason: "invalid" };
const enabled: ConfigState = { enabled: true, config: { enabled: true, baseUrl: "https://dify.example.test", publicOrigin: "http://localhost:3000", callbackKey: "x".repeat(32), bindings: [] } };
const request = (headers: Record<string, string> = {}, body = "{}") => new Request("http://localhost:3000/api/experiments/booklet-tools/authorize", { method: "POST", headers, body });
const imageUrl = "http://localhost:3000/api/experiments/booklet-tools/image?runId=00000000-0000-4000-8000-000000000001&operationId=00000000-0000-4000-8000-000000000002&workflowRunId=00000000-0000-4000-8000-000000000003&inputFingerprint=" + "a".repeat(64);

describe("booklet runner HTTP boundary", () => {
  it("retains exact mutation ownership for a failure callback", async () => {
    const runId = "00000000-0000-4000-8000-000000000001";
    const operationId = "00000000-0000-4000-8000-000000000002";
    const failOperation = vi.fn().mockResolvedValue({ state: "failed" });
    const factory = vi.spyOn(repositoryModule, "createExperimentRepository").mockReturnValue({
      getRun: async () => ({ mode: "simulated" }), failOperation,
    } as unknown as ReturnType<typeof repositoryModule.createExperimentRepository>);
    const ownership = vi.fn();
    const mutate: typeof import("@/lib/application/deployment-control").runTrackedMutation = async (operation, options) => {
      ownership(options); return operation();
    };
    try {
      const http = createBookletRunnerHttp({ config: () => enabled, database: () => ({ collections: {} } as Database),
        store: () => ({} as AssetStore), mutate });
      const response = await http.tool(request({ "x-booklet-tool-key": "x".repeat(32) }, JSON.stringify({ runId, operationId,
        workflowRunId: "00000000-0000-4000-8000-000000000003", parentWorkflowRunId: null, category: "definite_failure" })), "failure");
      expect(response.status).toBe(200);
      expect(ownership).toHaveBeenCalledWith({ admitted: true, runId, operationId });
    } finally { factory.mockRestore(); }
  });
  it("pages summary metadata without constructing artifact or storage views", async () => {
    const rows = [{ _id: "run-1", persona: "playful_kid", status: "completed", createdAtMs: 1000, updatedAtMs: 2000, counters: {}, limits: {}, configurationJson: "private" },
      { _id: "run-2" }];
    const cursor = { sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue(rows) };
    const find = vi.fn().mockReturnValue(cursor);
    const store = vi.fn(() => { throw new Error("Summary must not read bytes"); });
    const http = createBookletRunnerHttp({ config: () => enabled,
      database: () => ({ collections: { experiment_runs: { find } } } as unknown as Database), store });
    const response = await http.summaries(new Request("http://localhost:3000/api/experiments/booklet-runs/summaries?page=2&limit=1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { page: 2, hasMore: true, runs: [{ runId: "run-1", createdAtMs: 1000, updatedAtMs: 2000 }] } });
    expect(cursor.skip).toHaveBeenCalledWith(2);
    expect(cursor.limit).toHaveBeenCalledWith(2);
    expect(find.mock.calls[0][1].projection.configurationJson).toBeUndefined();
    expect(find.mock.calls[0][1].projection).toMatchObject({ createdAtMs: 1, updatedAtMs: 1 });
    expect(store).not.toHaveBeenCalled();
    expect((await http.summaries(new Request("http://localhost:3000/api/experiments/booklet-runs/summaries?limit=1000"))).status).toBe(400);
    expect(find).toHaveBeenCalledTimes(1);
  });
  it("protects inspect and stop before reading operation state", async () => {
    const database = vi.fn(() => { throw new Error("unexpected database access"); });
    const http = createBookletRunnerHttp({ config: () => enabled, database });
    const runId = "00000000-0000-4000-8000-000000000001";
    for (const action of ["inspect", "stop"] as const) {
      expect((await http.operationControl(request({ origin: "http://localhost:3001" }), runId, action)).status).toBe(403);
      expect((await http.operationControl(request({ origin: "http://localhost:3000" }), runId, action)).status).toBe(400);
      vi.stubEnv("DEPLOYMENT_ENV", "_staging");
      vi.stubEnv("ACCESS_GATE_PASSWORD", "fixture-password-long-enough");
      try {
        expect((await http.operationControl(request({ origin: "http://localhost:3000" }), runId, action)).status).toBe(401);
      } finally { vi.unstubAllEnvs(); }
    }
    expect(database).not.toHaveBeenCalled();
  });
  it("acknowledges saved J13 manager delegation and duplicate completion", async () => {
    const runId = "00000000-0000-4000-8000-000000000001";
    const operationId = "00000000-0000-4000-8000-000000000002";
    const workflowRunId = "00000000-0000-4000-8000-000000000003";
    const completeOperation = vi.fn().mockResolvedValueOnce({ reused: false, operation: {
      state: "succeeded", materializationJson: JSON.stringify({ delegatedTaskId: "J13", privateField: "not-returned" }),
    } }).mockResolvedValueOnce({ reused: true, operation: {
      state: "succeeded", materializationJson: JSON.stringify({ delegatedTaskId: "J13" }),
    } });
    const factory = vi.spyOn(repositoryModule, "createExperimentRepository").mockReturnValue({
      getRun: async () => ({ mode: "simulated" }), completeOperation,
    } as unknown as ReturnType<typeof repositoryModule.createExperimentRepository>);
    try {
      const http = createBookletRunnerHttp({ config: () => enabled,
        database: () => ({ collections: {} } as Database), store: () => ({} as AssetStore),
        mutate: (operation) => operation() });
      const payload = { runId, operationId, workflowRunId, parentWorkflowRunId: null,
        inputFingerprint: "a".repeat(64), result: { kind: "delegate", payload: { taskId: "J13", subjectKind: "page", subjectId: runId } } };
      for (const reused of [false, true]) {
        const response = await http.tool(request({ "x-booklet-tool-key": "x".repeat(32) }, JSON.stringify(payload)), "result");
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ data: { reused, state: "succeeded", materialization: { delegatedTaskId: "J13" } } });
      }
      expect(completeOperation).toHaveBeenCalledTimes(2);
    } finally { factory.mockRestore(); }
  });
  it("returns bounded disabled and invalid setup responses without connecting to MongoDB", async () => {
    const off = createBookletRunnerHttp({ config: () => disabled, database: () => { throw new Error("unexpected database access"); } });
    expect((await off.tool(request(), "authorize")).status).toBe(404);
    const bad = createBookletRunnerHttp({ config: () => invalid, database: () => { throw new Error("unexpected database access"); } });
    expect((await bad.tool(request(), "authorize")).status).toBe(503);
  });
  it("checks the callback key before parsing or database access", async () => {
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); } });
    const response = await http.tool(request({}, "not-json"), "authorize");
    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(JSON.stringify(payload)).not.toContain("not-json");
    expect(payload).toEqual({ error: { code: "unauthorized", message: "Authentication is required." } });
  });
  it("treats invalid UTF-8 as malformed JSON after authentication", async () => {
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); } });
    const response = await http.tool(new Request("http://localhost:3000", { method: "POST", headers: { "x-booklet-tool-key": "x".repeat(32) }, body: new Uint8Array([0xff]) }), "authorize");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "invalid_request", message: "Request is invalid." } });
  });
  it("requires exact browser origin and a UUID replay key", async () => {
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); } });
    expect((await http.create(request({ origin: "http://localhost:3001" }))).status).toBe(403);
    expect((await http.create(request({ origin: "http://localhost:3000" }))).status).toBe(400);
  });
  it("validates page selection origin, identity and body before database access", async () => {
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); } });
    const runId = "00000000-0000-4000-8000-000000000001";
    expect((await http.selectPages(request({ origin: "http://localhost:3001" }), runId)).status).toBe(403);
    expect((await http.selectPages(request({ origin: "http://localhost:3000" }), runId)).status).toBe(400);
    const headers = { origin: "http://localhost:3000", "idempotency-key": runId };
    expect((await http.selectPages(request(headers, "not-json"), runId)).status).toBe(400);
    const batch = { schemaVersion: "2", runId, configurationHash: "a".repeat(64), layoutVersionId: runId,
      selection: "single", pages: [{ pageId: runId, pageBibleVersionId: runId, previousPageVersionId: null }] };
    expect((await http.selectPages(request(headers, JSON.stringify({ expectedRevision: 0, batch })),
      "00000000-0000-4000-8000-000000000002")).status).toBe(400);
    const blocked = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); },
      mutate: async () => { throw new Error("maintenance"); } });
    expect((await blocked.selectPages(request(headers, JSON.stringify({ expectedRevision: 0, batch })), runId)).status).toBe(503);
    const off = createBookletRunnerHttp({ config: () => disabled, database: () => { throw new Error("unexpected database access"); } });
    expect((await off.selectPages(request(headers), runId)).status).toBe(404);
  });
  it("requires staging browser authentication for page selection", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "staging");
    vi.stubEnv("ACCESS_GATE_PASSWORD", "test-only-password-long-enough");
    try {
      const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); } });
      expect((await http.selectPages(request({ origin: "http://localhost:3000" }),
        "00000000-0000-4000-8000-000000000001")).status).toBe(401);
    } finally { vi.unstubAllEnvs(); }
  });
  it("keeps image callbacks closed when disabled or in production", async () => {
    for (const state of [disabled, { enabled: false, reason: "production" } as ConfigState]) {
      const http = createBookletRunnerHttp({ config: () => state, database: () => { throw new Error("unexpected database access"); } });
      expect((await http.imageFixture(new Request(imageUrl))).status).toBe(404);
      expect((await http.imageComplete(new Request(imageUrl, { method: "POST", body: "bad" }))).status).toBe(404);
    }
  });
  it("authenticates before parsing image query or reading the body", async () => {
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); } });
    expect((await http.imageFixture(new Request(imageUrl + "&extra=1"))).status).toBe(401);
    expect((await http.imageComplete(new Request(imageUrl + "&extra=1", { method: "POST", body: "bad" }))).status).toBe(401);
    const key = { "x-booklet-tool-key": "x".repeat(32) };
    for (const suffix of ["&extra=1", "&runId=00000000-0000-4000-8000-000000000001", "&workflowRunId=bad"]) {
      expect((await http.imageFixture(new Request(imageUrl + suffix, { headers: key }))).status).toBe(400);
    }
    for (const suffix of ["&parentWorkflowRunId=bad", "&inputFingerprint=bad"]) {
      expect((await http.imageFixture(new Request(imageUrl + suffix, { headers: key }))).status).toBe(400);
    }
    const oversized = await http.imageComplete(new Request(imageUrl, { method: "POST", headers: { ...key, "content-length": String(20 * 1024 * 1024 + 1) }, body: "x" }));
    expect(oversized.status).toBe(413);
  });
  it("applies maintenance admission before fixture database access", async () => {
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); }, admit: async () => { throw new Error("maintenance"); } });
    expect((await http.imageFixture(new Request(imageUrl, { headers: { "x-booklet-tool-key": "x".repeat(32) } }))).status).toBe(503);
  });

  it("bounds streamed image bytes even without Content-Length", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(20 * 1024 * 1024 + 1)); },
      cancel() { cancelled = true; },
    });
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); } });
    const response = await http.imageComplete(new Request(imageUrl, { method: "POST", headers: { "x-booklet-tool-key": "x".repeat(32) }, body: stream, duplex: "half" } as RequestInit & { duplex: "half" }));
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
  });

  it("keeps image completion closed during maintenance", async () => {
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); }, mutate: async () => { throw new Error("maintenance"); } });
    expect((await http.imageComplete(new Request(imageUrl, { method: "POST", headers: { "x-booklet-tool-key": "x".repeat(32) }, body: new Uint8Array([1, 2, 3]) }))).status).toBe(503);
  });
});
