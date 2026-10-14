import { describe, expect, it } from "vitest";
import type { ExperimentOperationDocument } from "@/db/documents";
import { assessM4ProviderResult } from "@/lib/experiment-runner/m4-provider-result";
import { m4TestPolicy } from "@/tests/helpers/m4-policy";
import { m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";

const digest = "a".repeat(64);
const policyHash = m4PolicySnapshot(m4TestPolicy()).hash;
const operation = { mode: "balanced", providerKind: "text", m4Preparation: { requestDigest: digest, policyHash },
  m4Reservation: { requestDigest: digest, policyHash, bucket: "decision" } } as ExperimentOperationDocument;
function wrapper() { return { schemaVersion: "booklet_provider_v1", content: '{"result":', providerEvidence: {
  provider: "openai", apiBaseUrl: "https://api.openai.com/v1", responseId: "resp_fake", requestId: "req_fake", model: "gpt-6-luna",
  serviceTier: "default", status: "completed", refused: false, incompleteReason: null, requestDigest: digest, countedInputTokens: 100,
  usage: { source: "provider_reported", inputTokens: 100, outputTokens: 100, cachedInputTokens: 25, cacheWriteInputTokens: null, reasoningOutputTokens: 20 },
} }; }
describe("M4 attributable provider evidence", () => {
  it("retains usage independently of malformed creative output and includes reasoning once", () => {
    const result = assessM4ProviderResult(wrapper(), m4TestPolicy(), operation);
    expect(result).toMatchObject({ chargeUpperMicrodollars: 63, violations: [], canMaterialize: true });
    expect(result.content).toBe('{"result":');
    expect(result.evidenceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.evidenceJson).not.toContain('"content"');
  });
  it("retains attributable charges for incomplete/refused output without admitting content", () => {
    const raw = wrapper(); Object.assign(raw.providerEvidence, { status: "incomplete", incompleteReason: "max_output_tokens", refused: true });
    expect(assessM4ProviderResult(raw, m4TestPolicy(), operation)).toMatchObject({ chargeUpperMicrodollars: 63, canMaterialize: false });
  });
  it("retains maximum allocation when usage, price identity or request attribution is unavailable", () => {
    for (const change of [{ model: "other" }, { serviceTier: "priority" }, { requestId: null },
      { usage: { ...wrapper().providerEvidence.usage, source: "unavailable", inputTokens: null } }]) {
      const raw = wrapper(); Object.assign(raw.providerEvidence, change);
      expect(assessM4ProviderResult(raw, m4TestPolicy(), operation)).toMatchObject({ chargeUpperMicrodollars: null, canMaterialize: false });
    }
  });
  it("flags count/input/output ceilings and inconsistent usage without hiding attributable excess", () => {
    const raw = wrapper(); raw.providerEvidence.countedInputTokens = 32001;
    raw.providerEvidence.usage.inputTokens = 32001; raw.providerEvidence.usage.outputTokens = 2049;
    const result = assessM4ProviderResult(raw, m4TestPolicy(), operation);
    expect(result.violations).toEqual(["count_limit", "input_limit", "output_limit"]);
    expect(result.chargeUpperMicrodollars).toBe(5025);
    expect(result.canMaterialize).toBe(false);
    raw.providerEvidence.usage.reasoningOutputTokens = 2050;
    expect(assessM4ProviderResult(raw, m4TestPolicy(), operation)).toMatchObject({ chargeUpperMicrodollars: null, canMaterialize: false });
  });
  it("rejects a mismatching request digest or endpoint before any settlement", () => {
    const raw = wrapper(); raw.providerEvidence.requestDigest = "b".repeat(64);
    expect(() => assessM4ProviderResult(raw, m4TestPolicy(), operation)).toThrow("matching prepared");
    raw.providerEvidence.requestDigest = digest; raw.providerEvidence.apiBaseUrl = "https://regional.example/v1";
    expect(() => assessM4ProviderResult(raw, m4TestPolicy(), operation)).toThrow();
  });
  it("rejects a different valid manifest, either saved policy hash, and unparsed rates", () => {
    const changed = { ...m4TestPolicy(), pricingReference: "different-valid-manifest" };
    expect(() => assessM4ProviderResult(wrapper(), changed, operation)).toThrow("matching prepared");
    for (const key of ["m4Preparation", "m4Reservation"] as const) {
      expect(() => assessM4ProviderResult(wrapper(), m4TestPolicy(), { ...operation, [key]: { ...operation[key], policyHash: "b".repeat(64) } })).toThrow("matching prepared");
    }
    const invalid = structuredClone(m4TestPolicy()) as unknown as { models: { decision: { inputMicrodollarsPerMillion: number } } };
    invalid.models.decision.inputMicrodollarsPerMillion = 0;
    expect(() => assessM4ProviderResult(wrapper(), invalid, operation)).toThrow();
  });
});
