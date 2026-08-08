import { describe, expect, it } from "vitest";
import { getServerEnv, resolveImageProviderProfile } from "@/lib/config/env";

describe("image provider environment", () => {
  it("uses the real provider and forces low-latency settings in fast mode", () => {
    const env = getServerEnv({
      NODE_ENV: "test",
      OPENAI_API_KEY: "test-key",
      IMAGE_PROVIDER_MODE: "fast",
      IMAGE_QUALITY: "high",
    });

    expect(resolveImageProviderProfile(env)).toEqual({
      runtime: "real",
      quality: "low",
      fastOutput: true,
    });
  });

  it("preserves configured quality for normal real mode", () => {
    const env = getServerEnv({
      NODE_ENV: "test",
      OPENAI_API_KEY: "test-key",
      IMAGE_PROVIDER_MODE: "real",
      IMAGE_QUALITY: "high",
    });

    expect(resolveImageProviderProfile(env)).toEqual({
      runtime: "real",
      quality: "high",
      fastOutput: false,
    });
  });
});
