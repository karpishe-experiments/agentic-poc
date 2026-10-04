import { createHash } from "node:crypto";
import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";

export const experimentImageRequestSchema = z.strictObject({
  kind: z.enum(["style_preview", "reference", "page_source"]),
  prompt: z.string().min(1).max(16_000),
  sourceVersionIds: z.array(opaqueIdSchema).min(1).max(50)
    .refine((ids) => new Set(ids).size === ids.length, "Sources must be unique"),
  styleVersionId: opaqueIdSchema.nullable(),
}).refine((request) => request.styleVersionId === null || request.sourceVersionIds.includes(request.styleVersionId), "Style must be a source");

export type ExperimentImageRequest = z.infer<typeof experimentImageRequestSchema>;

export function imageRequestFingerprint(request: ExperimentImageRequest): string {
  const parsed = experimentImageRequestSchema.parse(request);
  return createHash("sha256").update(JSON.stringify({
    kind: parsed.kind, prompt: parsed.prompt,
    sourceVersionIds: parsed.sourceVersionIds, styleVersionId: parsed.styleVersionId,
  })).digest("hex");
}
