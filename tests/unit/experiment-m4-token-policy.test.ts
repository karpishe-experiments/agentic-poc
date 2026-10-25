import { describe, expect, it } from "vitest";
import type { ExperimentOperationDocument } from "@/db/documents";
import { m4TestPolicy, m4TestId } from "@/tests/helpers/m4-policy";
import { m4Hash } from "@/lib/experiment-runner/m4-request";
import { assessM4ProviderResult } from "@/lib/experiment-runner/m4-provider-result";
import { m4PreGenerationFailure } from "@/lib/experiment-runner/m4-pre-generation-failure";
import { m4AdmittedTokenPolicy, m4EffectiveTokenPolicy, m4GrantSchema, m4MaximumCharge,
  m4OperationTokenPolicy, m4PolicySchema, m4PolicySnapshot, m4PreparationTokenPolicy,
  m4ReservationTokenPolicy, m4TokenPolicySnapshot } from "@/lib/experiment-runner/m4-policy";

const policy = m4TestPolicy();
const policyHash = m4PolicySnapshot(policy).hash;
const adapterUpdate = { fromIdentity: policy.pluginIdentity, version: "1.0.7-dev5" as const,
  packageSha256: "b".repeat(64), identity: `langgenius/openai:1.0.7-dev5@${"e".repeat(64)}`,
  reference: "reviewed-dev5-package" };
const amendment = { version: "m4_context_policy_v2" as const, basePolicyHash: policyHash,
  warningInputTokens: 32000 as const, maxInputTokens: 128000 as const,
  requiredProviderAdapterIdentity: adapterUpdate.identity, requiredProviderPackageSha256: adapterUpdate.packageSha256,
  reference: "reviewed-forward-only-token-amendment" };
const tokenPolicy = m4TokenPolicySnapshot(amendment);
const grant = m4GrantSchema.parse({ campaignId: m4TestId(1), reference: "reviewed-grant", providerAdapterUpdate: adapterUpdate,
  tokenPolicy });
const digest = "c".repeat(64);
const preparation = { policyHash, requestDigest: digest, tokenPolicy, adapterUpdate };
const reservation = { policyHash, requestDigest: digest, bucket: "decision" as const,
  tokenPolicy, effectivePolicyHash: tokenPolicy.hash, maxInputTokens: 128000 };
const operation = { role: "manager", mode: "balanced", providerKind: "text", reservationCount: 1,
  m4Preparation: preparation, m4Reservation: reservation } as ExperimentOperationDocument;

function provider(count: number | null, amended: boolean) {
  const warnings = count !== null && count > 32000 ? ["input_tokens_above_32000"] : [];
  return { schemaVersion: amended ? "booklet_provider_v2" : "booklet_provider_v1", content: '{"result":', providerEvidence: {
    provider: "openai", apiBaseUrl: "https://api.openai.com/v1", responseId: "response-test", requestId: "request-test",
    stdioSdk: { version: "0.10.2", readerSha256: "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22" },
    model: "gpt-6-luna", serviceTier: "default", status: "completed", refused: false, incompleteReason: null,
    requestDigest: digest, countedInputTokens: count,
    usage: { source: "provider_reported", inputTokens: count, outputTokens: 100, cachedInputTokens: 0,
      cacheWriteInputTokens: null, reasoningOutputTokens: 0 },
    ...(amended ? { effectivePolicy: { version: "m4_context_policy_v2", hash: tokenPolicy.hash,
      maxInputTokens: 128000, warningInputTokens: 32000 }, contextWarnings: warnings } : {}),
  } };
}

