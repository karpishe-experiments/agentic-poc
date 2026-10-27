import { describe, expect, it } from "vitest";
import { readM4RunnerConfig } from "@/lib/experiment-runner/m4-config";
import { m4RequestBundleHash } from "@/lib/experiment-runner/m4-request";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";
import releaseManifest from "@/lib/experiment-runner/m4-campaign-manifest.json";
import { m4AdmittedTokenPolicy, m4EffectiveTokenPolicy, m4GrantSchema, m4MaximumCharge, m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";

const policy = { ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash() };
const env = { DEPLOYMENT_ENV: "_staging", DIFY_BOOKLET_RUNNER_ENABLED: "true", DIFY_BOOKLET_BASE_URL: "https://dify.test",
  DIFY_BOOKLET_PUBLIC_ORIGIN: "https://booklet.test", DIFY_BOOKLET_TOOL_KEY: "fake-only".repeat(8),
  DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(policy.publications.map(({ persona, ...binding }) => ({ ...binding, persona, apiKey: "fake-only" }))) };
const granted = { state: "granted", policy, grant: { campaignId: id(1), reference: "fake-only-not-live-approval" } };
describe("reviewed non-secret M4 campaign configuration", () => {
  it("distinguishes disabled and ready configuration from paid authority", () => {
    expect(readM4RunnerConfig(env, { state: "disabled" })).toMatchObject({ enabled: true, config: { m4: { state: "disabled" } } });
    expect(readM4RunnerConfig(env, { state: "ready", policy })).toMatchObject({ enabled: true, config: { m4: { state: "ready" } } });
    const state = readM4RunnerConfig(env, granted);
    expect(state).toMatchObject({ enabled: true, config: { m4: { state: "granted", authority: { grant: granted.grant } } } });
    if (!state.enabled) throw new Error("Missing fake configuration");
    expect(Object.isFrozen(state.config.m4!.authority!.policy)).toBe(true);
    expect(Object.isFrozen(state.config.m4!.authority!.grant)).toBe(true);
  });
  it("pins the additional USD1 Kid campaign for staging only", () => {
    const releaseEnv = { ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(releaseManifest.policy.publications.map(binding => ({ ...binding, apiKey: "fake-only" }))) };
    const state = readM4RunnerConfig(releaseEnv);
    expect(state).toMatchObject({ enabled: true, config: { m4: { state: "granted", authority: { grant: releaseManifest.grant } } } });
    if (!state.enabled) throw new Error("Missing ready configuration");
    const frozen = m4PolicySnapshot(releaseManifest.policy);
    expect(frozen.hash).toBe("14d99213c6986594860afdf062b285eca4f9a59d099a42f16f50f8a3586a7bbb");
    expect(frozen.policy).toMatchObject({ maxMicrodollars: 1_000_000, allowedPersonas: ["playful_kid"] });
    expect(releaseManifest.grant.reference).toContain("User 2026-10-27 authorized one additional Balanced Kid");
    const effective = m4AdmittedTokenPolicy(frozen.policy, m4GrantSchema.parse(releaseManifest.grant));
    expect(effective).toMatchObject({ maxInputTokens: 128000, warningInputTokens: 32000,
      hash: "a622568bcf30692576801858693858892af0205ca3219458357ae6845cca1eea" });
    expect(m4EffectiveTokenPolicy(frozen.policy).maxInputTokens).toBe(32000);
    expect(m4MaximumCharge(frozen.policy, "specialist", effective.snapshot)).toBe(20996);
    expect(m4MaximumCharge(frozen.policy, "specialist")).toBe(8996);
    expect(releaseManifest.grant).not.toHaveProperty("continuations");
    expect(releaseManifest.grant).not.toHaveProperty("remainingPersonaAdmission");
    const historical = { ...releaseManifest.policy, maxMicrodollars: 5_000_000 };
    delete (historical as Partial<typeof historical>).allowedPersonas;
    expect(m4PolicySnapshot(historical).hash).toBe("b05ef70a81049a46bfb6fd456fc112fdc8bb61a3a79444ea0a145db37e57f1e3");
    expect(readM4RunnerConfig({ ...releaseEnv, DEPLOYMENT_ENV: "local" })).toMatchObject({ config: { m4: { state: "invalid" } } });
    expect(readM4RunnerConfig({ ...releaseEnv, DEPLOYMENT_ENV: "_prod" })).toEqual({ enabled: false, reason: "production" });
    expect(readM4RunnerConfig(env)).toMatchObject({ config: { m4: { state: "invalid" } } });
  });
  it("rejects policy/publication/definition drift without disabling Simulated", () => {
    for (const candidate of [{ ...granted, grant: null }, { ...granted, policy: { ...policy, requestDefinitionHash: "c".repeat(64) } },
      { ...granted, policy: { ...policy, publications: policy.publications.map((p, i) => i ? p : { ...p, publishedWorkflowId: id(999) }) } }]) {
      expect(readM4RunnerConfig(env, candidate)).toMatchObject({ enabled: true, config: { m4: { state: "invalid" } } });
    }
    expect(readM4RunnerConfig({ ...env, DEPLOYMENT_ENV: "local" }, granted)).toMatchObject({ enabled: true, config: { m4: { state: "invalid" } } });
    expect(readM4RunnerConfig({ ...env, DEPLOYMENT_ENV: "_prod" }, granted)).toEqual({ enabled: false, reason: "production" });
  });
  it("accepts exact protected continuations and rejects duplicate operation grants", () => {
    const continuation = { runId: id(10), operationId: id(12), reference: "inspected-failure-only" };
    expect(readM4RunnerConfig(env, { ...granted, grant: { ...granted.grant, continuations: [continuation] } }))
      .toMatchObject({ config: { m4: { authority: { grant: { continuations: [continuation] } } } } });
    expect(readM4RunnerConfig(env, { ...granted, grant: { ...granted.grant, continuations: [continuation, continuation] } }))
      .toMatchObject({ config: { m4: { state: "invalid" } } });
    expect(readM4RunnerConfig(env, { ...granted, grant: { ...granted.grant, continuations: [continuation], progressRecoveries: [continuation] } }))
      .toMatchObject({ config: { m4: { state: "invalid" } } });
  });
  it("requires an explicit rejection kind for pre-deployment decision recovery", () => {
    const target = { runId: id(10), operationId: id(12), reference: "exact pre-deployment closure",
      preDeploymentRecovery: "decision_rejection_v1" };
    expect(m4GrantSchema.safeParse({ ...granted.grant, continuations: [target] }).success).toBe(false);
    const marked = { ...target, decisionRejection: "revision_allowance_exhausted_v1" };
    expect(m4GrantSchema.safeParse({ ...granted.grant, continuations: [marked] }).success).toBe(true);
    expect(m4GrantSchema.safeParse({ ...granted.grant, continuations: [{ ...marked, preDeploymentRecovery: "any_failure" }] }).success).toBe(false);
  });
  it("ignores environment spending instructions and requires an exact reviewed manifest", () => {
    expect(readM4RunnerConfig({ ...env, M4_EXECUTION_GRANTED: "true", M4_BUDGET: "100" }, { state: "disabled" })).toMatchObject({ config: { m4: { state: "disabled" } } });
    expect(readM4RunnerConfig(env, { ...granted, budget: 100 })).toMatchObject({ config: { m4: { state: "invalid" } } });
  });
});
