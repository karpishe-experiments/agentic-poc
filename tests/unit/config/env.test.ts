import { describe, expect, it } from "vitest";
import { getServerEnv, resolveComicCopyMode } from "@/lib/config/env";

describe("runtime environment", () => {
  it("enables Community only with complete staging bindings, without changing Cloud settings", () => {
    const base = { NODE_ENV: "test", OPENAI_API_KEY: "test-key", DEPLOYMENT_ENV: "_staging", ASSET_STORAGE: "s3", OBJECT_STORE_ENDPOINT: "https://example.r2.cloudflarestorage.com", ASSETS_BUCKET: "assets", DIAGNOSTICS_BUCKET: "diagnostics", RECOVERY_BUCKET: "recovery", ACCESS_GATE_PASSWORD: "a-long-enough-password", DIFY_EXPERIMENT_ENABLED: "true", DIFY_EXPERIMENT_MODE: "real", DIFY_API_KEY: "cloud-app-key" } as const;
    expect(getServerEnv(base).DIFY_COMMUNITY_PROBE_ENABLED).toBe(false);
    const enabled = { ...base, DIFY_COMMUNITY_PROBE_ENABLED: "true", DIFY_COMMUNITY_BASE_URL: "https://dify.uniwares.co.uk", DIFY_COMMUNITY_WORKFLOW_API_KEY: "community-app-key", DIFY_COMMUNITY_CALLBACK_KEY: "c".repeat(32) };
    expect(getServerEnv(enabled)).toMatchObject({ DIFY_COMMUNITY_PROBE_ENABLED: true, DIFY_API_KEY: "cloud-app-key", DIFY_EXPERIMENT_ENABLED: true, DIFY_EXPERIMENT_MODE: "real" });
    expect(() => getServerEnv({ ...enabled, DIFY_COMMUNITY_WORKFLOW_API_KEY: undefined })).toThrow(/Required when/);
    expect(() => getServerEnv({ ...enabled, DEPLOYMENT_ENV: "_prod", MONGODB_DATABASE: "kids_booklet_prod" })).toThrow(/staging-only/);
    expect(() => getServerEnv({ ...enabled, DIFY_COMMUNITY_BASE_URL: "http://dify.uniwares.co.uk" })).toThrow(/HTTPS origin/);
    expect(() => getServerEnv({ ...enabled, DIFY_COMMUNITY_BASE_URL: "https://dify.uniwares.co.uk/v1" })).toThrow(/without a path/);
  });
  it("requires a host provider key unless a valid non-production experiment profile is enabled", () => {
    const slots = [["manager", null, null], ["specialist", "J01", null], ["specialist", "J02", null], ["tester", null, "playful_kid"], ["tester", null, "enthusiast_parent"], ["tester", null, "professional_creator"]];
    const bindings = slots.map(([role, taskId, persona], index) => ({ role, taskId, persona, appId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, publishedWorkflowId: "00000000-0000-4000-8000-000000000099", toolProviderId: null, apiKey: "private-fixture" }));
    const configured = { NODE_ENV: "test" as const, DIFY_BOOKLET_RUNNER_ENABLED: "true", DIFY_BOOKLET_BASE_URL: "https://dify.example.test", DIFY_BOOKLET_PUBLIC_ORIGIN: "http://localhost:3000", DIFY_BOOKLET_TOOL_KEY: "x".repeat(32), DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(bindings) };
    expect(() => getServerEnv({ NODE_ENV: "test" })).toThrow(/OPENAI_API_KEY/);
    expect(getServerEnv(configured).OPENAI_API_KEY).toBe("");
    expect(getServerEnv({ ...configured, OPENAI_API_KEY: "" }).OPENAI_API_KEY).toBe("");
    expect(() => getServerEnv({ NODE_ENV: "test", OPENAI_API_KEY: "" })).toThrow(/OPENAI_API_KEY/);
    expect(() => getServerEnv({ ...configured, DIFY_BOOKLET_BINDINGS_JSON: "bad" })).toThrow(/non-production bindings/);
    expect(() => getServerEnv({ ...configured, DEPLOYMENT_ENV: "_prod" })).toThrow(/non-production bindings/);
  });
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
    expect(() => getServerEnv({ NODE_ENV: "test", OPENAI_API_KEY: "test-key", DIFY_IMAGE_MAX_ATTEMPTS: "3" })).toThrow();
  });
});
