import { z } from "zod";

export const SCHEMA_VERSION = "1" as const;

export const schemaVersionSchema = z.literal(SCHEMA_VERSION);
export const opaqueIdSchema = z.string().uuid();
export const utcIsoTimestampSchema = z.string().datetime({ offset: true });
export const unixMillisecondsSchema = z.number().int().nonnegative();

export const normalizedRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1),
  height: z.number().gt(0).max(1),
}).superRefine((rect, context) => {
  if (rect.x + rect.width > 1) {
    context.addIssue({ code: "custom", message: "x + width must not exceed 1", path: ["width"] });
  }
  if (rect.y + rect.height > 1) {
    context.addIssue({ code: "custom", message: "y + height must not exceed 1", path: ["height"] });
  }
});

export type NormalizedRect = z.infer<typeof normalizedRectSchema>;
