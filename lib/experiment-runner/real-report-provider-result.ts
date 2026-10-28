import { z } from "zod";
import type { ExperimentOperationDocument } from "@/db/documents";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { executionOperationTokenPolicy, executionPolicySnapshot, type ExecutionPolicy } from "@/lib/experiment-runner/execution-policy";
import { m4ContextWarningsSchema, m4EffectivePolicyEvidenceSchema, m4ProviderWrapperSchema } from "@/lib/experiment-runner/m4-provider-result";
import { m4AuthorizedCarrier, m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import { realImageReferenceSchema } from "@/lib/experiment-runner/real-image-contract";
import { REAL_REPORT_ADAPTER_IDENTITY, realReportCarrierSchema } from "@/lib/experiment-runner/real-report-carrier";

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
const manifest = z.array(realImageReferenceSchema).min(1).max(15);
const provenance = { adapterVersion: z.literal(REAL_REPORT_ADAPTER_IDENTITY), manifestDigest: digest,
  textRequestDigest: digest, inspectedAssetIds: z.array(opaqueIdSchema).min(1).max(15), orderedImages: manifest };

export const realReportProviderWrapperSchema = m4ProviderWrapperSchema.extend({
  schemaVersion: z.literal("booklet_provider_v3"),
  providerEvidence: m4ProviderWrapperSchema.shape.providerEvidence.extend({
    status: z.enum(["completed", "incomplete", "failed", "cancelled", "unknown"]),
    stdioSdk: m4ProviderWrapperSchema.shape.providerEvidence.shape.stdioSdk.unwrap(),
    ...provenance, effectivePolicy: m4EffectivePolicyEvidenceSchema,
    contextWarnings: m4ContextWarningsSchema,
  }),
});

function preparedRealReport(policy: ExecutionPolicy, operation: ExperimentOperationDocument,
  finalDigest: string, textDigest: string) {
  const preparation = operation.realReportPreparation;
  const text = operation.m4Preparation;
  const reservation = operation.m4Reservation;
  const snapshot = executionPolicySnapshot(policy);
  if (policy.mode !== "real" || !policy.realReport || !preparation || !text || !reservation ||
      operation.mode !== "real" || operation.providerKind !== "text" ||
      operation.role !== "tester" && operation.role !== "judge" ||
      reservation.bucket !== (operation.role === "tester" ? "testerReport" : "judge") ||
      text.policyHash !== snapshot.hash || reservation.policyHash !== snapshot.hash ||
      preparation.finalRequestDigest !== finalDigest || preparation.textRequestDigest !== textDigest ||
      text.requestDigest !== reservation.requestDigest || m4Hash(text.requestJson) !== text.requestDigest) {
    throw new Error("Real report result has no matching prepared reservation.");
  }
  const carrier = realReportCarrierSchema.parse(JSON.parse(preparation.carrierJson));
  const authorized = m4AuthorizedCarrier(text.requestJson, policy.tokenPolicy);
  if (m4CanonicalJson(carrier) !== preparation.carrierJson || carrier.finalRequestDigest !== finalDigest ||
      carrier.textRequestDigest !== textDigest || carrier.textRequestJson !== authorized.requestJson ||
      authorized.requestDigest !== textDigest || m4Hash(carrier.textRequestJson) !== textDigest ||
      carrier.manifestDigest !== preparation.manifestDigest ||
      m4CanonicalJson(carrier.orderedImages) !== m4CanonicalJson(preparation.orderedImages) ||
      !Array.isArray(preparation.uploadFileIds) || preparation.uploadFileIds.length !== carrier.orderedImages.length ||
      new Set(preparation.uploadFileIds).size !== preparation.uploadFileIds.length) {
    throw new Error("Real report carrier differs from saved preparation.");
  }
  return { carrier, reservation, effective: executionOperationTokenPolicy(policy, operation) };
}

/** Assess only an authenticated readback from the original Dify execution. */
export function assessRealReportProviderResult(raw: unknown, policy: ExecutionPolicy,
  operation: ExperimentOperationDocument): { content: string; evidenceJson: string; evidenceDigest: string;
  chargeUpperMicrodollars: number | null; violations: string[]; canMaterialize: boolean; inspectedAssetIds: string[] } {
  const { policy: frozen } = executionPolicySnapshot(policy);
  const wrapper = realReportProviderWrapperSchema.parse(raw);
  const evidence = wrapper.providerEvidence;
  const { carrier, reservation, effective } = preparedRealReport(frozen, operation,
    evidence.requestDigest, evidence.textRequestDigest);
  const model = frozen.models[reservation.bucket];
  const usage = evidence.usage;
  const violations: string[] = [];
  if (evidence.manifestDigest !== carrier.manifestDigest ||
      m4CanonicalJson(evidence.orderedImages) !== m4CanonicalJson(carrier.orderedImages) ||
      m4CanonicalJson(evidence.inspectedAssetIds) !== m4CanonicalJson(carrier.orderedImages.map(item => item.assetId))) {
    violations.push("image_manifest_mismatch");
  }
  if (evidence.effectivePolicy.hash !== effective.hash ||
      evidence.effectivePolicy.maxInputTokens !== effective.maxInputTokens ||
      evidence.contextWarnings.length !== (evidence.countedInputTokens !== null && evidence.countedInputTokens > 32000 ? 1 : 0)) {
    violations.push("token_policy_mismatch");
  }
  if (evidence.model !== model.model) violations.push("model_mismatch");
  if (evidence.serviceTier !== frozen.serviceTier) violations.push("tier_mismatch");
  if (evidence.countedInputTokens === null || evidence.countedInputTokens > effective.maxInputTokens) violations.push("count_limit");
  const available = usage.source === "provider_reported" && usage.inputTokens !== null && usage.outputTokens !== null;
  if (!available) violations.push("usage_unavailable");
  if (usage.inputTokens !== null && usage.inputTokens > effective.maxInputTokens) violations.push("input_limit");
  if (usage.outputTokens !== null && usage.outputTokens > model.maxOutputTokens) violations.push("output_limit");
  if (usage.cachedInputTokens !== null && usage.inputTokens !== null && usage.cachedInputTokens > usage.inputTokens ||
      usage.cacheWriteInputTokens !== null && usage.inputTokens !== null && usage.cacheWriteInputTokens > usage.inputTokens ||
      usage.reasoningOutputTokens !== null && usage.outputTokens !== null && usage.reasoningOutputTokens > usage.outputTokens) {
    violations.push("usage_inconsistent");
  }
  if (evidence.responseId === null || evidence.requestId === null) violations.push("attribution_unavailable");
  const attributable = available && evidence.model === model.model && evidence.serviceTier === frozen.serviceTier &&
    evidence.responseId !== null && evidence.requestId !== null && !violations.includes("usage_inconsistent");
  const numerator = attributable ? BigInt(usage.inputTokens!) * BigInt(model.inputMicrodollarsPerMillion) +
    BigInt(usage.outputTokens!) * BigInt(model.outputMicrodollarsPerMillion) : null;
  const charge = numerator === null ? null : (numerator + 999_999n) / 1_000_000n;
  const chargeUpperMicrodollars = charge !== null && charge <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(charge) : null;
  const evidenceJson = m4CanonicalJson(evidence);
  return { content: wrapper.content, evidenceJson, evidenceDigest: m4Hash(evidenceJson), chargeUpperMicrodollars,
    violations, canMaterialize: violations.length === 0 && evidence.status === "completed" && !evidence.refused &&
      evidence.incompleteReason === null, inspectedAssetIds: evidence.inspectedAssetIds };
}

export const realReportPreGenerationFailureSchema = z.strictObject({
  schemaVersion: z.literal("booklet_pre_generation_failure_v2"), content: z.literal(""),
  failureEvidence: z.strictObject({ provider: z.literal("openai"), apiBaseUrl: z.literal("https://api.openai.com/v1"),
    stdioSdk: m4ProviderWrapperSchema.shape.providerEvidence.shape.stdioSdk.unwrap(),
    model: z.enum(["gpt-6-luna", "gpt-6-sol"]), serviceTier: z.literal("default"),
    requestDigest: digest, stage: z.literal("input_count"),
    code: z.enum(["input_limit_exceeded", "input_count_unavailable", "input_count_invalid", "input_count_request_failed"]),
    adapterVersion: z.literal(REAL_REPORT_ADAPTER_IDENTITY), countedInputTokens: count, limit: z.literal(128000),
    generationStarted: z.literal(false), elapsedMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    countRequestId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).nullable(),
    effectivePolicy: m4EffectivePolicyEvidenceSchema, contextWarnings: m4ContextWarningsSchema,
    manifestDigest: digest, textRequestDigest: digest, inspectedAssetIds: z.array(opaqueIdSchema).min(1).max(15),
  }),
});

