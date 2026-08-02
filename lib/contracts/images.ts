import { z } from "zod";
import { opaqueIdSchema, schemaVersionSchema } from "@/lib/contracts/common";
import { geometrySchema } from "@/lib/contracts/artifacts";

export const imageOperationSchema = z.enum(["generate", "edit"]);
export const referenceRoleSchema = z.enum(["character_identity", "location_continuity", "style"]);
export const imageErrorKindSchema = z.enum(["transient", "user_correctable", "blocked", "unavailable"]);

export const imageProviderCapabilitiesSchema = z.object({
  provider: z.literal("openai"),
  supportsEdit: z.boolean(),
  maxReferenceImages: z.number().int().positive(),
  supportedSizes: z.array(z.enum(["1024x1024", "1536x1024", "1024x1536"])).min(1),
});

export const imagePromptPlanSchema = z.object({
  purpose: z.string().min(1).max(1_000),
  subject: z.string().min(1).max(500),
  action: z.string().min(1).max(1_000),
  location: z.string().min(1).max(500),
  visualStyle: z.string().min(1).max(2_000),
  continuityConstraints: z.array(z.string().min(1)).max(20),
  textSafeRegion: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).optional(),
  preserve: z.array(z.string().min(1)).max(20),
});

export const imageRequestSchema = z.object({
  schemaVersion: schemaVersionSchema,
  operation: imageOperationSchema,
  model: z.string().min(1),
  promptPlan: imagePromptPlanSchema,
  prompt: z.string().min(1).max(8_000),
  geometry: geometrySchema,
  quality: z.enum(["low", "medium", "high", "balanced"]),
  references: z.array(z.object({ assetId: opaqueIdSchema, role: referenceRoleSchema })).max(8),
  editTargetAssetId: opaqueIdSchema.nullable(),
}).superRefine((request, context) => {
  const hasInputs = request.references.length > 0 || request.editTargetAssetId !== null;
  if (request.operation === "generate" && hasInputs) context.addIssue({ code: "custom", path: ["operation"], message: "Generation cannot include source references or an edit target." });
  if (request.operation === "edit" && !hasInputs) context.addIssue({ code: "custom", path: ["operation"], message: "Editing needs a source reference or edit target." });
});

export const imageResultSchema = z.object({
  status: z.enum(["succeeded", "failed"]),
  provider: z.literal("openai"),
  model: z.string().min(1),
  providerRequestId: z.string().nullable(),
  mimeType: z.literal("image/png").nullable(),
  bytesBase64: z.string().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).nullable(),
  error: z.object({ kind: imageErrorKindSchema, message: z.string().min(1) }).nullable(),
});

export type ImageProviderCapabilities = z.infer<typeof imageProviderCapabilitiesSchema>;
export type ImagePromptPlan = z.infer<typeof imagePromptPlanSchema>;
export type ImageRequest = z.infer<typeof imageRequestSchema>;
export type ImageResult = z.infer<typeof imageResultSchema>;
