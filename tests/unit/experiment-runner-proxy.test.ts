import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

afterEach(() => vi.unstubAllEnvs());
const paths = ["authorize", "context", "result", "failure"].map((name) => `/api/experiments/booklet-tools/${name}`);
function check(path: string) { return proxy(new NextRequest(`https://booklet.test${path}`)).status; }
describe("runner callback proxy boundary", () => {
  it("exempts only the four enabled non-production machine paths", () => {
    vi.stubEnv("DEPLOYMENT_ENV", "_staging"); vi.stubEnv("DIFY_BOOKLET_RUNNER_ENABLED", "true");
    for (const path of paths) expect(check(path)).toBe(200);
    for (const path of [paths[0] + "/extra", "/api/experiments/booklet-runs", "/api/experiments/booklet-tools/unknown"]) expect(check(path)).toBe(401);
    vi.stubEnv("DIFY_BOOKLET_RUNNER_ENABLED", "false");
    for (const path of paths) expect(check(path)).toBe(401);
    vi.stubEnv("DIFY_BOOKLET_RUNNER_ENABLED", "true"); vi.stubEnv("DEPLOYMENT_ENV", "_prod");
    for (const path of paths) expect(check(path)).toBe(401);
  });
  it("preserves the independent Community diagnostic exception", () => {
    vi.stubEnv("DEPLOYMENT_ENV", "_staging"); vi.stubEnv("DIFY_BOOKLET_RUNNER_ENABLED", "false"); vi.stubEnv("DIFY_COMMUNITY_PROBE_ENABLED", "true");
    expect(check("/api/integrations/dify-community/callback")).toBe(200);
    expect(check("/api/integrations/dify-community/callback/extra")).toBe(401);
  });
});
