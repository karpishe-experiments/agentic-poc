import { createHash } from "node:crypto";
import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";

export const pageImageRevisionSchema = z.strictObject({
  decisionId: opaqueIdSchema,
  previousPageVersionId: opaqueIdSchema,
  instruction: z.string().trim().min(1).max(16_000),
});
export const pageImageRevisionsSchema = z.array(pageImageRevisionSchema).min(1).max(2)
  .refine((items) => new Set(items.map((item) => item.decisionId)).size === items.length &&
    new Set(items.map((item) => item.previousPageVersionId)).size === items.length, "Revision identities must be unique");

export const experimentImageRequestSchema = z.strictObject({
  kind: z.enum(["style_preview", "reference", "page_source"]),
  prompt: z.string().min(1).max(16_000),
  sourceVersionIds: z.array(opaqueIdSchema).min(1).max(50)
    .refine((ids) => new Set(ids).size === ids.length, "Sources must be unique"),
  styleVersionId: opaqueIdSchema.nullable(),
  revisions: pageImageRevisionsSchema.optional(),
}).refine((request) => request.styleVersionId === null || request.sourceVersionIds.includes(request.styleVersionId), "Style must be a source")
  .refine((request) => request.revisions === undefined || request.kind === "page_source", "Only page images support these revisions");

export type ExperimentImageRequest = z.infer<typeof experimentImageRequestSchema>;

export function imageRequestFingerprint(request: ExperimentImageRequest): string {
  const parsed = experimentImageRequestSchema.parse(request);
  return createHash("sha256").update(JSON.stringify({
    kind: parsed.kind, prompt: parsed.prompt,
    sourceVersionIds: parsed.sourceVersionIds, styleVersionId: parsed.styleVersionId,
    ...(parsed.revisions ? { revisions: parsed.revisions } : {}),
  })).digest("hex");
}
