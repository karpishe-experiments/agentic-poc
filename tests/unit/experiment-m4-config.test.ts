import { describe, expect, it } from "vitest";
import { readM4RunnerConfig } from "@/lib/experiment-runner/m4-config";
import { m4RequestBundleHash } from "@/lib/experiment-runner/m4-request";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";

const policy = { ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash() };
const env = { DEPLOYMENT_ENV: "_staging", DIFY_BOOKLET_RUNNER_ENABLED: "true", DIFY_BOOKLET_BASE_URL: "https://dify.test",
  DIFY_BOOKLET_PUBLIC_ORIGIN: "https://booklet.test", DIFY_BOOKLET_TOOL_KEY: "fake-only".repeat(8),
  DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(policy.publications.map(({ persona, ...binding }) => ({ ...binding, persona, apiKey: "fake-only" }))) };
const granted = { state: "granted", policy, grant: { campaignId: id(1), reference: "fake-only-not-live-approval" } };
describe("reviewed non-secret M4 campaign configuration", () => {
  it("defaults to disabled and distinguishes readiness from paid authority", () => {
    expect(readM4RunnerConfig(env)).toMatchObject({ enabled: true, config: { m4: { state: "disabled" } } });
    expect(readM4RunnerConfig(env, { state: "ready", policy })).toMatchObject({ enabled: true, config: { m4: { state: "ready" } } });
    const state = readM4RunnerConfig(env, granted);
    expect(state).toMatchObject({ enabled: true, config: { m4: { state: "granted", authority: { grant: granted.grant } } } });
    if (!state.enabled) throw new Error("Missing fake configuration");
    expect(Object.isFrozen(state.config.m4!.authority!.policy)).toBe(true);
    expect(Object.isFrozen(state.config.m4!.authority!.grant)).toBe(true);
  });
  it("rejects policy/publication/definition drift without disabling Simulated", () => {
    for (const candidate of [{ ...granted, grant: null }, { ...granted, policy: { ...policy, requestDefinitionHash: "c".repeat(64) } },
      { ...granted, policy: { ...policy, publications: policy.publications.map((p, i) => i ? p : { ...p, publishedWorkflowId: id(999) }) } }]) {
      expect(readM4RunnerConfig(env, candidate)).toMatchObject({ enabled: true, config: { m4: { state: "invalid" } } });
    }
    expect(readM4RunnerConfig({ ...env, DEPLOYMENT_ENV: "local" }, granted)).toMatchObject({ enabled: true, config: { m4: { state: "invalid" } } });
    expect(readM4RunnerConfig({ ...env, DEPLOYMENT_ENV: "_prod" }, granted)).toEqual({ enabled: false, reason: "production" });
  });
  it("ignores environment spending instructions and requires an exact reviewed manifest", () => {
    expect(readM4RunnerConfig({ ...env, M4_EXECUTION_GRANTED: "true", M4_BUDGET: "100" })).toMatchObject({ config: { m4: { state: "disabled" } } });
    expect(readM4RunnerConfig(env, { ...granted, budget: 100 })).toMatchObject({ config: { m4: { state: "invalid" } } });
  });
});
