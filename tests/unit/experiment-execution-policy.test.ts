import { describe, expect, it } from "vitest";
import manifest from "@/lib/experiment-runner/m4-campaign-manifest.json";
import { executionAllowanceSchema, executionPolicySnapshot, defaultExecutionAllowance } from "@/lib/experiment-runner/execution-policy";
import { prepareExecutionRequest, executionRequestBundleHash } from "@/lib/experiment-runner/execution-request";
import { m4RequestBundleHash, m4RequestDefinition } from "@/lib/experiment-runner/m4-request";
import { parseM4CreativeOutput } from "@/lib/experiment-runner/m4-output";

const source = manifest as { policy: Record<string, unknown>; grant: { tokenPolicy: unknown } };
const policy = () => ({ schemaVersion: "execution_v1", mode: "balanced",
  provider: source.policy.provider, protocol: source.policy.protocol, serviceTier: source.policy.serviceTier,
  apiBaseUrl: source.policy.apiBaseUrl, pluginIdentity: (source.grant.tokenPolicy as {
    amendment: { requiredProviderAdapterIdentity: string } }).amendment.requiredProviderAdapterIdentity,
  requestDefinitionHash: executionRequestBundleHash(), pricingReference: source.policy.pricingReference,
  countChargeStatus: source.policy.countChargeStatus,
  countChargeCeilingMicrodollars: source.policy.countChargeCeilingMicrodollars,
  countVerificationReference: source.policy.countVerificationReference,
  retries: source.policy.retries, tools: source.policy.tools, maxTimeoutSeconds: source.policy.maxTimeoutSeconds,
  models: source.policy.models, tokenPolicy: source.grant.tokenPolicy,
  publications: source.policy.publications });

describe("new execution profile and finite allowance", () => {
  it("accepts an allowance beyond historical M4's USD 5 ceiling without changing the technical hash", () => {
    const profile = executionPolicySnapshot(policy());
    expect(profile.policy.schemaVersion).toBe("execution_v1");
    const first = executionAllowanceSchema.parse(defaultExecutionAllowance("playful_kid", 5_000_001));
    const second = executionAllowanceSchema.parse({ ...first, maxMicrodollars: 10_000_000 });
    expect(second.maxMicrodollars).toBeGreaterThan(first.maxMicrodollars);
    expect(executionPolicySnapshot(policy()).hash).toBe(profile.hash);
  });

  it("rejects changed request definitions or carrier identity", () => {
    expect(() => executionPolicySnapshot({ ...policy(), requestDefinitionHash: "0".repeat(64) })).toThrow();
    const original = policy();
    expect(() => executionPolicySnapshot({ ...original, tokenPolicy: {
      ...(original.tokenPolicy as object), hash: "0".repeat(64),
    } })).toThrow();
  });

  it("versions new requests while leaving the historical M4 bundle unchanged", () => {
    const profile = executionPolicySnapshot(policy()).policy;
    const selector = { role: "specialist" as const, taskId: "J01" as const,
      persona: "playful_kid" as const, report: false };
    const context = JSON.stringify({ brief: "A small booklet" });
    const current = prepareExecutionRequest(profile, selector, context, {});
    expect(current.definitionHash).not.toBe(m4RequestDefinition(selector).hash);
    expect(m4RequestBundleHash()).not.toBe(executionRequestBundleHash());
  });
  it("accepts an explicit tester revision allowance request only on the new parser", () => {
    const selector = { role: "tester" as const, taskId: null, persona: "playful_kid" as const, report: false };
    const content = JSON.stringify({ result: { kind: "allowance_request", payload: {
      reason: "text_revisions", requestedTaskId: "J12",
      requestedVersionId: "00000000-0000-4000-8000-000000000001", instruction: "Restore the missing line.",
    } } });
    expect(() => parseM4CreativeOutput(selector, content, "{}", undefined, false)).toThrow();
    expect(parseM4CreativeOutput(selector, content, "{}", undefined, true)).toMatchObject({ kind: "allowance_request" });
  });
});
