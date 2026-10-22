import { z } from "zod";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { m4Digest, m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { m4ProviderWrapperSchema } from "@/lib/experiment-runner/m4-provider-result";
import { m4Hash } from "@/lib/experiment-runner/m4-request";
import { validateLegacyCountFailureProof } from "@/lib/experiment-runner/m4-legacy-count-failure";

export const m4PreGenerationFailureSchema = z.strictObject({ schemaVersion: z.literal("booklet_pre_generation_failure_v1"),
  content: z.literal(""), failureEvidence: z.strictObject({
    provider: z.literal("openai"), apiBaseUrl: z.literal("https://api.openai.com/v1"),
    adapterVersion: z.enum(["1.0.7-dev3", "1.0.7-dev4"]),
    stdioSdk: m4ProviderWrapperSchema.shape.providerEvidence.shape.stdioSdk.unwrap(),
    model: z.enum(["gpt-6-luna", "gpt-6-sol"]), serviceTier: z.literal("default"), requestDigest: m4Digest,
    stage: z.literal("input_count"), code: z.enum(["input_limit_exceeded", "input_count_unavailable", "input_count_invalid", "input_count_request_failed"]),
    countedInputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(), limit: z.literal(32000),
    generationStarted: z.literal(false), elapsedMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    countRequestId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).nullable(),
  }),
});

// Only authenticated original execution readback may call this classifier.
// A terminal count failure closes bookkeeping; it never settles or releases money.
export function m4PreGenerationFailure(raw: unknown, policyRaw: unknown, op: ExperimentOperationDocument) {
  const parsed = m4PreGenerationFailureSchema.safeParse(raw);
  if (!parsed.success) return null;
  const evidence = parsed.data.failureEvidence, policy = m4PolicySnapshot(policyRaw);
  const reservation = op.m4Reservation, preparation = op.m4Preparation;
  if (op.mode !== "balanced" || op.providerKind !== "text" || op.role === "image" || op.reservationCount !== 1 ||
      !preparation || !reservation || reservation.policyHash !== policy.hash || preparation.policyHash !== policy.hash ||
      preparation.requestDigest !== m4Hash(preparation.requestJson) ||
      preparation.adapterUpdate?.version !== evidence.adapterVersion || preparation.adapterUpdate.fromIdentity !== policy.policy.pluginIdentity ||
      !m4Digest.safeParse(preparation.adapterUpdate.packageSha256).success ||
      evidence.requestDigest !== preparation.requestDigest || evidence.requestDigest !== reservation.requestDigest ||
      evidence.model !== policy.policy.models[reservation.bucket].model ||
      (evidence.code === "input_limit_exceeded" ? evidence.countedInputTokens === null || evidence.countedInputTokens <= policy.policy.maxInputTokens
        : evidence.countedInputTokens !== null)) return null;
  return parsed.data;
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
      limit: 32000, generationStarted: false as const };
  } catch { return null; }
}
