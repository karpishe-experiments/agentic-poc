import { createHash } from "node:crypto";
import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { CASES, personaSchema } from "@/lib/contracts/experiment-runner";
import { savedConfigurationItemSchema } from "@/lib/experiment-runner/config";
import { m4PolicySchema, m4TokenPolicySchema, m4TokenPolicySnapshot, type M4Policy, type M4TokenPolicy } from "@/lib/experiment-runner/m4-policy";
import { executionRequestBundleHash } from "@/lib/experiment-runner/execution-request";
import type { ExperimentOperationDocument } from "@/db/documents";

const finiteTotal = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveTotal = finiteTotal.positive();
const digest = z.string().regex(/^[0-9a-f]{64}$/);

// This is a technical execution snapshot. Spending authority is recorded only
// in the campaign's separate append-only allowance history.
export const executionPolicySchema = z.strictObject({
  schemaVersion: z.literal("execution_v1"),
  mode: z.enum(["balanced", "real"]),
  provider: m4PolicySchema.shape.provider,
  protocol: m4PolicySchema.shape.protocol,
  serviceTier: m4PolicySchema.shape.serviceTier,
  apiBaseUrl: m4PolicySchema.shape.apiBaseUrl,
  pluginIdentity: m4PolicySchema.shape.pluginIdentity,
  requestDefinitionHash: digest,
  pricingReference: m4PolicySchema.shape.pricingReference,
  countChargeStatus: m4PolicySchema.shape.countChargeStatus,
  countChargeCeilingMicrodollars: finiteTotal,
  countVerificationReference: m4PolicySchema.shape.countVerificationReference,
  retries: z.literal(0),
  tools: z.literal(false),
  maxTimeoutSeconds: m4PolicySchema.shape.maxTimeoutSeconds,
  models: m4PolicySchema.shape.models,
  tokenPolicy: m4TokenPolicySchema,
  publications: z.array(savedConfigurationItemSchema.extend({ persona: personaSchema.nullable() })).length(18),
}).superRefine((policy, context) => {
  if (policy.requestDefinitionHash !== executionRequestBundleHash()) context.addIssue({ code: "custom", message: "Request definitions differ from the reviewed bundle." });
  if (policy.tokenPolicy.hash !== m4TokenPolicySnapshot(policy.tokenPolicy.amendment).hash) context.addIssue({ code: "custom", message: "Token carrier identity differs." });
  if (policy.pluginIdentity !== policy.tokenPolicy.amendment.requiredProviderAdapterIdentity) context.addIssue({ code: "custom", message: "Execution provider identity differs from its required installed adapter." });
  const slots = policy.publications.map(item => `${item.role}:${item.taskId ?? ""}:${item.persona ?? ""}`);
  const expected = ["manager::", "image::", "judge::", ...Array.from({ length: 12 }, (_, i) => `specialist:J${String(i + 1).padStart(2, "0")}:`),
    ...personaSchema.options.map(persona => `tester::${persona}`)];
  if (new Set(slots).size !== 18 || expected.some(slot => !slots.includes(slot)) ||
      new Set(policy.publications.map(item => item.appId)).size !== 18 ||
      policy.publications.filter(item => item.finalPageIllustration === true).length !== 1 ||
      !policy.publications.some(item => item.role === "image" && item.finalPageIllustration === true)) {
    context.addIssue({ code: "custom", message: "Execution requires the complete eighteen-binding profile." });
  }
});
export type ExecutionPolicy = z.infer<typeof executionPolicySchema>;

export const executionAllowanceSchema = z.strictObject({
  maxMicrodollars: positiveTotal,
  textCalls: positiveTotal,
  imageCalls: finiteTotal,
  steps: positiveTotal,
  textRevisions: finiteTotal,
  imageRevisions: finiteTotal,
  noProgress: positiveTotal,
});
export type ExecutionAllowance = z.infer<typeof executionAllowanceSchema>;

export const executionApprovalSchema = z.strictObject({
  approvalId: opaqueIdSchema,
  reference: z.string().trim().min(1).max(500),
  expectedRevision: finiteTotal,
  totals: executionAllowanceSchema,
});
export type ExecutionApproval = z.infer<typeof executionApprovalSchema>;

export function defaultExecutionAllowance(persona: z.infer<typeof personaSchema>, maxMicrodollars: number): ExecutionAllowance {
  const selected = CASES[persona];
  return executionAllowanceSchema.parse({ maxMicrodollars, textCalls: selected.llmLimit, imageCalls: selected.imageLimit,
    steps: 300, textRevisions: selected.textRevisionLimit, imageRevisions: selected.imageRevisionLimit, noProgress: 3 });
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}

export function executionPolicySnapshot(raw: unknown): { policy: ExecutionPolicy; json: string; hash: string } {
  const policy = executionPolicySchema.parse(raw);
  const json = canonical(policy);
  return { policy: JSON.parse(json) as ExecutionPolicy, json, hash: createHash("sha256").update(json).digest("hex") };
}

export function executionPolicyFromM4TechnicalProfile(source: M4Policy, tokenPolicy: M4TokenPolicy,
  mode: "balanced" | "real" = "balanced"): ExecutionPolicy {
  return executionPolicySchema.parse({ schemaVersion: "execution_v1", mode,
    provider: source.provider, protocol: source.protocol, serviceTier: source.serviceTier,
    apiBaseUrl: source.apiBaseUrl, pluginIdentity: tokenPolicy.amendment.requiredProviderAdapterIdentity,
    requestDefinitionHash: executionRequestBundleHash(), pricingReference: source.pricingReference,
    countChargeStatus: source.countChargeStatus,
    countChargeCeilingMicrodollars: source.countChargeCeilingMicrodollars,
    countVerificationReference: source.countVerificationReference,
    retries: source.retries, tools: source.tools, maxTimeoutSeconds: source.maxTimeoutSeconds,
    models: source.models, tokenPolicy, publications: source.publications });
}

export function executionMaximumTextCharge(policy: ExecutionPolicy, bucket: keyof ExecutionPolicy["models"]): number {
  const model = policy.models[bucket];
  const numerator = policy.tokenPolicy.amendment.maxInputTokens * model.inputMicrodollarsPerMillion +
    model.maxOutputTokens * model.outputMicrodollarsPerMillion;
  if (!Number.isSafeInteger(numerator)) throw new Error("Execution price bound is unsafe.");
  return Math.ceil(numerator / 1_000_000) + policy.countChargeCeilingMicrodollars;
}

export function executionOperationTokenPolicy(policy: ExecutionPolicy, operation: ExperimentOperationDocument) {
  const prepared = operation.m4Preparation, reserved = operation.m4Reservation;
  if (!prepared || !reserved || canonical(prepared.tokenPolicy ?? null) !== canonical(policy.tokenPolicy) ||
      canonical(reserved.tokenPolicy ?? null) !== canonical(policy.tokenPolicy) ||
      reserved.effectivePolicyHash !== policy.tokenPolicy.hash ||
      reserved.maxInputTokens !== policy.tokenPolicy.amendment.maxInputTokens) {
    throw new Error("Execution preparation and reservation token identities differ.");
  }
  return { snapshot: policy.tokenPolicy, hash: policy.tokenPolicy.hash,
    maxInputTokens: policy.tokenPolicy.amendment.maxInputTokens };
}
