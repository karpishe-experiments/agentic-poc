import { describe, expect, it } from "vitest";
import { m4GrantSchema, m4MaximumCharge, m4ModelBucket, m4PolicySchema, m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { m4TestPolicy } from "@/tests/helpers/m4-policy";

describe("frozen M4 policy", () => {
  it("accepts the reviewed final-answer adapter while retaining historical dev3 grants", () => {
    const grant = { campaignId: "00000000-0000-4000-8000-000000000003", reference: "explicit-fix",
      providerAdapterUpdate: { fromIdentity: m4TestPolicy().pluginIdentity, version: "1.0.7-dev4",
        packageSha256: "a".repeat(64), reference: "reviewed-exact-package" } };
    expect(m4GrantSchema.parse(grant).providerAdapterUpdate?.version).toBe("1.0.7-dev4");
    expect(m4GrantSchema.safeParse({ ...grant, providerAdapterUpdate: { ...grant.providerAdapterUpdate, version: "1.0.7-dev3" } }).success).toBe(true);
    expect(m4GrantSchema.safeParse({ ...grant, providerAdapterUpdate: { ...grant.providerAdapterUpdate, version: "1.0.7-dev5" } }).success).toBe(true);
    expect(m4GrantSchema.safeParse({ ...grant, providerAdapterUpdate: { ...grant.providerAdapterUpdate, version: "1.0.7-dev6" } }).success).toBe(false);
  });
  it("keeps completion recovery exact, bounded and separate from failure continuation", () => {
    const entry = { runId: "00000000-0000-4000-8000-000000000001", operationId: "00000000-0000-4000-8000-000000000002", reference: "reviewed-exact-recovery" };
    const grant = { campaignId: "00000000-0000-4000-8000-000000000003", reference: "frozen-grant", completionRecoveries: [entry] };
    expect(m4GrantSchema.parse(grant).completionRecoveries).toEqual([entry]);
    expect(m4GrantSchema.safeParse({ ...grant, completionRecoveries: [entry, entry] }).success).toBe(false);
    expect(m4GrantSchema.safeParse({ ...grant, continuations: [entry] }).success).toBe(false);
    expect(m4GrantSchema.safeParse({ ...grant, completionRecoveries: [{ ...entry, operationId: "*" }] }).success).toBe(false);
    expect(m4GrantSchema.safeParse({ ...grant, completionRecoveries: Array(21).fill(entry) }).success).toBe(false);
  });
  it("freezes the selected model mix and includes count charges in each maximum", () => {
    const policy = m4TestPolicy();
    expect(m4MaximumCharge(policy, "specialist")).toBe(8096);
    expect(m4MaximumCharge(policy, "judge")).toBe(161920);
    expect(m4MaximumCharge(policy, "decision")).toBe(5024);
    expect(497 * m4MaximumCharge(policy, "specialist") + 3 * m4MaximumCharge(policy, "judge")).toBe(4_509_472);
    expect(m4MaximumCharge({ ...policy, countChargeCeilingMicrodollars: 1 }, "specialist")).toBe(8097);
    const assumed = m4PolicySchema.parse({ ...policy, countChargeStatus: "assumed", countChargeCeilingMicrodollars: 900 });
    expect(497 * m4MaximumCharge(assumed, "specialist") + 3 * m4MaximumCharge(assumed, "judge")).toBe(4_959_472);
    expect(m4ModelBucket("tester", true)).toBe("testerReport");
    expect(() => m4ModelBucket("image", false)).toThrow();
  });
  it("rejects higher limits, retries, real images, missing fee verification and incomplete publications", () => {
    const policy = m4TestPolicy();
    for (const change of [{ maxMicrodollars: 10_000_000 }, { retries: 1 }, { maxInputTokens: 32001 }, { imageProvider: "real" },
      { countVerificationReference: "" }, { countChargeCeilingMicrodollars: undefined }, { publications: policy.publications.slice(1) },
      { models: { ...policy.models, decision: { ...policy.models.decision, reasoningEffort: "low" } } }]) {
      expect(m4PolicySchema.safeParse({ ...policy, ...change }).success).toBe(false);
    }
  });
  it("owns its saved policy and hashes key order deterministically without changing legacy configuration", () => {
    const policy = m4TestPolicy();
    const snapshot = m4PolicySnapshot(policy);
    expect(m4PolicySnapshot(Object.fromEntries(Object.entries(policy).reverse())).hash).toBe(snapshot.hash);
    expect(Reflect.set(snapshot.policy, "maxMicrodollars", 10_000_000)).toBe(false);
    expect(Reflect.set(snapshot.policy.models.decision, "maxOutputTokens", 8192)).toBe(false);
    expect(Object.isFrozen(snapshot)).toBe(true);
    policy.publications[0].publishedWorkflowId = policy.publications[1].publishedWorkflowId;
    expect(snapshot.policy.publications[0].publishedWorkflowId).not.toBe(policy.publications[0].publishedWorkflowId);
    expect(m4PolicySnapshot(policy).hash).not.toBe(snapshot.hash);
  });
});
