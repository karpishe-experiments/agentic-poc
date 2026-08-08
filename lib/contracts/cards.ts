import { z } from "zod";
import { opaqueIdSchema, schemaVersionSchema } from "@/lib/contracts/common";
import { artifactTypeSchema } from "@/lib/contracts/domain";

export const cardStatusSchema = z.enum(["active", "submitted", "superseded", "failed"]);
export const cardActionSchema = z.enum([
  "submit",
  "select",
  "approve_and_continue",
  "request_revision",
  "edit",
  "retry",
  "continue",
  "accept_with_issue",
  "confirm_geometry",
  "start_generation",
  "retry_item",
  "download",
]);

const baseCardSchema = z.object({
  schemaVersion: schemaVersionSchema,
  cardId: opaqueIdSchema,
  status: cardStatusSchema,
  title: z.string().min(1).max(240),
  explanation: z.string().min(1).max(2_000).optional(),
  allowedActions: z.array(cardActionSchema),
});

const choiceSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(240),
  description: z.string().min(1).max(1_000).optional(),
});

const freeTextQuestionCardSchema = baseCardSchema.extend({
  family: z.literal("question"),
  variant: z.literal("free_text"),
  payload: z.object({
    prompt: z.string().min(1).max(1_000),
    placeholder: z.string().min(1).max(500).optional(),
    minimumLength: z.number().int().positive().max(10_000).optional(),
    maximumLength: z.number().int().positive().max(10_000).optional(),
  }).refine(({ minimumLength, maximumLength }) => !minimumLength || !maximumLength || minimumLength <= maximumLength, {
    message: "minimumLength must not exceed maximumLength",
    path: ["minimumLength"],
  }),
});

const selectQuestionCardSchema = baseCardSchema.extend({
  family: z.literal("question"),
  variant: z.union([z.literal("single_select"), z.literal("multi_select")]),
  payload: z.object({
    prompt: z.string().min(1).max(1_000),
    choices: z.array(choiceSchema).min(2).max(12),
    recommendedChoiceId: z.string().min(1).optional(),
  }).superRefine(({ choices, recommendedChoiceId }, context) => {
    if (new Set(choices.map((choice) => choice.id)).size !== choices.length) {
      context.addIssue({ code: "custom", message: "choice IDs must be unique", path: ["choices"] });
    }
    if (recommendedChoiceId && !choices.some((choice) => choice.id === recommendedChoiceId)) {
      context.addIssue({ code: "custom", message: "recommended choice must be one of the card choices", path: ["recommendedChoiceId"] });
    }
  }),
});

const artifactReviewCardSchema = baseCardSchema.extend({
  family: z.literal("artifact_review"),
  variant: z.literal("summary"),
  payload: z.object({
    artifactType: artifactTypeSchema,
    versionId: opaqueIdSchema.nullable(),
    summary: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).min(1).max(16),
    downloadAssetId: opaqueIdSchema.optional(),
  }),
});

const editableFormCardSchema = baseCardSchema.extend({
  family: z.literal("artifact_review"),
  variant: z.literal("editable_form"),
  payload: z.object({
    artifactType: artifactTypeSchema,
    versionId: opaqueIdSchema.nullable(),
    fields: z.array(z.object({
      key: z.string().min(1).max(120),
      label: z.string().min(1).max(240),
      value: z.string().max(5_000),
      multiline: z.boolean().default(false),
    })).min(1).max(20),
  }),
});

const visualGalleryCardSchema = baseCardSchema.extend({
  family: z.literal("artifact_review"),
  variant: z.literal("visual_gallery"),
  payload: z.object({
    artifactType: artifactTypeSchema,
    versionId: opaqueIdSchema.nullable(),
    items: z.array(z.object({
      assetId: opaqueIdSchema,
      label: z.string().min(1).max(240),
      description: z.string().min(1).max(1_000).optional(),
      selected: z.boolean(),
    })).min(1).max(12),
  }),
});

