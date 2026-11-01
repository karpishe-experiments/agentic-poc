import { createHash } from "node:crypto";
import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { m4CanonicalJson } from "@/lib/experiment-runner/m4-request";

export const REAL_IMAGE_ADAPTER_IDENTITY = "m5-openai-image-bounded@1" as const;
export const REAL_IMAGE_MODEL = "gpt-image-2.5-sunburst-2026-09-08" as const;
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const safeCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveCount = safeCount.positive();
const originalImage = z.strictObject({ assetId: opaqueIdSchema, versionId: opaqueIdSchema,
  sha256: digest, byteLength: positiveCount, mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  width: positiveCount, height: positiveCount });
export const realImageReferenceSchema = originalImage;
const requestBody = z.strictObject({ schemaVersion: z.literal("booklet_real_image_request_v1"),
  operation: z.enum(["generate", "edit"]), prompt: z.string().min(1).max(32_000),
  model: z.literal(REAL_IMAGE_MODEL), size: z.enum(["1024x1024", "1536x1024", "1024x1536"]),
  quality: z.enum(["low", "medium", "high", "xhigh", "max"]),
  background: z.enum(["opaque", "transparent"]), outputFormat: z.enum(["png", "jpeg", "webp"]),
  n: z.literal(1), retries: z.literal(0), timeoutSeconds: positiveCount.max(270),
  deadlineAtMs: positiveCount, references: z.array(originalImage).max(15),
}).superRefine((value, context) => {
  if (value.operation === "generate" && value.references.length !== 0 ||
      value.operation === "edit" && value.references.length === 0 ||
      new Set(value.references.map(item => `${item.assetId}:${item.versionId}`)).size !== value.references.length ||
      value.background === "transparent" && value.outputFormat === "jpeg") {
    context.addIssue({ code: "custom", message: "Real image operation and reference settings differ." });
  }
});
export const realImageRequestSchema = requestBody.safeExtend({ requestDigest: digest });
export type RealImageRequest = z.infer<typeof realImageRequestSchema>;
export function realImageRequest(raw: z.input<typeof requestBody>): RealImageRequest {
  const body = requestBody.parse(raw);
  const requestDigest = createHash("sha256").update(m4CanonicalJson(body)).digest("hex");
  return realImageRequestSchema.parse({ ...body, requestDigest });
}
export function verifyRealImageRequest(raw: unknown): RealImageRequest {
  const parsed = realImageRequestSchema.parse(raw);
  const { requestDigest, ...body } = parsed;
  if (realImageRequest(body).requestDigest !== requestDigest) throw new Error("Real image request digest differs.");
  return parsed;
}

const usage = z.strictObject({ inputTokens: safeCount, outputTokens: safeCount,
  inputTextTokens: safeCount.optional(), inputImageTokens: safeCount.optional(),
  outputTextTokens: safeCount.optional(), outputImageTokens: safeCount.optional() })
  .superRefine((value, context) => {
    if (value.inputTextTokens != null && value.inputTextTokens > value.inputTokens ||
        value.inputImageTokens != null && value.inputImageTokens > value.inputTokens ||
        value.outputTextTokens != null && value.outputTextTokens > value.outputTokens ||
        value.outputImageTokens != null && value.outputImageTokens > value.outputTokens ||
        value.inputTextTokens != null && value.inputImageTokens != null &&
        value.inputTextTokens + value.inputImageTokens > value.inputTokens ||
        value.outputTextTokens != null && value.outputImageTokens != null &&
        value.outputTextTokens + value.outputImageTokens > value.outputTokens) {
      context.addIssue({ code: "custom", message: "Image usage details exceed their reported totals." });
    }
  });
const imageOutput = z.strictObject({ sha256: digest, byteLength: positiveCount,
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]), width: positiveCount, height: positiveCount });
export const realImageResultSchema = z.strictObject({ schemaVersion: z.literal("booklet_real_image_result_v1"),
  requestDigest: digest, adapterIdentity: z.literal(REAL_IMAGE_ADAPTER_IDENTITY),
  dispatchStarted: z.boolean(), requestedModel: z.literal(REAL_IMAGE_MODEL),
  providerModel: z.string().min(1).optional(), providerResponseId: z.string().min(1).optional(),
  providerRequestId: z.string().min(1).optional(),
  diagnostic: z.unknown().optional(),
  status: z.enum(["succeeded", "rejected_pre_provider", "failed_after_provider", "unknown_outcome"]),
  usage: usage.nullable(), output: imageOutput.nullable(),
  failure: z.strictObject({ stage: z.enum(["pre_provider", "provider", "post_provider"]),
    code: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/) }).nullable(),
}).superRefine((value, context) => {
  if (value.status === "succeeded" && (!value.dispatchStarted || !value.output || value.failure) ||
      value.status === "rejected_pre_provider" && (value.dispatchStarted || value.output || !value.failure || value.usage) ||
      value.status === "failed_after_provider" && (!value.dispatchStarted || !value.usage || !value.failure) ||
      value.status === "unknown_outcome" && (!value.dispatchStarted || !value.failure || value.usage)) {
    context.addIssue({ code: "custom", message: "Real image result status and dispatch evidence differ." });
  }
});
export type RealImageResult = z.infer<typeof realImageResultSchema>;

export function realImageCharge(result: RealImageResult, rates: {
  inputTextMicrodollarsPerMillion: number; inputImageMicrodollarsPerMillion: number;
  outputImageMicrodollarsPerMillion: number;
}): { microdollars: number; basis: "reported_categories" | "upper_estimate" } | null {
  if (!result.usage) return result.status === "rejected_pre_provider"
    ? { microdollars: 0, basis: "reported_categories" } : null;
  const usage = result.usage;
  // Unclassified input is rated at the dearer image-input price. The selected
  // model does not bill text output; unclassified output is conservatively
  // rated as image output while retaining the provider's raw split.
  const textInput = usage.inputTextTokens ?? 0;
  const remainingInput = usage.inputTokens - textInput;
  if (remainingInput < 0) throw new Error("Real image usage categories exceed input total.");
  const numerator = BigInt(textInput) * BigInt(rates.inputTextMicrodollarsPerMillion) +
    BigInt(remainingInput) * BigInt(rates.inputImageMicrodollarsPerMillion) +
    BigInt(usage.outputTokens - (usage.outputTextTokens ?? 0)) * BigInt(rates.outputImageMicrodollarsPerMillion);
  const charge = (numerator + 999_999n) / 1_000_000n;
  if (charge > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Real image charge exceeds safe integer storage.");
  return { microdollars: Number(charge), basis: usage.inputTextTokens != null &&
    usage.inputImageTokens != null && usage.inputTextTokens + usage.inputImageTokens === usage.inputTokens &&
    usage.outputImageTokens != null && usage.outputTextTokens != null &&
    usage.outputImageTokens + usage.outputTextTokens === usage.outputTokens
      ? "reported_categories" : "upper_estimate" };
}
