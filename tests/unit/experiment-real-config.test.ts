import { describe, expect, it } from "vitest";
import release from "@/lib/experiment-runner/m4-campaign-manifest.json";
import delivered from "@/lib/experiment-runner/real-readiness-manifest.json";
import { readM4RunnerConfig } from "@/lib/experiment-runner/m4-config";
import { executionPolicySnapshot, realExecutionPolicyFromM4TechnicalProfile } from "@/lib/experiment-runner/execution-policy";
import { m4TestId as id } from "@/tests/helpers/m4-policy";
import {
  REAL_IMAGE_PACKAGE_SHA256, REAL_IMAGE_PLUGIN_IDENTITY, REAL_TEXT_PACKAGE_SHA256,
  REAL_TEXT_PLUGIN_IDENTITY, realReadinessManifestSchema,
} from "@/lib/experiment-runner/real-config";

const env = {
  DEPLOYMENT_ENV: "_staging", DIFY_BOOKLET_RUNNER_ENABLED: "true",
  DIFY_BOOKLET_BASE_URL: "https://dify.test", DIFY_BOOKLET_PUBLIC_ORIGIN: "https://booklet.test",
  DIFY_BOOKLET_TOOL_KEY: "fake-only".repeat(8),
  DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(release.policy.publications.map(item => ({ ...item, apiKey: `fake-${item.appId}` }))),
};
const ready = {
  state: "ready", schemaVersion: "booklet_real_readiness_v1",
  sourcePolicy: release.policy, tokenPolicy: release.grant.tokenPolicy,
  textPluginIdentity: REAL_TEXT_PLUGIN_IDENTITY, textPackageSha256: REAL_TEXT_PACKAGE_SHA256,
  imagePluginIdentity: REAL_IMAGE_PLUGIN_IDENTITY, imagePackageSha256: REAL_IMAGE_PACKAGE_SHA256,
  nativeFileFormat: "base64",
  publications: release.policy.publications.map((item, index) => ({ ...item, publishedWorkflowId: id(1000 + index) })),
} as const;

describe("staging Real readiness manifest", () => {
  it("pins dev2 for new readiness while preserving the retained dev1 profile hash", () => {
    const prior = {
      ...delivered,
      imagePluginIdentity: "langgenius/openai_tool:0.2.2-dev1@c1f56e13bfdba8523fcb79e3bf2249a0c1ffd0e1be7ad92a947eeace51a80b31",
      imagePackageSha256: "8ae9ddea724651f2c9d0559b043edfee735ca69cd1d07fae39474c11b3124ec8",
    };
    const current = realReadinessManifestSchema.parse(delivered);
    if (current.state !== "ready") throw new Error("Missing delivered readiness");
    const profile = (adapters: typeof prior) => executionPolicySnapshot(realExecutionPolicyFromM4TechnicalProfile(
      current.sourcePolicy, current.tokenPolicy, current.publications, adapters));
    const saved = profile(prior);
    expect(saved.hash).toBe("be8c15176efd57612ae48ca13f4de4b9932a5d14c1ccf0b88d5632a713532375");
    expect(executionPolicySnapshot(saved.policy).hash).toBe(saved.hash);
    expect(profile(delivered).hash).not.toBe(saved.hash);
    expect(realReadinessManifestSchema.safeParse(prior).success).toBe(false);
    expect(() => profile({ ...prior, imagePluginIdentity: prior.imagePluginIdentity.replace("dev1", "dev3") })).toThrow();
  });

  it("hydrates the delivered publications and never accepts local or production Real dispatch", () => {
    expect(realReadinessManifestSchema.safeParse(delivered).success).toBe(true);
    expect(readM4RunnerConfig(env).enabled).toBe(true);
    const defaultState = readM4RunnerConfig(env);
    if (!defaultState.enabled) throw new Error("Missing staging config");
    expect(defaultState.config.real?.bindings.map(item => item.publishedWorkflowId))
      .toEqual(delivered.publications.map(item => item.publishedWorkflowId));
    expect(defaultState.config.real?.bindings.map(item => item.apiKey))
      .toEqual(release.policy.publications.map(item => `fake-${item.appId}`));
    const disabledState = readM4RunnerConfig(env, release, { state: "disabled" });
    if (!disabledState.enabled) throw new Error("Missing staging config");
    expect(disabledState.config.real).toBeUndefined();
    const local = readM4RunnerConfig({ ...env, DEPLOYMENT_ENV: "local" }, { state: "disabled" }, ready);
    expect(local.enabled).toBe(true);
    if (local.enabled) expect(local.config.real).toBeUndefined();
    expect(readM4RunnerConfig({ ...env, DEPLOYMENT_ENV: "_prod" }, { state: "disabled" }, ready))
      .toEqual({ enabled: false, reason: "production" });
  });

  it("hydrates exact reviewed Real publications from the existing protected app keys independently of M4", () => {
    const state = readM4RunnerConfig(env, { state: "disabled" }, ready);
    expect(state).toMatchObject({ enabled: true, config: { m4: { state: "disabled" }, real: { state: "ready" } } });
    if (!state.enabled || !state.config.real) throw new Error("Missing ready Real config");
    expect(state.config.real.bindings).toHaveLength(18);
    expect(state.config.real.bindings.map(item => item.publishedWorkflowId)).toEqual(ready.publications.map(item => item.publishedWorkflowId));
    expect(state.config.real.bindings.map(item => item.apiKey)).toEqual(release.policy.publications.map(item => `fake-${item.appId}`));
    expect(state.config.real.sourcePolicy).toEqual(release.policy);
    expect(state.config.real.tokenPolicy).toEqual(release.grant.tokenPolicy);
    expect(JSON.stringify(ready)).not.toContain("fake-");
    const oldM4Publication = readM4RunnerConfig(env, { state: "ready", policy: {
      ...release.policy, publications: release.policy.publications.map((item, index) =>
        index === 0 ? { ...item, publishedWorkflowId: id(9999) } : item),
    } }, ready);
    expect(oldM4Publication).toMatchObject({ enabled: true, config: { m4: { state: "invalid" }, real: { state: "ready" } } });
  });

  it("closes only Real for malformed or drifted non-secret metadata", () => {
    const variants = [
      { ...ready, textPackageSha256: "0".repeat(64) },
      { ...ready, imagePluginIdentity: "langgenius/openai_tool:other" },
      { ...ready, nativeFileFormat: "url" },
      { ...ready, publications: ready.publications.slice(1) },
      { ...ready, publications: ready.publications.map((item, index) => index === 1 ? { ...item, appId: ready.publications[0].appId } : item) },
      { ...ready, publications: ready.publications.map((item, index) => index === 1 ? { ...item, role: "judge" } : item) },
      { ...ready, tokenPolicy: { ...ready.tokenPolicy, hash: "0".repeat(64) } },
      { ...ready, sourcePolicy: { ...ready.sourcePolicy, maxRequests: ready.sourcePolicy.maxRequests + 1 } },
      { ...ready, unexpected: true },
    ];
    for (const variant of variants) {
      const state = readM4RunnerConfig(env, release, variant);
      expect(state).toMatchObject({ enabled: true, config: { m4: { state: "granted" } } });
      if (state.enabled) expect(state.config.real).toBeUndefined();
    }
    expect(realReadinessManifestSchema.safeParse({ state: "disabled", publications: ready.publications }).success).toBe(false);
  });
});