const progressCardSchema = baseCardSchema.extend({
  family: z.literal("progress"),
  variant: z.enum(["artifact_generation", "page_batch", "export"]),
  payload: z.object({
    jobId: opaqueIdSchema.optional(),
    completed: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    currentLabel: z.string().min(1).max(240).optional(),
  }).refine(({ completed, total }) => completed <= total, { message: "completed must not exceed total", path: ["completed"] }),
});

const issueCardSchema = baseCardSchema.extend({
  family: z.literal("issue"),
  variant: z.enum(["quality", "generation_failure", "validation_failure", "recovery"]),
  payload: z.object({
    code: z.string().min(1).max(120),
    summary: z.string().min(1).max(2_000),
    details: z.array(z.string().min(1).max(1_000)).max(12).default([]),
  }),
});

export const genUICardSchema = z.union([
  freeTextQuestionCardSchema,
  selectQuestionCardSchema,
  artifactReviewCardSchema,
  editableFormCardSchema,
  visualGalleryCardSchema,
  progressCardSchema,
  issueCardSchema,
]);

export const cardResponseSchema = z.object({
  cardId: opaqueIdSchema,
  responseId: opaqueIdSchema,
  action: cardActionSchema,
  value: z.unknown().optional(),
  revisionInstruction: z.string().trim().min(1).max(5_000).optional(),
});

export type GenUICard = z.infer<typeof genUICardSchema>;
export type CardResponse = z.infer<typeof cardResponseSchema>;
export type CardAction = z.infer<typeof cardActionSchema>;

export function validateCardResponseValue(card: GenUICard, response: CardResponse): CardResponse {
  if (!card.allowedActions.includes(response.action)) {
    throw new z.ZodError([{ code: "custom", path: ["action"], message: "That action is not available for this card." }]);
  }
  if (response.action === "request_revision") {
    const revisionInstruction = z.string().trim().min(1).max(5_000).parse(response.revisionInstruction);
    if (response.value !== undefined) throw new z.ZodError([{ code: "custom", path: ["value"], message: "A revision request accepts an instruction, not a separate value." }]);
    return { ...response, revisionInstruction };
  }
  if (response.revisionInstruction !== undefined) {
    throw new z.ZodError([{ code: "custom", path: ["revisionInstruction"], message: "Only revision requests accept an instruction." }]);
  }
  if (card.family === "question") {
    if (card.variant === "free_text") {
      const value = z.string().trim()
        .min(card.payload.minimumLength ?? 1)
        .max(card.payload.maximumLength ?? 10_000)
        .parse(response.value);
      return { ...response, value };
    }

    const selectedValues = card.variant === "multi_select"
      ? z.array(z.string()).min(1).parse(response.value)
      : [z.string().parse(response.value)];
    const choices = new Set(card.payload.choices.map((choice) => choice.id));
    if (new Set(selectedValues).size !== selectedValues.length || selectedValues.some((value) => !choices.has(value))) {
      throw new z.ZodError([{ code: "custom", path: ["value"], message: "Choose one of the available options." }]);
    }
    return { ...response, value: card.variant === "multi_select" ? selectedValues : selectedValues[0] };
  }

  if (card.family === "artifact_review" && card.variant === "visual_gallery" && (response.action === "select" || response.action === "approve_and_continue")) {
    if (response.action === "approve_and_continue" && response.value === undefined) return response;
    const values = z.array(z.string().uuid()).min(1).parse(response.value);
    const assets = new Set(card.payload.items.map((item) => item.assetId));
    if (new Set(values).size !== values.length || values.some((value) => !assets.has(value))) {
      throw new z.ZodError([{ code: "custom", path: ["value"], message: "Choose one of the displayed assets." }]);
    }
    return { ...response, value: values };
  }

  if (response.value !== undefined) {
    throw new z.ZodError([{ code: "custom", path: ["value"], message: "This decision does not accept an additional value." }]);
  }
  return response;
}
