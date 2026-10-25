import { createHash } from "node:crypto";
import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { personaSchema, type ExperimentRole } from "@/lib/contracts/experiment-runner";
import { savedConfigurationItemSchema } from "@/lib/experiment-runner/config";

export const M4_DOLLAR_LIMIT = 5_000_000;
export const m4Digest = z.string().regex(/^[0-9a-f]{64}$/);
const money = z.number().int().min(0).max(M4_DOLLAR_LIMIT);
// Prices are frozen planning inputs, not a claim of current live pricing.
const modelPolicy = (model: "gpt-6-luna" | "gpt-6-sol", effort: "none" | "low", output: 2048 | 8192) => z.strictObject({
  model: z.literal(model), reasoningEffort: z.literal(effort), maxOutputTokens: z.literal(output),
  inputMicrodollarsPerMillion: z.literal(model === "gpt-6-luna" ? 125_000 : 2_500_000),
  outputMicrodollarsPerMillion: z.literal(model === "gpt-6-luna" ? 500_000 : 10_000_000),
});
export const m4PolicySchema = z.strictObject({
  schemaVersion: z.literal("m4_v1"), mode: z.literal("balanced"), imageProvider: z.literal("simulated"),
  provider: z.literal("openai"), protocol: z.literal("responses"), serviceTier: z.literal("default"),
  apiBaseUrl: z.literal("https://api.openai.com/v1"),
  pluginIdentity: z.string().regex(/^langgenius\/openai:[^@\s]+@[0-9a-f]{64}$/),
  requestDefinitionHash: m4Digest,
  pricingReference: z.string().min(1).max(500),
  // User-selected experiment assumption is explicit, never treated as a verified fee.
  countChargeStatus: z.enum(["verified", "assumed"]),
  countChargeCeilingMicrodollars: money, countVerificationReference: z.string().min(1).max(500),
  maxInputTokens: z.literal(32000), maxRequests: z.literal(500), maxJudges: z.literal(3),
  maxMicrodollars: z.literal(M4_DOLLAR_LIMIT), retries: z.literal(0), tools: z.literal(false),
  maxTimeoutSeconds: z.literal(120),
  models: z.strictObject({
    decision: modelPolicy("gpt-6-luna", "none", 2048),
    specialist: modelPolicy("gpt-6-luna", "low", 8192),
    testerReport: modelPolicy("gpt-6-luna", "none", 8192),
    judge: modelPolicy("gpt-6-sol", "low", 8192),
  }),
  publications: z.array(savedConfigurationItemSchema.extend({ persona: personaSchema.nullable() })).length(18),
}).superRefine((policy, context) => {
  if (policy.countChargeStatus === "assumed" && policy.countChargeCeilingMicrodollars !== 900) {
    context.addIssue({ code: "custom", message: "The disclosed unverified count allowance is 900 microdollars per invocation." });
  }
  const slots = policy.publications.map((p) => `${p.role}:${p.taskId ?? ""}:${p.persona ?? ""}`);
  const expected = ["manager::", "image::", "judge::", ...Array.from({ length: 12 }, (_, i) => `specialist:J${String(i + 1).padStart(2, "0")}:`),
    ...personaSchema.options.map((p) => `tester::${p}`)];
  if (new Set(slots).size !== 18 || expected.some((s) => !slots.includes(s)) ||
      new Set(policy.publications.map((p) => p.appId)).size !== 18 ||
      policy.publications.filter((p) => p.finalPageIllustration).length !== 1 ||
      !policy.publications.some((p) => p.role === "image" && p.finalPageIllustration)) {
    context.addIssue({ code: "custom", message: "M4 requires the complete eighteen-binding profile." });
  }
});
export type M4Policy = z.infer<typeof m4PolicySchema>;
export type M4ModelBucket = keyof M4Policy["models"];
export const m4TokenAmendmentSchema = z.strictObject({
  version: z.literal("m4_context_policy_v2"), basePolicyHash: m4Digest,
  warningInputTokens: z.literal(32000), maxInputTokens: z.literal(128000),
  requiredProviderAdapterIdentity: z.string().regex(/^langgenius\/openai:1\.0\.7-dev5@[0-9a-f]{64}$/),
  requiredProviderPackageSha256: m4Digest,
  reference: z.string().min(1).max(500),
});
export const m4TokenPolicySchema = z.strictObject({ amendment: m4TokenAmendmentSchema, hash: m4Digest });
export type M4TokenPolicy = z.infer<typeof m4TokenPolicySchema>;
export const m4ContinuationGrantSchema = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema,
  reference: z.string().min(1).max(500) });
