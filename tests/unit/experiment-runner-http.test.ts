import { describe, expect, it, vi } from "vitest";
import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";
import type { ConfigState } from "@/lib/experiment-runner/config";

const disabled: ConfigState = { enabled: false, reason: "disabled" };
const invalid: ConfigState = { enabled: false, reason: "invalid" };
const enabled: ConfigState = { enabled: true, config: { enabled: true, baseUrl: "https://dify.example.test", publicOrigin: "http://localhost:3000", callbackKey: "x".repeat(32), bindings: [] } };
const request = (headers: Record<string, string> = {}, body = "{}") => new Request("http://localhost:3000/api/experiments/booklet-tools/authorize", { method: "POST", headers, body });
const imageUrl = "http://localhost:3000/api/experiments/booklet-tools/image?runId=00000000-0000-4000-8000-000000000001&operationId=00000000-0000-4000-8000-000000000002&workflowRunId=00000000-0000-4000-8000-000000000003&inputFingerprint=" + "a".repeat(64);

describe("booklet runner HTTP boundary", () => {
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
