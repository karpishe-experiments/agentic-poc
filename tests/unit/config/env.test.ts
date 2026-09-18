import { describe, expect, it } from "vitest";
import { getServerEnv, resolveComicCopyMode } from "@/lib/config/env";

describe("runtime environment", () => {
  it("supports only fake and real image-provider modes", () => {
    expect(getServerEnv({ NODE_ENV: "test", OPENAI_API_KEY: "test-key", IMAGE_PROVIDER_MODE: "real" }).IMAGE_PROVIDER_MODE).toBe("real");
    expect(() => getServerEnv({ NODE_ENV: "test", OPENAI_API_KEY: "test-key", IMAGE_PROVIDER_MODE: "fast" })).toThrow();
  });

  it("does not expose global image model or quality configuration", () => {
    const env = getServerEnv({ NODE_ENV: "test", OPENAI_API_KEY: "test-key", OPENAI_IMAGE_MODEL: "gpt-image-2", OPENAI_IMAGE_QUALITY: "high" });
    expect(env).not.toHaveProperty("OPENAI_IMAGE_MODEL");
    expect(env).not.toHaveProperty("OPENAI_IMAGE_QUALITY");
    expect(resolveComicCopyMode({})).toBe("creative");
    expect(resolveComicCopyMode({ COMIC_COPY_MODE: "exact" })).toBe("exact");
  });

  it("parses the local Dify flag and optional runtime settings", () => {
    const disabled = getServerEnv({ NODE_ENV: "test", OPENAI_API_KEY: "test-key" });
    expect(disabled).toMatchObject({ DIFY_EXPERIMENT_ENABLED: false, DIFY_EXPERIMENT_MODE: "fake", DIFY_IMAGE_ENABLED: false, DIFY_IMAGE_MAX_ATTEMPTS: 2 });
    const enabled = getServerEnv({ NODE_ENV: "test", OPENAI_API_KEY: "test-key", DIFY_EXPERIMENT_ENABLED: "true", DIFY_EXPERIMENT_MODE: "real", DIFY_IMAGE_ENABLED: "true", DIFY_IMAGE_MAX_ATTEMPTS: "2" });
    expect(enabled).toMatchObject({ DIFY_EXPERIMENT_ENABLED: true, DIFY_EXPERIMENT_MODE: "real", DIFY_IMAGE_ENABLED: true, DIFY_IMAGE_MAX_ATTEMPTS: 2 });
    expect(enabled.DIFY_IMAGE_OPENAI_API_KEY).toBeUndefined();
    expect(getServerEnv({ NODE_ENV: "test", OPENAI_API_KEY: "test-key", DIFY_IMAGE_OPENAI_API_KEY: "image-test-key" }).DIFY_IMAGE_OPENAI_API_KEY).toBe("image-test-key");
    expect(() => getServerEnv({ NODE_ENV: "test", OPENAI_API_KEY: "test-key", DIFY_IMAGE_MAX_ATTEMPTS: "3" })).toThrow();
  });
});
