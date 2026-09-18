import { describe, expect, it, vi } from "vitest";
import type { getServerEnv } from "@/lib/config/env";
import { isDifyExperimentAvailable } from "@/lib/dify-experiment/availability";

function available(deployment: "local" | "_staging" | "_prod", mode: "fake" | "real", enabled = true) {
  return isDifyExperimentAvailable({ DEPLOYMENT_ENV: deployment, DIFY_EXPERIMENT_MODE: mode, DIFY_EXPERIMENT_ENABLED: enabled } as ReturnType<typeof getServerEnv>);
}

describe("Dify experiment availability", () => {
  it("allows staging regardless of the host flag and never allows production", () => {
    expect(available("_staging", "real")).toBe(true);
    expect(available("_prod", "fake")).toBe(false);
    expect(available("_staging", "fake", false)).toBe(true);
    expect(available("_prod", "real", true)).toBe(false);
  });

  it("limits local access to fake mode on a development server", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(available("local", "fake")).toBe(true);
    expect(available("local", "fake", false)).toBe(false);
    expect(available("local", "real")).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(available("local", "fake")).toBe(false);
    vi.unstubAllEnvs();
  });
});
