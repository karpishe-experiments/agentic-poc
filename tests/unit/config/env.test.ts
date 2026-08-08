import { describe, expect, it } from "vitest";
import { getServerEnv, resolveComicCopyMode, resolveImageProviderProfile } from "@/lib/config/env";

describe("image provider environment", () => {
  it("supports only fake and real provider modes with an independent quality control", () => {
    const env = getServerEnv({
      NODE_ENV: "test",
      OPENAI_API_KEY: "test-key",
      IMAGE_PROVIDER_MODE: "real",
      OPENAI_IMAGE_QUALITY: "high",
    });

    expect(resolveImageProviderProfile(env)).toEqual({
      runtime: "real",
      quality: "high",
    });
    expect(() => getServerEnv({ NODE_ENV: "test", OPENAI_API_KEY: "test-key", IMAGE_PROVIDER_MODE: "fast" })).toThrow();
  });

  it("defaults image quality to disabled and comic copy to creative", () => {
    const env = getServerEnv({ NODE_ENV: "test", OPENAI_API_KEY: "test-key" });
    expect(env.OPENAI_IMAGE_QUALITY).toBe("disabled");
    expect(resolveComicCopyMode({})).toBe("creative");
    expect(resolveComicCopyMode({ COMIC_COPY_MODE: "exact" })).toBe("exact");
  });
});