export function realReportPreGenerationFailure(raw: unknown, policy: ExecutionPolicy,
  operation: ExperimentOperationDocument) {
  const parsed = realReportPreGenerationFailureSchema.safeParse(raw);
  if (!parsed.success) return null;
  try {
    const { policy: frozen } = executionPolicySnapshot(policy);
    const evidence = parsed.data.failureEvidence;
    const { carrier, reservation, effective } = preparedRealReport(frozen, operation,
      evidence.requestDigest, evidence.textRequestDigest);
    if (evidence.model !== frozen.models[reservation.bucket].model ||
        evidence.limit !== effective.maxInputTokens || evidence.effectivePolicy.hash !== effective.hash ||
        evidence.manifestDigest !== carrier.manifestDigest ||
        m4CanonicalJson(evidence.inspectedAssetIds) !== m4CanonicalJson(carrier.orderedImages.map(item => item.assetId)) ||
        evidence.contextWarnings.length !== (evidence.countedInputTokens !== null && evidence.countedInputTokens > 32000 ? 1 : 0) ||
        (evidence.code === "input_limit_exceeded" ? evidence.countedInputTokens === null ||
          evidence.countedInputTokens <= effective.maxInputTokens : evidence.countedInputTokens !== null)) return null;
    return parsed.data;
  } catch { return null; }
}
