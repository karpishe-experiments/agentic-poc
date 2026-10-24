import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ diagnose: vi.fn(), config: vi.fn(), database: vi.fn() }));
vi.mock("@/db/experiment-admission-diagnostics", () => ({ diagnoseAdmissionRead: mocks.diagnose }));
vi.mock("@/lib/experiment-runner/m4-config", () => ({ readM4RunnerConfig: mocks.config }));
vi.mock("@/db/client", () => ({ getDatabase: mocks.database }));
import { GET } from "@/app/api/diagnostics/logs/route";
const request = (query: string, authenticated = true) => new Request(`https://example.test/api/diagnostics/logs?${query}`, {
  headers: authenticated ? { authorization: `Basic ${btoa("booklet:abcdefghijklmnop")}` } : {},
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
describe("bounded admission read endpoint", () => {
  it("keeps a started read within its original budget after navigation observation disconnects", async () => {
    vi.stubEnv("ACCESS_GATE_PASSWORD", "abcdefghijklmnop"); vi.stubEnv("DEPLOYMENT_ENV", "_staging");
    mocks.config.mockReturnValue({ enabled: true, config: { m4: { state: "granted", authority: { grant: {} } } } });
    const controller = new AbortController();
    mocks.diagnose.mockImplementation(async () => {
      controller.abort();
      const { operationSignal, operationBudgetRemainingMs } = await import("@/lib/operations/budget");
      expect(operationSignal()?.aborted).toBe(false);
      expect(operationBudgetRemainingMs()).toBeLessThanOrEqual(30_000);
      return { readOnly: true };
    });
    const original = request("probe=admission-read&persona=playful_kid&part=proofs");
    expect((await GET(new Request(original, { signal: controller.signal }))).status).toBe(200);
    expect(mocks.diagnose).toHaveBeenCalledTimes(1);
  });
  it("rejects unauthenticated, non-staging and arbitrary query targets before database access", async () => {
    vi.stubEnv("ACCESS_GATE_PASSWORD", "abcdefghijklmnop"); vi.stubEnv("DEPLOYMENT_ENV", "_staging");
    const query = "probe=admission-read&persona=playful_kid&part=proofs";
    expect((await GET(request(query, false))).status).toBe(401);
    vi.stubEnv("DEPLOYMENT_ENV", "_prod"); expect((await GET(request(query))).status).toBe(404);
    vi.stubEnv("DEPLOYMENT_ENV", "_staging");
    for (const bad of [query + "&collection=secrets", query + "&runId=arbitrary", query + "&persona=enthusiast_parent",
      "probe=admission-read&persona=professional_creator&part=proofs", "probe=admission-read&persona=playful_kid&part=arbitrary"]) {
      expect((await GET(request(bad))).status).toBe(400);
    }
    expect(mocks.config).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
  });
  it("requires reviewed authority and runs only the selected read with an active 30-second bound", async () => {
    vi.stubEnv("ACCESS_GATE_PASSWORD", "abcdefghijklmnop"); vi.stubEnv("DEPLOYMENT_ENV", "_staging");
    const query = "probe=admission-read&persona=enthusiast_parent&part=plan";
    mocks.config.mockReturnValue({ enabled: false }); expect((await GET(request(query))).status).toBe(409);
    const authority = { grant: {} }; const database = {};
    mocks.config.mockReturnValue({ enabled: true, config: { m4: { state: "granted", authority } } }); mocks.database.mockReturnValue(database);
    mocks.diagnose.mockImplementation(async () => {
      const { operationBudgetRemainingMs } = await import("@/lib/operations/budget");
      expect(operationBudgetRemainingMs()).toBeGreaterThan(0); expect(operationBudgetRemainingMs()).toBeLessThanOrEqual(30_000);
      return { rows: 3 };
    });
    const response = await GET(request(query));
    expect(await response.json()).toEqual({ data: { rows: 3 } }); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.diagnose).toHaveBeenCalledExactlyOnceWith(database, authority, "enthusiast_parent", "plan");
    mocks.diagnose.mockRejectedValue(new Error("private URI and proof"));
    const failed = await GET(request(query)); expect(failed.status).toBe(409); expect(JSON.stringify(await failed.json())).not.toContain("private");
  });
});
