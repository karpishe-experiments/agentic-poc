import { z } from "zod";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { m4Digest, m4OperationTokenPolicy, m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { m4ProviderWrapperSchema, m4EffectivePolicyEvidenceSchema, m4ContextWarningsSchema } from "@/lib/experiment-runner/m4-provider-result";
import { m4Hash } from "@/lib/experiment-runner/m4-request";
import { validateLegacyCountFailureProof } from "@/lib/experiment-runner/m4-legacy-count-failure";

export const m4PreGenerationFailureSchema = z.strictObject({ schemaVersion: z.literal("booklet_pre_generation_failure_v1"),
  content: z.literal(""), failureEvidence: z.strictObject({
    provider: z.literal("openai"), apiBaseUrl: z.literal("https://api.openai.com/v1"),
    adapterVersion: z.enum(["1.0.7-dev3", "1.0.7-dev4", "1.0.7-dev5"]),
    stdioSdk: m4ProviderWrapperSchema.shape.providerEvidence.shape.stdioSdk.unwrap(),
    model: z.enum(["gpt-6-luna", "gpt-6-sol"]), serviceTier: z.literal("default"), requestDigest: m4Digest,
    stage: z.literal("input_count"), code: z.enum(["input_limit_exceeded", "input_count_unavailable", "input_count_invalid", "input_count_request_failed"]),
    countedInputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(), limit: z.literal(32000),
    generationStarted: z.literal(false), elapsedMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    countRequestId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).nullable(),
  }),
});
export const m4PreGenerationFailureV2Schema = m4PreGenerationFailureSchema.extend({
  schemaVersion: z.literal("booklet_pre_generation_failure_v2"),
  failureEvidence: m4PreGenerationFailureSchema.shape.failureEvidence.extend({
    adapterVersion: z.literal("1.0.7-dev5"), limit: z.literal(128000),
    effectivePolicy: m4EffectivePolicyEvidenceSchema, contextWarnings: m4ContextWarningsSchema,
  }),
});
const failureReadback = z.discriminatedUnion("schemaVersion", [m4PreGenerationFailureSchema, m4PreGenerationFailureV2Schema]);

// Only authenticated original execution readback may call this classifier.
// A terminal count failure closes bookkeeping; it never settles or releases money.
export function m4PreGenerationFailure(raw: unknown, policyRaw: unknown, op: ExperimentOperationDocument) {
  const parsed = failureReadback.safeParse(raw);
  if (!parsed.success) return null;
  const evidence = parsed.data.failureEvidence, policy = m4PolicySnapshot(policyRaw);
  const reservation = op.m4Reservation, preparation = op.m4Preparation;
  let effective: ReturnType<typeof m4OperationTokenPolicy>;
  try { effective = m4OperationTokenPolicy(policy.policy, op); } catch { return null; }
  if (effective.snapshot ? parsed.data.schemaVersion !== "booklet_pre_generation_failure_v2" ||
      parsed.data.failureEvidence.effectivePolicy.hash !== effective.hash ||
      parsed.data.failureEvidence.contextWarnings.length !== (evidence.countedInputTokens !== null && evidence.countedInputTokens > 32000 ? 1 : 0) :
      parsed.data.schemaVersion !== "booklet_pre_generation_failure_v1") return null;
  if (op.mode !== "balanced" || op.providerKind !== "text" || op.role === "image" || op.reservationCount !== 1 ||
      !preparation || !reservation || reservation.policyHash !== policy.hash || preparation.policyHash !== policy.hash ||
      preparation.requestDigest !== m4Hash(preparation.requestJson) ||
      preparation.adapterUpdate?.version !== evidence.adapterVersion || preparation.adapterUpdate.fromIdentity !== policy.policy.pluginIdentity ||
      !m4Digest.safeParse(preparation.adapterUpdate.packageSha256).success ||
      evidence.requestDigest !== preparation.requestDigest || evidence.requestDigest !== reservation.requestDigest ||
      evidence.model !== policy.policy.models[reservation.bucket].model ||
      evidence.limit !== effective.maxInputTokens ||
      (evidence.code === "input_limit_exceeded" ? evidence.countedInputTokens === null || evidence.countedInputTokens <= effective.maxInputTokens
        : evidence.countedInputTokens !== null)) return null;
  return parsed.data;
}

// Eligibility only: callers must also verify authenticated execution, original
// preparation, reservation, global output absence and ownership in a transaction.
// Final advisory reports and other reviewer failures never qualify.
export function isM4ReviewerInputFailure(policy: unknown, run: ExperimentRunDocument, op: ExperimentOperationDocument): boolean {
  if (op.role !== "tester" || op.taskId !== null ||
      run.generationCompletedAtMs != null || run.evaluationStatus !== "pending" ||
      op.m4Reservation?.bucket !== "decision" || !op.m4Observation?.evidenceJson ||
      op.m4Observation.issue !== "provider_failure" || op.m4Observation.remoteStatus !== "succeeded" ||
      op.lifecycle?.stop || op.m4PreGenerationRecovery) return false;
  try {
    return m4PreGenerationFailure(JSON.parse(op.m4Observation.evidenceJson), policy, op)?.failureEvidence.code === "input_limit_exceeded";
  } catch { return false; }
}

// Historical accounting/inspection must use the retained decision-stage identity,
// even after the same run reaches final evaluation. This does not grant Resume.
export function isM4ContinuedReviewerInputFailure(policy: unknown, run: ExperimentRunDocument, op: ExperimentOperationDocument): boolean {
  const saved = op.m4Continuation;
  if (!saved || saved.kind !== undefined || !saved.reference || !Number.isSafeInteger(saved.resumedAtMs) ||
      saved.evidenceDigest !== op.m4Observation?.evidenceDigest || saved.requestDigest !== op.m4Reservation?.requestDigest ||
      run.generationCompletedAtMs != null && saved.resumedAtMs > run.generationCompletedAtMs) return false;
  return isM4ReviewerInputFailure(policy, { ...run, generationCompletedAtMs: undefined, evaluationStatus: "pending" }, op);
}

/** Read-only diagnostic projection; this grants no recovery or provider action. */
export function m4CountFailureDiagnostic(op: ExperimentOperationDocument, run: ExperimentRunDocument) {
  if (!run.m4 || !op.m4PreGenerationRecovery && op.m4Observation?.issue !== "provider_failure") return null;
  try {
    const policy = m4PolicySnapshot(JSON.parse(run.m4.policyJson)).policy;
    if (validateLegacyCountFailureProof(policy, run, op)) return {
      code: "legacy_input_count_guard", countedInputTokens: null as number | null, limit: 32000, generationStarted: false as const,
    };
    const json = op.m4Observation?.evidenceJson;
    if (!json || m4Hash(json) !== op.m4Observation?.evidenceDigest) return null;
    const parsed = m4PreGenerationFailure(JSON.parse(json), policy, op);
    if (!parsed) return null;
    return { code: parsed.failureEvidence.code, countedInputTokens: parsed.failureEvidence.countedInputTokens,
      limit: parsed.failureEvidence.limit, generationStarted: false as const };
  } catch { return null; }
}