export const legacyCountRecoveryGrantSchema = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema,
  workflowRunId: opaqueIdSchema, publishedWorkflowId: opaqueIdSchema, pluginIdentity: m4PolicySchema.shape.pluginIdentity,
  guardSourceSha256: m4Digest, nodeTraceDigest: m4Digest, reference: z.string().min(1).max(500) });
export const m4GrantSchema = z.strictObject({ campaignId: opaqueIdSchema, reference: z.string().min(1).max(500),
  remainingPersonaAdmission: z.strictObject({ anchorRunId: opaqueIdSchema, anchorRevision: z.number().int().nonnegative(),
    personas: z.tuple([z.literal("enthusiast_parent"), z.literal("professional_creator")]),
    reference: z.string().min(1).max(500) }).optional(),
  continuations: z.array(m4ContinuationGrantSchema).max(20).optional(),
  completionRecoveries: z.array(m4ContinuationGrantSchema).max(20).optional(),
  preGenerationRecoveries: z.array(legacyCountRecoveryGrantSchema).max(1).optional(),
  requestDefinitionUpdate: z.strictObject({ fromBundleHash: m4Digest, toBundleHash: m4Digest,
    reference: z.string().min(1).max(500) }).optional(),
  providerAdapterUpdate: z.strictObject({ fromIdentity: m4PolicySchema.shape.pluginIdentity,
    version: z.enum(["1.0.7-dev3", "1.0.7-dev4", "1.0.7-dev5"]), packageSha256: m4Digest,
    identity: m4PolicySchema.shape.pluginIdentity.optional(), reference: z.string().min(1).max(500) }).optional(),
  tokenPolicy: m4TokenPolicySchema.optional(),
}).superRefine((grant, context) => {
  const keys = [...grant.continuations ?? [], ...grant.completionRecoveries ?? []].map((item) => item.operationId);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", message: "Continuation operations must be unique." });
  if (grant.preGenerationRecoveries?.some(item => grant.completionRecoveries?.some(other => other.operationId === item.operationId))) {
    context.addIssue({ code: "custom", message: "Recovery operations must have one exact recovery kind." });
  }
});
export type M4Grant = z.infer<typeof m4GrantSchema>;

function canonicalPolicyJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
}

export function m4TokenPolicySnapshot(raw: unknown): M4TokenPolicy {
  const amendment = m4TokenAmendmentSchema.parse(raw);
  return { amendment, hash: createHash("sha256").update(canonicalPolicyJson(amendment)).digest("hex") };
}

/** Resolve saved authority, never reinterpret historical work from a new grant. */
export function m4EffectiveTokenPolicy(policy: M4Policy, saved?: unknown) {
  if (saved === undefined) return { maxInputTokens: 32000 as const, warningInputTokens: 32000 as const,
    hash: null, snapshot: undefined };
  const parsed = m4TokenPolicySchema.parse(saved);
  const expected = m4TokenPolicySnapshot(parsed.amendment);
  if (parsed.hash !== expected.hash || parsed.amendment.basePolicyHash !== m4PolicySnapshot(policy).hash)
    throw new Error("Saved effective token policy differs from its base or canonical identity.");
  return { maxInputTokens: parsed.amendment.maxInputTokens, warningInputTokens: parsed.amendment.warningInputTokens,
    hash: parsed.hash, snapshot: parsed };
}

