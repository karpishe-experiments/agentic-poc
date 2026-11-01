import { createHash } from "node:crypto";
import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { CASES, personaSchema } from "@/lib/contracts/experiment-runner";
import { savedConfigurationItemSchema } from "@/lib/experiment-runner/config";
import { m4PolicySchema, m4TokenPolicySchema, m4TokenPolicySnapshot, type M4Policy, type M4TokenPolicy } from "@/lib/experiment-runner/m4-policy";
import { executionRequestBundleHash, realRequestBundleHash, executionV2RequestBundleHash } from "@/lib/experiment-runner/execution-request";
import type { ExperimentOperationDocument } from "@/db/documents";
import { REAL_IMAGE_ADAPTER_IDENTITY, REAL_IMAGE_MODEL } from "@/lib/experiment-runner/real-image-contract";
import { REAL_REPORT_ADAPTER_IDENTITY } from "@/lib/experiment-runner/real-report-carrier";

const finiteTotal = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveTotal = finiteTotal.positive();
const digest = z.string().regex(/^[0-9a-f]{64}$/);

// This is a technical execution snapshot. Spending authority is recorded only
// in the campaign's separate append-only allowance history.
export const executionPolicySchema = z.strictObject({
  schemaVersion: z.enum(["execution_v1", "execution_v2"]),
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
  realImage: z.strictObject({ adapterIdentity: z.literal(REAL_IMAGE_ADAPTER_IDENTITY),
    // Keep saved dev1 profiles readable; new readiness pins only the reviewed dev2.
    pluginIdentity: z.string().regex(/^langgenius\/openai_tool:0\.2\.2-dev[123]@[0-9a-f]{64}$/), packageSha256: digest,
    nativeFileOrigin: z.literal("https://dify.uniwares.co.uk"),
    model: z.literal(REAL_IMAGE_MODEL), size: z.enum(["1024x1024", "1536x1024", "1024x1536"]),
    quality: z.enum(["low", "medium", "high", "xhigh", "max"]),
    background: z.enum(["opaque", "transparent"]), outputFormat: z.enum(["png", "jpeg", "webp"]),
    n: z.literal(1), retries: z.literal(0), timeoutSeconds: z.number().int().positive().max(270),
    maxReferences: z.literal(15), planningLiability: z.literal("remaining_allowance_hold_v1"),
    price: z.strictObject({ reference: z.string().min(1), inputTextMicrodollarsPerMillion: z.literal(5_000_000),
      inputImageMicrodollarsPerMillion: z.literal(8_000_000),
      outputImageMicrodollarsPerMillion: z.literal(30_000_000) }),
  }).optional(),
  realReport: z.strictObject({ adapterIdentity: z.literal(REAL_REPORT_ADAPTER_IDENTITY), packageSha256: digest,
    requestDefinitionHash: digest }).optional(),
}).superRefine((policy, context) => {
  if (policy.mode === "real" && (!policy.realImage || !policy.realReport) ||
      policy.mode === "balanced" && (policy.realImage || policy.realReport)) {
    context.addIssue({ code: "custom", message: "Real adapters belong only to a complete Real profile." });
  }
  const requestHash = policy.schemaVersion === "execution_v2" ? executionV2RequestBundleHash() :
    policy.mode === "real" ? realRequestBundleHash() : executionRequestBundleHash();
  if (policy.schemaVersion === "execution_v2" && policy.mode !== "real") {
    context.addIssue({ code: "custom", message: "The compact manager profile is Real only." });
  }
  if (policy.requestDefinitionHash !== requestHash) {
    context.addIssue({ code: "custom", message: "Request definitions differ from the reviewed bundle." });
  }
  if (policy.mode === "real" && policy.realReport?.requestDefinitionHash !== requestHash) {
    context.addIssue({ code: "custom", message: "Real report definition differs from its technical profile." });
  }
  if (policy.tokenPolicy.hash !== m4TokenPolicySnapshot(policy.tokenPolicy.amendment).hash) context.addIssue({ code: "custom", message: "Token carrier identity differs." });
  if (policy.mode === "balanced" && policy.pluginIdentity !== policy.tokenPolicy.amendment.requiredProviderAdapterIdentity ||
      policy.mode === "real" && !/^langgenius\/openai:1\.0\.7-dev[67]@[0-9a-f]{64}$/.test(policy.pluginIdentity)) {
    // Real retains the reviewed v2 token carrier for its text roles. Its
    // actual installed provider is separately pinned to the dev6 candidate.
    context.addIssue({ code: "custom", message: "Execution provider identity differs from its mode." });
  }
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

export function executionPolicyFromM4TechnicalProfile(source: M4Policy, tokenPolicy: M4TokenPolicy): ExecutionPolicy {
  return executionPolicySchema.parse({ schemaVersion: "execution_v1", mode: "balanced",
    provider: source.provider, protocol: source.protocol, serviceTier: source.serviceTier,
    apiBaseUrl: source.apiBaseUrl, pluginIdentity: tokenPolicy.amendment.requiredProviderAdapterIdentity,
    requestDefinitionHash: executionRequestBundleHash(), pricingReference: source.pricingReference,
    countChargeStatus: source.countChargeStatus,
    countChargeCeilingMicrodollars: source.countChargeCeilingMicrodollars,
    countVerificationReference: source.countVerificationReference,
    retries: source.retries, tools: source.tools, maxTimeoutSeconds: source.maxTimeoutSeconds,
    models: source.models, tokenPolicy, publications: source.publications });
}

export function realExecutionPolicyFromM4TechnicalProfile(source: M4Policy, tokenPolicy: M4TokenPolicy,
  bindings: ExecutionPolicy["publications"], adapters: {
    textPluginIdentity: string; textPackageSha256: string;
    imagePluginIdentity: string; imagePackageSha256: string;
    executionVersion?: "execution_v1" | "execution_v2";
  }): ExecutionPolicy {
  const version = adapters.executionVersion ?? "execution_v1";
  const requestHash = version === "execution_v2" ? executionV2RequestBundleHash() : realRequestBundleHash();
  return executionPolicySchema.parse({ schemaVersion: version, mode: "real",
    provider: source.provider, protocol: source.protocol, serviceTier: source.serviceTier,
    apiBaseUrl: source.apiBaseUrl, pluginIdentity: adapters.textPluginIdentity,
    requestDefinitionHash: requestHash, pricingReference: source.pricingReference,
    countChargeStatus: source.countChargeStatus,
    countChargeCeilingMicrodollars: source.countChargeCeilingMicrodollars,
    countVerificationReference: source.countVerificationReference,
    retries: source.retries, tools: source.tools, maxTimeoutSeconds: source.maxTimeoutSeconds,
    models: source.models, tokenPolicy, publications: bindings,
    realImage: { adapterIdentity: REAL_IMAGE_ADAPTER_IDENTITY,
      pluginIdentity: adapters.imagePluginIdentity, packageSha256: adapters.imagePackageSha256,
      nativeFileOrigin: "https://dify.uniwares.co.uk", model: REAL_IMAGE_MODEL,
      size: "1024x1024", quality: "high", background: "opaque", outputFormat: "png",
      n: 1, retries: 0, timeoutSeconds: 270, maxReferences: 15,
      planningLiability: "remaining_allowance_hold_v1",
      price: { reference: "https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst",
        inputTextMicrodollarsPerMillion: 5_000_000,
        inputImageMicrodollarsPerMillion: 8_000_000,
        outputImageMicrodollarsPerMillion: 30_000_000 } },
    realReport: { adapterIdentity: REAL_REPORT_ADAPTER_IDENTITY,
      packageSha256: adapters.textPackageSha256, requestDefinitionHash: requestHash } });
}

export function executionTextModel(policy: ExecutionPolicy, bucket: keyof ExecutionPolicy["models"], role: ExperimentOperationDocument["role"]) {
  return policy.schemaVersion === "execution_v2" && role === "manager"
    ? { ...policy.models[bucket], maxOutputTokens: 4096 } : policy.models[bucket];
}

export function executionMaximumTextCharge(policy: ExecutionPolicy, bucket: keyof ExecutionPolicy["models"], role: ExperimentOperationDocument["role"]): number {
  const model = executionTextModel(policy, bucket, role);
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
