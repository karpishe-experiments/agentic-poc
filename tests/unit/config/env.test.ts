import { describe, expect, it } from "vitest";
import { getServerEnv, resolveComicCopyMode, resolveImageProviderProfile, resolvePageImageQuality } from "@/lib/config/env";

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

  it("defaults comic copy to creative and keeps lettered pages at medium or above", () => {
    expect(resolveComicCopyMode({})).toBe("creative");
    expect(resolveComicCopyMode({ COMIC_COPY_MODE: "exact" })).toBe("exact");
    expect(resolvePageImageQuality("low")).toBe("medium");
    expect(resolvePageImageQuality("high")).toBe("high");
  });
});
