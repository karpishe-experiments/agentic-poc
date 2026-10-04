import { describe, expect, it } from "vitest";
import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";
import type { ConfigState } from "@/lib/experiment-runner/config";

const disabled: ConfigState = { enabled: false, reason: "disabled" };
const invalid: ConfigState = { enabled: false, reason: "invalid" };
const enabled: ConfigState = { enabled: true, config: { enabled: true, baseUrl: "https://dify.example.test", publicOrigin: "http://localhost:3000", callbackKey: "x".repeat(32), bindings: [] } };
const request = (headers: Record<string, string> = {}, body = "{}") => new Request("http://localhost:3000/api/experiments/booklet-tools/authorize", { method: "POST", headers, body });

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
});
