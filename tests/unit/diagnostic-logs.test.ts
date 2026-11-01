import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/diagnostics/logs/route";
import { countVerificationRead, measurePhase, recentDiagnostics, retainAdmissionRead } from "@/lib/experiment-runner/diagnostics";

const runId = "123e4567-e89b-42d3-a456-426614174000";
const request = (query = "", authenticated = true) => new Request(`https://example.test/api/diagnostics/logs${query}`, {
  headers: authenticated ? { authorization: `Basic ${btoa("booklet:abcdefghijklmnop")}` } : {},
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("staging diagnostic logs", () => {
  it("retains at most twenty sanitized admission results across module reloads with independent returned copies", async () => {
    const result = { runId, persona: "playful_kid" as const, part: "proofs" as const,
      compression: { state: "configured" as const, requested: "zlib" as const, negotiated: "unavailable" as const },
      value: { rows: 6, decodedJsonBytes: 1234, queryElapsedMs: 8, plan: null },
      metrics: { checkoutCount: 1, checkoutFailed: 0, checkoutMs: 1, commands: [], droppedCommands: 0 },
      metricsStatus: "unavailable" as const, elapsedMs: 10, totalElapsedMs: 12 };
    for (let i = 0; i < 21; i++) retainAdmissionRead(result);
    const saved = recentDiagnostics(runId, 500).admissionReads;
    expect(saved).toHaveLength(20); saved[0].value!.rows = 99;
    vi.resetModules(); const reloaded = await import("@/lib/experiment-runner/diagnostics");
    expect(reloaded.recentDiagnostics(runId, 500).admissionReads[0].value!.rows).toBe(6);
    expect(reloaded.recentDiagnostics("other-run", 500).admissionReads).toEqual([]);
  });
  it("records only returned JSON byte counts and propagates unavailable size without failing the read", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const rows = [{ evidence: "private-proof-body" }];
    await measurePhase({ runId }, "outer", () => measurePhase({ runId }, "read", async () => countVerificationRead(rows)));
    expect(recentDiagnostics(runId, 1).events[0]).toMatchObject({ readRows: 1,
      readJsonBytes: Buffer.byteLength(JSON.stringify(rows[0]), "utf8") });
    expect(JSON.stringify(recentDiagnostics(runId, 2))).not.toContain("private-proof-body");
    await measurePhase({ runId }, "outer", () => measurePhase({ runId }, "read", async () => countVerificationRead([1n])));
    expect(recentDiagnostics(runId, 1).events[0]).toMatchObject({ outcome: "succeeded", readRows: 1, readJsonBytes: null });
  });
  it("requires existing authentication and is unavailable outside staging", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "_staging"); vi.stubEnv("ACCESS_GATE_PASSWORD", "abcdefghijklmnop");
    expect((await GET(request("", false))).status).toBe(401);
    for (const environment of ["_prod", "local", ""]) {
      vi.stubEnv("DEPLOYMENT_ENV", environment);
      expect((await GET(request())).status).toBe(404);
    }
  });
  it("filters bounded structured events and retains redacted exception details", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "_staging"); vi.stubEnv("ACCESS_GATE_PASSWORD", "abcdefghijklmnop");
    vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(measurePhase({ runId }, "authorization", async () => {
      throw new Error("Provider rejected request\nAuthorization: Bearer private-token\nAccess credential: abcdefghijklmnop");
    })).rejects.toThrow();
    await measurePhase({ runId }, "context", async () => 1);
    const response = await GET(request(`?runId=${runId}&limit=1`));
    const body = await response.json();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.data.events).toHaveLength(1);
    expect(body.data.events[0]).toMatchObject({ runId, phase: "context", outcome: "succeeded" });
    expect(body.data.truncated).toBe(true);
    expect(JSON.stringify(recentDiagnostics(runId, 500))).not.toContain("private-token");
    expect(JSON.stringify(recentDiagnostics(runId, 500))).not.toContain("abcdefghijklmnop");
    expect(recentDiagnostics(runId, 500).events.find(event => event.outcome === "failed")?.error)
      .toMatchObject({ redacted: true, details: { message: expect.stringContaining("Provider rejected request") } });
    expect(recentDiagnostics(runId, 500).events.find(event => event.outcome === "failed")?.failure)
      .toEqual({ errorKind: "Error", code: "completion_failed" });
    for (const query of ["?limit=501", "?limit=0", "?runId=invalid", "?path=/etc/passwd"]) expect((await GET(request(query))).status).toBe(400);
  });
  it("keeps allowlisted failure summaries separate from detailed exception evidence", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const error = Object.assign(new Error("private-connection-and-payload"), { name: "MongoOperationTimeoutError", code: "private-code" });
    await expect(measurePhase({ runId }, "create_mutation", async () => { throw error; })).rejects.toBe(error);
    const event = recentDiagnostics(runId, 1).events[0];
    expect(event.failure).toEqual({ errorKind: "MongoOperationTimeoutError", code: "completion_failed" });
    expect(event.error?.details).toMatchObject({ name: "MongoOperationTimeoutError",
      message: "private-connection-and-payload", code: "private-code" });
  });
  it("retains at most 5000 events across module reloads", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    for (let i = 0; i < 5001; i++) await measurePhase({ runId }, "claim", async () => 1);
    expect(recentDiagnostics(undefined, 10000).events).toHaveLength(5000);
    vi.resetModules();
    const reloaded = await import("@/lib/experiment-runner/diagnostics");
    expect(reloaded.recentDiagnostics(runId, 1).events).toHaveLength(1);
    expect(reloaded.recentDiagnostics(runId, 1).truncated).toBe(true);
  });
});
