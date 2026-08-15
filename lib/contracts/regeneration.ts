import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";

export const regenerationTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("page"), pageId: opaqueIdSchema }),
  z.object({ kind: z.literal("reference"), entityId: opaqueIdSchema }),
  z.object({ kind: z.literal("asset"), assetId: opaqueIdSchema }),
]);

export const regenerationRequestSchema = z.object({
  target: regenerationTargetSchema,
  instruction: z.string().trim().min(1).max(1_000).optional(),
});

export type RegenerationRequest = z.infer<typeof regenerationRequestSchema>;
