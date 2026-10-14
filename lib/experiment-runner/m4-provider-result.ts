import { z } from "zod";
import type { ExperimentOperationDocument } from "@/db/documents";
import { m4Digest, m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";

const tokens = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
export const m4ProviderWrapperSchema = z.strictObject({ schemaVersion: z.literal("booklet_provider_v1"),
  content: z.string().max(2 * 1024 * 1024), providerEvidence: z.strictObject({
    provider: z.literal("openai"), apiBaseUrl: z.literal("https://api.openai.com/v1"),
    responseId: z.string().min(1).max(200).nullable(), requestId: z.string().min(1).max(200).nullable(),
    model: z.string().min(1).max(200).nullable(), serviceTier: z.string().max(100).nullable(),
    status: z.enum(["completed", "incomplete", "failed", "cancelled"]), refused: z.boolean(),
    incompleteReason: z.enum(["max_output_tokens", "content_filter", "unknown"]).nullable(),
    requestDigest: m4Digest, countedInputTokens: tokens,
    usage: z.strictObject({ source: z.enum(["provider_reported", "unavailable"]), inputTokens: tokens, outputTokens: tokens,
      cachedInputTokens: tokens, cacheWriteInputTokens: tokens, reasoningOutputTokens: tokens }),
  }),
});

// Call only on the original authenticated Dify execution readback. Notifications
// and model creative content cannot supply accounting evidence. The result is
// independent of creative JSON validity, so malformed content cannot erase usage.
export function assessM4ProviderResult(raw: unknown, policyRaw: unknown, operation: ExperimentOperationDocument) {
  const snapshot = m4PolicySnapshot(policyRaw); const policy = snapshot.policy;
  const wrapper = m4ProviderWrapperSchema.parse(raw);
  const evidence = wrapper.providerEvidence; const reservation = operation.m4Reservation;
  if (!reservation || !operation.m4Preparation || operation.mode !== "balanced" || operation.providerKind !== "text" ||
      reservation.policyHash !== snapshot.hash || operation.m4Preparation.policyHash !== snapshot.hash ||
      evidence.requestDigest !== reservation.requestDigest || evidence.requestDigest !== operation.m4Preparation.requestDigest) {
    throw new Error("M4 provider result has no matching prepared reservation.");
  }
  const model = policy.models[reservation.bucket]; const usage = evidence.usage;
  const violations: string[] = [];
  if (evidence.model !== model.model) violations.push("model_mismatch");
  if (evidence.serviceTier !== policy.serviceTier) violations.push("tier_mismatch");
  if (evidence.countedInputTokens === null || evidence.countedInputTokens > policy.maxInputTokens) violations.push("count_limit");
  const available = usage.source === "provider_reported" && usage.inputTokens !== null && usage.outputTokens !== null;
  if (!available) violations.push("usage_unavailable");
  if (usage.inputTokens !== null && usage.inputTokens > policy.maxInputTokens) violations.push("input_limit");
  if (usage.outputTokens !== null && usage.outputTokens > model.maxOutputTokens) violations.push("output_limit");
  if (usage.cachedInputTokens !== null && usage.inputTokens !== null && usage.cachedInputTokens > usage.inputTokens ||
      usage.cacheWriteInputTokens !== null && usage.inputTokens !== null && usage.cacheWriteInputTokens > usage.inputTokens ||
      usage.reasoningOutputTokens !== null && usage.outputTokens !== null && usage.reasoningOutputTokens > usage.outputTokens) violations.push("usage_inconsistent");
  if (evidence.responseId === null || evidence.requestId === null) violations.push("attribution_unavailable");
  // Charge allocation uses frozen upper rates, not a claim of invoice cost.
  // Discounts are ignored; reasoning is already included in total output.
  const attributable = available && evidence.model === model.model && evidence.serviceTier === policy.serviceTier &&
    evidence.responseId !== null && evidence.requestId !== null && !violations.includes("usage_inconsistent");
  const numerator = attributable ? usage.inputTokens! * model.inputMicrodollarsPerMillion + usage.outputTokens! * model.outputMicrodollarsPerMillion : null;
  const chargeUpperMicrodollars = numerator !== null && Number.isSafeInteger(numerator) ? Math.ceil(numerator / 1_000_000) : null;
  const evidenceJson = m4CanonicalJson(evidence);
  return { content: wrapper.content, evidenceJson, evidenceDigest: m4Hash(evidenceJson), chargeUpperMicrodollars, violations,
    canMaterialize: violations.length === 0 && evidence.status === "completed" && !evidence.refused && evidence.incompleteReason === null };
}
