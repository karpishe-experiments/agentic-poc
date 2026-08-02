import type { UIMessage } from "ai";
import { z } from "zod";
import { opaqueIdSchema, schemaVersionSchema } from "@/lib/contracts/common";
import { genUICardSchema, type GenUICard } from "@/lib/contracts/cards";

export const bookletMessageMetadataSchema = z.object({
  schemaVersion: schemaVersionSchema,
  bookletId: opaqueIdSchema,
  responseId: opaqueIdSchema.optional(),
  persistedAt: z.string().datetime({ offset: true }).optional(),
}).optional();

export const workingStatusSchema = z.object({
  operation: z.string().min(1).max(120),
  label: z.string().min(1).max(240),
  detail: z.string().min(1).max(1_000).optional(),
});

export const bookletUIMessageDataSchemas = {
  card: genUICardSchema,
  workingStatus: workingStatusSchema,
};

export type BookletUIMessage = UIMessage<
  z.infer<typeof bookletMessageMetadataSchema>,
  { card: GenUICard; workingStatus: z.infer<typeof workingStatusSchema> }
>;

export function isPersistableBookletMessage(message: BookletUIMessage): boolean {
  return !message.parts.some((part) => part.type === "data-workingStatus");
}
