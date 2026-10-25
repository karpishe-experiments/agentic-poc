import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ diagnose: vi.fn(), config: vi.fn(), database: vi.fn() }));
vi.mock("@/db/experiment-preparation-diagnostics", () => ({ diagnosePreparationRead: mocks.diagnose }));
vi.mock("@/lib/experiment-runner/m4-config", () => ({ readM4RunnerConfig: mocks.config }));
vi.mock("@/db/client", () => ({ getDatabase: mocks.database }));
import { GET } from "@/app/api/diagnostics/logs/route";

const request = (query: string, authenticated = true) => new Request(`https://example.test/api/diagnostics/logs?${query}`, {
  headers: authenticated ? { authorization: `Basic ${btoa("booklet:abcdefghijklmnop")}` } : {},
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("fixed preparation diagnostic route", () => {
  it("requires staging authorization and rejects target or duplicate parameters before loading config", async () => {
    vi.stubEnv("ACCESS_GATE_PASSWORD", "abcdefghijklmnop"); vi.stubEnv("DEPLOYMENT_ENV", "_staging");
    expect((await GET(request("probe=preparation-read&part=questions", false))).status).toBe(401);
    vi.stubEnv("DEPLOYMENT_ENV", "_prod");
    expect((await GET(request("probe=preparation-read&part=questions"))).status).toBe(404);
    vi.stubEnv("DEPLOYMENT_ENV", "_staging");
    for (const query of ["probe=preparation-read", "probe=preparation-read&part=other",
      "probe=preparation-read&part=questions&part=manager", "probe=preparation-read&part=questions&runId=arbitrary",
      "probe=preparation-read&part=manager&collection=messages"]) {
      expect((await GET(request(query))).status).toBe(400);
    }
    expect(mocks.config).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
  });

  it.each(["questions", "manager"] as const)("runs only %s within the existing 30-second budget", async part => {
    vi.stubEnv("ACCESS_GATE_PASSWORD", "abcdefghijklmnop"); vi.stubEnv("DEPLOYMENT_ENV", "_staging");
    const authority = { grant: {} }, database = {};
    mocks.config.mockReturnValue({ enabled: true, config: { m4: { state: "granted", authority } } });
    mocks.database.mockReturnValue(database);
    mocks.diagnose.mockImplementation(async () => {
      const { operationBudgetRemainingMs } = await import("@/lib/operations/budget");
      expect(operationBudgetRemainingMs()).toBeGreaterThan(0);
      expect(operationBudgetRemainingMs()).toBeLessThanOrEqual(30_000);
      return { rows: 1 };
    });
    const result = await GET(request(`probe=preparation-read&part=${part}`));
    expect(result.status).toBe(200); expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.diagnose).toHaveBeenCalledExactlyOnceWith(database, authority, part);
    mocks.diagnose.mockRejectedValue(new Error("private prompt and URI"));
    expect(JSON.stringify(await (await GET(request(`probe=preparation-read&part=${part}`))).json())).not.toContain("private");
  });
});
