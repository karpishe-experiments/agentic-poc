import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getContext } = vi.hoisted(() => ({ getContext: vi.fn(async () => ({ project_id: "booklet-dify-trial", active_run_id: null })) }));
vi.mock("@/lib/dify-experiment/get-service", () => ({ getDifyExperimentService: () => ({ getContext }) }));

import { POST as getProjectContext } from "@/app/api/experiments/dify/tools/context/route";
import { proxy } from "@/proxy";

afterEach(() => { vi.unstubAllEnvs(); getContext.mockClear(); });

describe("Dify tool route authentication", () => {
  it("rejects missing and incorrect tool keys before reading the project", async () => {
    vi.stubEnv("DIFY_TOOL_KEY", "0123456789abcdef0123456789abcdef");
    for (const key of [null, "wrong-key"]) {
      const response = await getProjectContext(new Request("https://staging.example/api/experiments/dify/tools/context", {
        method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "X-Booklet-Tool-Key": key } : {}) }, body: JSON.stringify({ project_id: "booklet-dify-trial" }),
      }));
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "tool_unauthorized" } });
    }
    expect(getContext).not.toHaveBeenCalled();
  });

  it("accepts the exact key only for a staging tool path", async () => {
    const key = "0123456789abcdef0123456789abcdef";
    vi.stubEnv("DIFY_TOOL_KEY", key);
    vi.stubEnv("DEPLOYMENT_ENV", "_staging");
    vi.stubEnv("DIFY_EXPERIMENT_ENABLED", "false");
    vi.stubEnv("ACCESS_GATE_PASSWORD", "sixteen-chars-ok!");

    const response = await getProjectContext(new Request("https://staging.example/api/experiments/dify/tools/context", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Booklet-Tool-Key": key }, body: JSON.stringify({ project_id: "booklet-dify-trial" }),
    }));
    expect(response.status).toBe(200);
    expect(getContext).toHaveBeenCalledOnce();

    for (const path of ["/api/experiments/dify/approve", "/api/experiments/dify/assets/panel-1", "/api/experiments/dify/image/recover", "/api/experiments/dify/tools/context/extra", "/api/experiments/dify/tools/image/authorize/extra"]) {
      const gated = proxy(new NextRequest(`https://staging.example${path}`, { headers: { "X-Booklet-Tool-Key": key } }));
      expect(gated.status).toBe(401);
    }
    expect(proxy(new NextRequest("https://staging.example/api/experiments/dify/tools/context", { headers: { "X-Booklet-Tool-Key": key } })).status).toBe(200);
    for (const path of ["/api/experiments/dify/tools/image/authorize", "/api/experiments/dify/tools/image/complete", "/api/experiments/dify/tools/image/failure"]) {
      expect(proxy(new NextRequest(`https://staging.example${path}`, { headers: { "X-Booklet-Tool-Key": key } })).status).toBe(200);
    }
    vi.stubEnv("DEPLOYMENT_ENV", "_prod");
    expect(proxy(new NextRequest("https://staging.example/api/experiments/dify/tools/context", { headers: { "X-Booklet-Tool-Key": key } })).status).toBe(401);
  });
});
