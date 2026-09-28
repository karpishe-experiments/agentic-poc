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

  it("keeps the Community probe disabled outside configured staging", () => {
    const base = { NODE_ENV: "test" as const, OPENAI_API_KEY: "test-key", ASSET_STORAGE: "s3", OBJECT_STORE_ENDPOINT: "https://storage.example", ASSETS_BUCKET: "assets", DIAGNOSTICS_BUCKET: "diagnostics", RECOVERY_BUCKET: "recovery", ACCESS_GATE_PASSWORD: "sixteen-characters", MONGODB_DATABASE: "kids_booklet" };
    const configured = { ...base, DEPLOYMENT_ENV: "_staging", DIFY_COMMUNITY_PROBE_ENABLED: "true", DIFY_COMMUNITY_BASE_URL: "https://dify.uniwares.co.uk", DIFY_COMMUNITY_WORKFLOW_API_KEY: "workflow-key", DIFY_COMMUNITY_CALLBACK_KEY: "a".repeat(32) };
    expect(getServerEnv(configured).DIFY_COMMUNITY_PROBE_ENABLED).toBe(true);
    expect(() => getServerEnv({ ...configured, DIFY_COMMUNITY_CALLBACK_KEY: undefined })).toThrow(/DIFY_COMMUNITY_CALLBACK_KEY/);
    expect(() => getServerEnv({ ...configured, DIFY_COMMUNITY_BASE_URL: "http://dify.uniwares.co.uk" })).toThrow(/HTTPS origin/);
    expect(() => getServerEnv({ ...configured, DEPLOYMENT_ENV: "_prod", MONGODB_DATABASE: "kids_booklet_prod" })).toThrow(/staging-only/);
  });
});