type TokenPreparation = { tokenPolicy?: M4TokenPolicy; adapterUpdate?: M4Grant["providerAdapterUpdate"] };
type TokenReservation = { tokenPolicy?: M4TokenPolicy; effectivePolicyHash?: string; maxInputTokens?: number };
export function m4ReservationTokenPolicy(policy: M4Policy, reservation: TokenReservation) {
  const effective = m4EffectiveTokenPolicy(policy, reservation.tokenPolicy);
  if (effective.snapshot ? reservation.effectivePolicyHash !== effective.hash || reservation.maxInputTokens !== effective.maxInputTokens :
      reservation.effectivePolicyHash !== undefined || reservation.maxInputTokens !== undefined)
    throw new Error("Reservation effective token identity or ceiling differs.");
  return effective;
}
export function m4PreparationTokenPolicy(policy: M4Policy, preparation: TokenPreparation) {
  const effective = m4EffectiveTokenPolicy(policy, preparation.tokenPolicy);
  if (effective.snapshot) {
    const adapter = preparation.adapterUpdate;
    if (!adapter || adapter.fromIdentity !== policy.pluginIdentity || adapter.version !== "1.0.7-dev5" ||
        effective.snapshot.amendment.requiredProviderAdapterIdentity !== adapter.identity ||
        effective.snapshot.amendment.requiredProviderPackageSha256 !== adapter.packageSha256)
      throw new Error("Effective token policy requires its exact saved provider adapter.");
  }
  return effective;
}

export function m4OperationTokenPolicy(policy: M4Policy, operation: {
  m4Preparation?: TokenPreparation; m4Reservation?: TokenReservation;
}) {
  if (!operation.m4Preparation || !operation.m4Reservation) throw new Error("Effective token policy requires preparation and reservation.");
  const effective = m4PreparationTokenPolicy(policy, operation.m4Preparation), reservation = operation.m4Reservation;
  const reserved = m4ReservationTokenPolicy(policy, reservation);
  if (canonicalPolicyJson(reservation.tokenPolicy) !== canonicalPolicyJson(operation.m4Preparation.tokenPolicy) ||
      effective.hash !== reserved.hash)
    throw new Error("Preparation and reservation effective token policies differ.");
  return effective;
}

/** Admission uses current reviewed authority; no historical verifier uses this equality. */
export function m4AdmittedTokenPolicy(policy: M4Policy, grant: M4Grant, preparation?: TokenPreparation) {
  const effective = m4PreparationTokenPolicy(policy, { tokenPolicy: grant.tokenPolicy, adapterUpdate: grant.providerAdapterUpdate });
  if (preparation && canonicalPolicyJson(preparation.tokenPolicy) !== canonicalPolicyJson(grant.tokenPolicy))
    throw new Error("Prepared work cannot adopt another token policy.");
  return effective;
}

function freezeJson(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const item of Object.values(value)) freezeJson(item);
  Object.freeze(value);
}

// This hashes the manifest only. It is NOT the Python provider request encoding.
export function m4PolicySnapshot(raw: unknown): { policy: M4Policy; json: string; hash: string } {
  const policy = m4PolicySchema.parse(raw);
  const json = JSON.stringify(policy, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);
  const owned = JSON.parse(json) as M4Policy;
  freezeJson(owned);
  return Object.freeze({ policy: owned, json, hash: createHash("sha256").update(json).digest("hex") });
}
export function m4ModelBucket(role: ExperimentRole, report: boolean): M4ModelBucket {
  if (role === "image") throw new Error("M4 images cannot reserve text-provider charges.");
  return role === "judge" ? "judge" : role === "specialist" ? "specialist" : role === "tester" && report ? "testerReport" : "decision";
}
export function m4MaximumCharge(policy: M4Policy, bucket: M4ModelBucket, tokenPolicy?: M4TokenPolicy): number {
  const model = policy.models[bucket];
  const effective = m4EffectiveTokenPolicy(policy, tokenPolicy);
  return Math.ceil((effective.maxInputTokens * model.inputMicrodollarsPerMillion +
    model.maxOutputTokens * model.outputMicrodollarsPerMillion) / 1_000_000) + policy.countChargeCeilingMicrodollars;
}
