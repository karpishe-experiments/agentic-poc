import { describe, expect, it } from "vitest";
import { z } from "zod";
import release from "@/lib/experiment-runner/m4-campaign-manifest.json";
import delivered from "@/lib/experiment-runner/real-readiness-manifest.json";
import retained from "@/tests/fixtures/m5-retained-real-readiness.json";
import reportCorrected from "@/tests/fixtures/m5-report-corrected-real-readiness.json";
import { readM4RunnerConfig } from "@/lib/experiment-runner/m4-config";
import { executionPolicySnapshot, realExecutionPolicyFromM4TechnicalProfile, executionMaximumTextCharge } from "@/lib/experiment-runner/execution-policy";
import { prepareExecutionRequest, executionDefinitionFor } from "@/lib/experiment-runner/execution-request";
import { m4TestId as id } from "@/tests/helpers/m4-policy";
import {
  REAL_IMAGE_PACKAGE_SHA256, REAL_IMAGE_PLUGIN_IDENTITY, REAL_TEXT_PACKAGE_SHA256,
  REAL_TEXT_PLUGIN_IDENTITY, realReadinessManifestSchema,
} from "@/lib/experiment-runner/real-config";

// Historical fixtures are evidence, not active readiness grants. Their actual
// adapter identities are validated when constructing the saved execution policy.
const fixtureReadinessSchema = realReadinessManifestSchema.options[1].extend({
  textPluginIdentity: z.string(), textPackageSha256: z.string(),
  imagePluginIdentity: z.string(), imagePackageSha256: z.string(),
});

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
  it("selects corrected report publications without changing the retained technical settings", () => {
    const current = fixtureReadinessSchema.parse(reportCorrected), historical = fixtureReadinessSchema.parse(retained);
    if (current.state !== "ready" || historical.state !== "ready") throw Error("Missing readiness");
    const snapshot = (ready: typeof current) => executionPolicySnapshot(realExecutionPolicyFromM4TechnicalProfile(
      ready.sourcePolicy, ready.tokenPolicy, ready.publications, ready));
    const before = snapshot(historical), after = snapshot(current);
    expect(before.hash).toBe("f87eb3a370fcd9429846c3dcc3df4bac3f56d44c88ae7294ba7a426bd4187ce1");
    expect(after.hash).toBe("dc7553679260b7f64df9cbf957ab5ef9fbbf64db00f25e88072efcd5a3ead83f");
    const { publications: oldPublications, ...oldSettings } = before.policy;
    const { publications: newPublications, ...newSettings } = after.policy;
    expect(newSettings).toEqual(oldSettings);
    expect(newPublications.filter(row => !["tester", "judge"].includes(row.role)))
      .toEqual(oldPublications.filter(row => !["tester", "judge"].includes(row.role)));
    expect(newPublications.filter(row => ["tester", "judge"].includes(row.role))
      .every(row => oldPublications.find(old => old.appId === row.appId)?.publishedWorkflowId !== row.publishedWorkflowId)).toBe(true);
  });
  it("versions compact manager requests while retaining the delivered profile and tester limits", () => {
    const current = realReadinessManifestSchema.parse(delivered);
    if (current.state !== "ready") throw new Error("Missing delivered readiness");
    const historical = fixtureReadinessSchema.parse(retained);
    if (historical.state !== "ready") throw new Error("Missing retained readiness");
    const retainedPublications = historical.publications.map(item => item.role === "manager"
      ? { ...item, publishedWorkflowId: "6e1ebf6d-94e1-4265-9733-764504a0ddba" } : item);
    const prior = executionPolicySnapshot(realExecutionPolicyFromM4TechnicalProfile(
      historical.sourcePolicy, historical.tokenPolicy, retainedPublications, { ...historical, executionVersion: "execution_v1" }));
    expect(prior.hash).toBe("9fab201953ff06cba920713dded4a8f623f28fa44fbeb9fc34bf6a7390a80f8e");
    const next = executionPolicySnapshot(realExecutionPolicyFromM4TechnicalProfile(
      current.sourcePolicy, current.tokenPolicy, current.publications, { ...current, executionVersion: "execution_v2" }));
    expect(next.hash).not.toBe(prior.hash);
    expect(executionPolicySnapshot(JSON.parse(prior.json)).hash).toBe(prior.hash);
    const selector = { role: "manager" as const, taskId: null, persona: "playful_kid" as const, report: false };
    const choices = { taskId: ["J01"], subjectKind: ["book"], subjectId: [id(1)] };
    const prepared = prepareExecutionRequest(next.policy, selector, "{}", choices);
    expect(JSON.parse(prepared.requestJson).max_output_tokens).toBe(4096);
    expect(prepared.modelParameters.max_tokens).toBe(4096);
    expect(executionDefinitionFor(next.policy, selector).systemPrompt).toContain("500 characters");
    expect(executionMaximumTextCharge(next.policy, "decision", "manager") -
      executionMaximumTextCharge(prior.policy, "decision", "manager")).toBe(1024);
    expect(executionMaximumTextCharge(next.policy, "decision", "tester"))
      .toBe(executionMaximumTextCharge(prior.policy, "decision", "tester"));
  });
  it("pins diagnostic adapters for new readiness while preserving the retained dev1 profile hash", () => {
    const current = realReadinessManifestSchema.parse(delivered);
    if (current.state !== "ready") throw new Error("Missing delivered readiness");
    const historical = fixtureReadinessSchema.parse(retained);
    if (historical.state !== "ready") throw new Error("Missing retained readiness");
    const prior = {
      ...historical,
      executionVersion: "execution_v1" as const,
      imagePluginIdentity: "langgenius/openai_tool:0.2.2-dev1@c1f56e13bfdba8523fcb79e3bf2249a0c1ffd0e1be7ad92a947eeace51a80b31",
      imagePackageSha256: "8ae9ddea724651f2c9d0559b043edfee735ca69cd1d07fae39474c11b3124ec8",
      publications: historical.publications.map(item => item.role === "image"
        ? { ...item, publishedWorkflowId: "ab5ca725-8268-40ca-912a-a4d432fbcac6" } : item.role === "manager"
          ? { ...item, publishedWorkflowId: "6e1ebf6d-94e1-4265-9733-764504a0ddba" } : item),
    };
    const profile = (adapters: Omit<typeof prior, "executionVersion"> & { executionVersion?: "execution_v1" | "execution_v2" }) => executionPolicySnapshot(realExecutionPolicyFromM4TechnicalProfile(
      current.sourcePolicy, current.tokenPolicy, adapters.publications, adapters));
    const saved = profile(prior);
    expect(saved.hash).toBe("be8c15176efd57612ae48ca13f4de4b9932a5d14c1ccf0b88d5632a713532375");
    expect(executionPolicySnapshot(saved.policy).hash).toBe(saved.hash);
    expect(profile(current).hash).not.toBe(saved.hash);
    expect(realReadinessManifestSchema.safeParse(prior).success).toBe(false);
    const diagnosticAdapter = { ...prior, imagePluginIdentity: prior.imagePluginIdentity.replace("dev1", "dev3") };
    expect(() => profile(diagnosticAdapter)).not.toThrow();
    expect(realReadinessManifestSchema.safeParse(diagnosticAdapter).success).toBe(false);
    expect(() => profile({ ...prior, imagePluginIdentity: prior.imagePluginIdentity.replace("dev1", "dev4") })).toThrow();
  });

  it("changes only diagnostic adapters and the verified image publication for the release candidate", () => {
    expect(delivered).toEqual({ ...reportCorrected,
      textPluginIdentity: REAL_TEXT_PLUGIN_IDENTITY, textPackageSha256: REAL_TEXT_PACKAGE_SHA256,
      imagePluginIdentity: REAL_IMAGE_PLUGIN_IDENTITY, imagePackageSha256: REAL_IMAGE_PACKAGE_SHA256,
      publications: reportCorrected.publications.map(item => item.role === "image"
        ? { ...item, publishedWorkflowId: "d016b1e3-93a6-4e9b-8509-de2a9b3568ad" } : item),
    });
    expect(realReadinessManifestSchema.safeParse(reportCorrected).success).toBe(false);
    const current = realReadinessManifestSchema.parse(delivered);
    if (current.state !== "ready") throw Error("Missing candidate readiness");
    const snapshot = executionPolicySnapshot(realExecutionPolicyFromM4TechnicalProfile(
      current.sourcePolicy, current.tokenPolicy, current.publications, current));
    expect(executionPolicySnapshot(JSON.parse(snapshot.json)).hash).toBe(snapshot.hash);
    expect(snapshot.hash).not.toBe("dc7553679260b7f64df9cbf957ab5ef9fbbf64db00f25e88072efcd5a3ead83f");
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
