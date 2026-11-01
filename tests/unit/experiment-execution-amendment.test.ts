import { describe, expect, it } from "vitest";
import { diagnosticExecutionAmendment, operationConfiguration } from "@/lib/experiment-runner/execution-amendment";
import { realExecutionPolicyFromM4TechnicalProfile, executionPolicySnapshot } from "@/lib/experiment-runner/execution-policy";
import { m4CanonicalJson } from "@/lib/experiment-runner/m4-request";
import { m4TokenPolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import type { ExperimentRunDocument } from "@/db/documents";
import { m4TestPolicy, m4TestId } from "@/tests/helpers/m4-policy";

function fixture() {
  const source = m4TestPolicy(), token = m4TokenPolicySnapshot({ version: "m4_context_policy_v2", basePolicyHash: "a".repeat(64),
    maxInputTokens: 128000, warningInputTokens: 32000, requiredProviderAdapterIdentity: `langgenius/openai:1.0.7-dev5@${"b".repeat(64)}`,
    requiredProviderPackageSha256: "c".repeat(64), reference: "fixture" });
  const original = executionPolicySnapshot(realExecutionPolicyFromM4TechnicalProfile(source, token, source.publications, {
    textPluginIdentity: `langgenius/openai:1.0.7-dev6@${"d".repeat(64)}`, textPackageSha256: "e".repeat(64),
    imagePluginIdentity: `langgenius/openai_tool:0.2.2-dev2@${"f".repeat(64)}`, imagePackageSha256: "a".repeat(64) }));
  const configuration = (policy: typeof original.policy) => m4CanonicalJson(policy.publications.filter(p => p.persona === null || p.persona === "playful_kid")
    .map(({ persona: _persona, ...p }) => { void _persona; return p; }));
  const run = { mode: "real", persona: "playful_kid", execution: { campaignId: m4TestId(1), profileHash: original.hash, profileJson: original.json },
    configurationJson: configuration(original.policy) } as ExperimentRunDocument;
  const next = structuredClone(original.policy);
  next.pluginIdentity = `langgenius/openai:1.0.7-dev7@${"a".repeat(64)}`;
  next.realReport!.packageSha256 = "b".repeat(64);
  next.realImage!.pluginIdentity = `langgenius/openai_tool:0.2.2-dev3@${"c".repeat(64)}`;
  next.realImage!.packageSha256 = "d".repeat(64);
  next.publications.find(p => p.role === "image")!.publishedWorkflowId = m4TestId(400);
  return { original, run, next, configuration };
}
describe("Recorded diagnostic execution amendments", () => {
  it("retains the original profile and binds only new operations to the approved diagnostic release", () => {
    const { run, next, configuration, original } = fixture();
    const saved = diagnosticExecutionAmendment(run, next, configuration(next), "operator approved diagnostic release", 10)!;
    run.executionAmendments = [saved];
    expect(run.execution?.profileHash).toBe(original.hash);
    expect(operationConfiguration(run, {}).find(b => b.role === "image")?.publishedWorkflowId).not.toBe(m4TestId(400));
    expect(operationConfiguration(run, { executionAmendmentId: saved.id }).find(b => b.role === "image")?.publishedWorkflowId).toBe(m4TestId(400));
    expect(() => operationConfiguration(run, { executionAmendmentId: "absent" })).toThrow("missing");
    run.executionAmendments[0] = { ...saved, profileHash: "0".repeat(64) };
    expect(() => operationConfiguration(run, { executionAmendmentId: saved.id })).toThrow("differs");
  });
  it("rejects model, price, image setting and unrelated publication changes", () => {
    for (const edit of [
      (p: ReturnType<typeof fixture>["next"]) => { p.realImage!.quality = "medium"; },
      (p: ReturnType<typeof fixture>["next"]) => { p.models.decision.maxOutputTokens = 8192; },
      (p: ReturnType<typeof fixture>["next"]) => { p.publications.find(b => b.role === "manager")!.publishedWorkflowId = m4TestId(401); },
    ]) {
      const { run, next, configuration } = fixture(); edit(next);
      expect(() => diagnosticExecutionAmendment(run, next, configuration(next), "fixture", 10)).toThrow();
    }
  });
});
