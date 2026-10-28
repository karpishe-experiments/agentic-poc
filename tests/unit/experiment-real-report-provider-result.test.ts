import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ExperimentOperationDocument } from "@/db/documents";
import { executionPolicySnapshot, realExecutionPolicyFromM4TechnicalProfile } from "@/lib/experiment-runner/execution-policy";
import { m4TokenPolicySnapshot, m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { m4AuthorizedCarrier, m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import { realReportCarrier } from "@/lib/experiment-runner/real-report-carrier";
import { assessRealReportProviderResult, realReportPreGenerationFailure } from "@/lib/experiment-runner/real-report-provider-result";
import { m4TestId, m4TestPolicy } from "@/tests/helpers/m4-policy";

const source = m4TestPolicy();
const tokenPolicy = m4TokenPolicySnapshot({ version: "m4_context_policy_v2", basePolicyHash: m4PolicySnapshot(source).hash,
  warningInputTokens: 32000, maxInputTokens: 128000,
  requiredProviderAdapterIdentity: `langgenius/openai:1.0.7-dev5@${"a".repeat(64)}`,
  requiredProviderPackageSha256: "b".repeat(64), reference: "reviewed-token-policy" });
const policy = realExecutionPolicyFromM4TechnicalProfile(source, tokenPolicy, source.publications, {
  textPluginIdentity: `langgenius/openai:1.0.7-dev6@${"c".repeat(64)}`, textPackageSha256: "d".repeat(64),
  imagePluginIdentity: `langgenius/openai_tool:0.2.2-dev1@${"e".repeat(64)}`, imagePackageSha256: "f".repeat(64),
});
const original = m4CanonicalJson({ model: "gpt-6-luna", input: [{ type: "message", role: "system", content: "System" },
  { type: "message", role: "user", content: "Judge original image" }], max_output_tokens: 8192,
  reasoning: { effort: "none", mode: "standard" }, service_tier: "default", store: false, truncation: "disabled",
  include: ["reasoning.encrypted_content"], text: { format: { type: "json_schema", name: "report", strict: true,
    schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false } } } });
const authorized = m4AuthorizedCarrier(original, tokenPolicy);
const image = Buffer.concat([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
  Buffer.from("0000040000000400080200000000000000", "hex")]);
const assetId = m4TestId(1);
const { carrier, carrierJson } = realReportCarrier({ textRequestJson: authorized.requestJson,
  images: [{ manifest: { assetId, versionId: m4TestId(2),
    sha256: createHash("sha256").update(image).digest("hex"), byteLength: image.length,
    mimeType: "image/png", width: 1024, height: 1024 }, bytes: image }], deadlineAtMs: 9_000_000_000_000 });
const operation = { role: "tester", mode: "real", providerKind: "text",
  m4Preparation: { policyHash: executionPolicySnapshot(policy).hash, requestJson: original,
    requestDigest: m4Hash(original), tokenPolicy },
  m4Reservation: { policyHash: executionPolicySnapshot(policy).hash, requestDigest: m4Hash(original),
    bucket: "testerReport", tokenPolicy, effectivePolicyHash: tokenPolicy.hash, maxInputTokens: 128000 },
  realReportPreparation: { carrierJson, manifestDigest: carrier.manifestDigest,
    finalRequestDigest: carrier.finalRequestDigest, textRequestDigest: carrier.textRequestDigest,
    orderedImages: carrier.orderedImages, uploadFileIds: [m4TestId(3)], preparedAtMs: 1 },
} as ExperimentOperationDocument;

function wrapper() { return { schemaVersion: "booklet_provider_v3", content: "{\"answer\":\"ok\"}", providerEvidence: {
  provider: "openai", apiBaseUrl: "https://api.openai.com/v1", stdioSdk: { version: "0.10.2",
    readerSha256: "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22" },
  responseId: "resp_fake", requestId: "req_fake", model: "gpt-6-luna", serviceTier: "default",
  status: "completed", refused: false, incompleteReason: null, requestDigest: carrier.finalRequestDigest,
  adapterVersion: "m5-openai-bounded@1", manifestDigest: carrier.manifestDigest,
  textRequestDigest: carrier.textRequestDigest, inspectedAssetIds: [assetId], orderedImages: carrier.orderedImages,
  countedInputTokens: 100, usage: { source: "provider_reported", inputTokens: 100, outputTokens: 100,
    cachedInputTokens: 0, cacheWriteInputTokens: null, reasoningOutputTokens: 0 },
  effectivePolicy: { version: "m4_context_policy_v2", hash: tokenPolicy.hash, maxInputTokens: 128000,
    warningInputTokens: 32000 }, contextWarnings: [],
} }; }

describe("Real report provider readback", () => {
  it("assesses the final multimodal digest separately from the original and authorized text digests", () => {
    expect(m4Hash(original)).not.toBe(carrier.textRequestDigest);
    const result = assessRealReportProviderResult(wrapper(), policy, operation);
    expect(result).toMatchObject({ chargeUpperMicrodollars: 63, violations: [], canMaterialize: true,
      inspectedAssetIds: [assetId] });
    expect(result.evidenceJson).not.toContain('"content"');
  });
  it("blocks a changed manifest while retaining attributable usage", () => {
    const raw = wrapper(); raw.providerEvidence.inspectedAssetIds = [m4TestId(9)];
    expect(assessRealReportProviderResult(raw, policy, operation)).toMatchObject({
      chargeUpperMicrodollars: 63, violations: ["image_manifest_mismatch"], canMaterialize: false });
  });
  it("holds liability when attribution is missing and rejects an unmatched final digest", () => {
    const raw = wrapper(); raw.providerEvidence.requestId = null as never;
    expect(assessRealReportProviderResult(raw, policy, operation)).toMatchObject({ chargeUpperMicrodollars: null,
      canMaterialize: false });
    raw.providerEvidence.requestDigest = "a".repeat(64);
    expect(() => assessRealReportProviderResult(raw, policy, operation)).toThrow("matching prepared");
  });
  it("recognizes only the opt-in Real pre-generation failure", () => {
    const failure = { schemaVersion: "booklet_pre_generation_failure_v2", content: "", failureEvidence: {
      provider: "openai", apiBaseUrl: "https://api.openai.com/v1", stdioSdk: wrapper().providerEvidence.stdioSdk,
      model: "gpt-6-luna", serviceTier: "default", requestDigest: carrier.finalRequestDigest,
      stage: "input_count", code: "input_limit_exceeded", adapterVersion: "m5-openai-bounded@1",
      countedInputTokens: 128001, limit: 128000, generationStarted: false, elapsedMs: 2,
      countRequestId: "req_count", effectivePolicy: wrapper().providerEvidence.effectivePolicy,
      contextWarnings: ["input_tokens_above_32000"], manifestDigest: carrier.manifestDigest,
      textRequestDigest: carrier.textRequestDigest, inspectedAssetIds: [assetId],
    } };
    expect(realReportPreGenerationFailure(failure, policy, operation)).toEqual(failure);
    expect(realReportPreGenerationFailure({ ...failure, failureEvidence: { ...failure.failureEvidence,
      manifestDigest: "a".repeat(64) } }, policy, operation)).toBeNull();
  });
});