describe("forward-only M4 token policy", () => {
  it("keeps absent saved authority at 32k and rejects changed amendment identity", () => {
    const frozen = m4PolicySnapshot(policy);
    expect(m4EffectiveTokenPolicy(policy)).toMatchObject({ maxInputTokens: 32000, warningInputTokens: 32000, hash: null });
    expect(m4EffectiveTokenPolicy(policy, tokenPolicy)).toMatchObject({ maxInputTokens: 128000,
      warningInputTokens: 32000, hash: tokenPolicy.hash });
    expect(m4PolicySnapshot(policy).hash).toBe(frozen.hash);
    expect(() => m4EffectiveTokenPolicy(policy, { ...tokenPolicy, hash: "d".repeat(64) })).toThrow();
    expect(() => m4EffectiveTokenPolicy(policy, m4TokenPolicySnapshot({ ...amendment, basePolicyHash: "d".repeat(64) }))).toThrow();
    for (const change of [{ version: "m4_context_policy_v3" }, { maxInputTokens: 128001 },
      { warningInputTokens: 32001 }, { requiredProviderAdapterIdentity: "langgenius/openai:1.0.7-dev4@" + "b".repeat(64) }]) {
      expect(() => m4TokenPolicySnapshot({ ...amendment, ...change })).toThrow();
    }
    expect(m4PolicySchema.safeParse({ ...policy, maxInputTokens: 128000 }).success).toBe(false);
  });

  it("requires matching preparation, reservation and dev5 identity while historical work retains its own policy", () => {
    expect(m4PreparationTokenPolicy(policy, preparation).hash).toBe(tokenPolicy.hash);
    expect(m4ReservationTokenPolicy(policy, reservation).hash).toBe(tokenPolicy.hash);
    expect(m4OperationTokenPolicy(policy, operation).hash).toBe(tokenPolicy.hash);
    expect(m4AdmittedTokenPolicy(policy, grant, preparation).hash).toBe(tokenPolicy.hash);
    expect(() => m4PreparationTokenPolicy(policy, { ...preparation, adapterUpdate: undefined })).toThrow();
    expect(() => m4PreparationTokenPolicy(policy, { ...preparation,
      adapterUpdate: { ...adapterUpdate, version: "1.0.7-dev4" } })).toThrow();
    expect(() => m4PreparationTokenPolicy(policy, { ...preparation,
      adapterUpdate: { ...adapterUpdate, identity: `langgenius/openai:1.0.7-dev5@${"f".repeat(64)}` } })).toThrow();
    expect(() => m4ReservationTokenPolicy(policy, { ...reservation, effectivePolicyHash: "d".repeat(64) })).toThrow();
    expect(() => m4ReservationTokenPolicy(policy, { ...reservation, maxInputTokens: 32000 })).toThrow();
    expect(() => m4OperationTokenPolicy(policy, { ...operation,
      m4Reservation: { ...reservation, tokenPolicy: undefined } })).toThrow();
    expect(() => m4OperationTokenPolicy(policy, { ...operation, m4Reservation: undefined })).toThrow();
    expect(() => m4OperationTokenPolicy(policy, { ...operation, m4Preparation: undefined })).toThrow();
    const legacyPreparation = { policyHash, requestDigest: digest, adapterUpdate: { ...adapterUpdate, version: "1.0.7-dev4" as const } };
    const legacyReservation = { policyHash, requestDigest: digest, bucket: "decision" as const };
    const legacyOperation = { ...operation, m4Preparation: legacyPreparation, m4Reservation: legacyReservation } as ExperimentOperationDocument;
    expect(m4OperationTokenPolicy(policy, legacyOperation).maxInputTokens).toBe(32000);
    expect(() => m4AdmittedTokenPolicy(policy, grant, legacyPreparation)).toThrow();
    expect(m4OperationTokenPolicy(policy, legacyOperation).maxInputTokens).toBe(32000);
    expect(() => m4ReservationTokenPolicy(policy, { ...legacyReservation, effectivePolicyHash: tokenPolicy.hash })).toThrow();
  });

  it("reserves with frozen rates and the existing USD 5/request/paid-image limits", () => {
    const assumed = m4PolicySchema.parse({ ...policy, countChargeStatus: "assumed", countChargeCeilingMicrodollars: 900 });
    const assumedToken = m4TokenPolicySnapshot({ ...amendment, basePolicyHash: m4PolicySnapshot(assumed).hash });
    expect(m4MaximumCharge(assumed, "decision", assumedToken)).toBe(17924);
    expect(m4MaximumCharge(assumed, "specialist", assumedToken)).toBe(20996);
    expect(m4MaximumCharge(assumed, "judge", assumedToken)).toBe(402820);
    expect(assumed.maxMicrodollars).toBe(5_000_000);
    expect(assumed.maxRequests).toBe(500);
    expect(assumed.imageProvider).toBe("simulated");
    expect(assumed.retries).toBe(0);
    expect(() => m4MaximumCharge(assumed, "decision", tokenPolicy)).toThrow();
  });

  it("accepts inclusive amended count boundaries and requires matching v2 evidence and warnings", () => {
    for (const count of [31999, 32000, 32001, 128000]) {
      const result = assessM4ProviderResult(provider(count, true), policy, operation);
      expect(result.violations).toEqual([]);
      expect(result.canMaterialize).toBe(true);
      expect(result.evidenceJson).toContain(count > 32000 ? "input_tokens_above_32000" : '"contextWarnings":[]');
    }
    expect(assessM4ProviderResult(provider(128001, true), policy, operation).violations).toEqual(["count_limit", "input_limit"]);
    expect(assessM4ProviderResult(provider(null, true), policy, operation).canMaterialize).toBe(false);
    const missingWarning = provider(32001, true); missingWarning.providerEvidence.contextWarnings = [];
    expect(assessM4ProviderResult(missingWarning, policy, operation)).toMatchObject({ canMaterialize: false,
      violations: ["token_policy_mismatch"] });
    const forged = provider(32001, true); forged.providerEvidence.effectivePolicy!.hash = "d".repeat(64);
    expect(assessM4ProviderResult(forged, policy, operation).canMaterialize).toBe(false);
    const oldVersion = provider(32001, false);
    expect(assessM4ProviderResult(oldVersion, policy, operation).canMaterialize).toBe(false);
    const legacyOperation = { ...operation, m4Preparation: { policyHash, requestDigest: digest },
      m4Reservation: { policyHash, requestDigest: digest, bucket: "decision" } } as ExperimentOperationDocument;
    expect(assessM4ProviderResult(provider(32000, false), policy, legacyOperation).canMaterialize).toBe(true);
    expect(assessM4ProviderResult(provider(32001, false), policy, legacyOperation).violations).toEqual(["count_limit", "input_limit"]);
    expect(() => assessM4ProviderResult(provider(-1, true), policy, operation)).toThrow();
  });

  it("authenticates 128001 no-generation failure only against saved amended policy, and preserves dev4 v1", () => {
    const requestJson = '{"saved":"request"}', requestDigest = m4Hash(requestJson);
    const amendedOperation = { ...operation, role: "specialist", m4Preparation: { ...preparation, requestJson, requestDigest },
      m4Reservation: { ...reservation, requestDigest, bucket: "specialist" } } as ExperimentOperationDocument;
    const failure = { schemaVersion: "booklet_pre_generation_failure_v2", content: "", failureEvidence: {
      provider: "openai", apiBaseUrl: "https://api.openai.com/v1", adapterVersion: "1.0.7-dev5",
      stdioSdk: { version: "0.10.2", readerSha256: "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22" },
      model: "gpt-6-luna", serviceTier: "default", requestDigest, stage: "input_count", code: "input_limit_exceeded",
      countedInputTokens: 128001, limit: 128000, generationStarted: false, elapsedMs: 5, countRequestId: "count_test",
      effectivePolicy: { version: "m4_context_policy_v2", hash: tokenPolicy.hash, maxInputTokens: 128000, warningInputTokens: 32000 },
      contextWarnings: ["input_tokens_above_32000"],
    } };
    expect(m4PreGenerationFailure(failure, policy, amendedOperation)).toEqual(failure);
    expect(m4PreGenerationFailure({ ...failure, failureEvidence: { ...failure.failureEvidence,
      countedInputTokens: 128000 } }, policy, amendedOperation)).toBeNull();
    expect(m4PreGenerationFailure({ ...failure, failureEvidence: { ...failure.failureEvidence,
      contextWarnings: [] } }, policy, amendedOperation)).toBeNull();
    const legacyOperation = { ...amendedOperation, m4Preparation: { ...amendedOperation.m4Preparation,
      tokenPolicy: undefined, adapterUpdate: { ...adapterUpdate, version: "1.0.7-dev4" } },
      m4Reservation: { ...amendedOperation.m4Reservation, tokenPolicy: undefined,
        effectivePolicyHash: undefined, maxInputTokens: undefined } } as ExperimentOperationDocument;
    const legacy = { schemaVersion: "booklet_pre_generation_failure_v1", content: "", failureEvidence: {
      ...failure.failureEvidence, adapterVersion: "1.0.7-dev4", countedInputTokens: 32001, limit: 32000,
    } } as { schemaVersion: string; content: string; failureEvidence: Record<string, unknown> };
    delete legacy.failureEvidence.effectivePolicy;
    delete legacy.failureEvidence.contextWarnings;
    expect(m4PreGenerationFailure(legacy, policy, legacyOperation)).toEqual(legacy);
    expect(m4PreGenerationFailure(legacy, policy, amendedOperation)).toBeNull();
    expect(m4PreGenerationFailure(failure, policy, legacyOperation)).toBeNull();
  });
});
