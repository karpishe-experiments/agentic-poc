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
export const m4GrantSchema = z.strictObject({ campaignId: opaqueIdSchema, reference: z.string().min(1).max(500) });
export type M4Grant = z.infer<typeof m4GrantSchema>;

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
export function m4MaximumCharge(policy: M4Policy, bucket: M4ModelBucket): number {
  const model = policy.models[bucket];
  return Math.ceil((policy.maxInputTokens * model.inputMicrodollarsPerMillion +
    model.maxOutputTokens * model.outputMicrodollarsPerMillion) / 1_000_000) + policy.countChargeCeilingMicrodollars;
}
