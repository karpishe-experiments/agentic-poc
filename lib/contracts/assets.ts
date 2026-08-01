import { z } from "zod";
import { opaqueIdSchema, unixMillisecondsSchema } from "@/lib/contracts/common";

export const assetKindSchema = z.enum([
  "style_preview",
  "font",
  "reference",
  "page_source",
  "page_composed",
  "pdf_export",
  "evidence",
]);

export const assetSchema = z.object({
  id: opaqueIdSchema,
  bookletId: opaqueIdSchema.nullable(),
  kind: assetKindSchema,
  uri: z.string().min(1).refine((uri) => !uri.startsWith("/") && !uri.split("/").includes(".."), "Asset URI must be a safe relative path"),
  mimeType: z.string().min(1),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  sourceAssetId: opaqueIdSchema.nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAtMs: unixMillisecondsSchema,
});

export type Asset = z.infer<typeof assetSchema>;
