import { z } from "zod";

export const DIFY_EXPERIMENT_PROJECT_ID = "booklet-dify-trial" as const;
export const DIFY_EXPERIMENT_SCHEMA_VERSION = "1" as const;
export const DIFY_EXPERIMENT_MAX_IMAGE_ATTEMPTS = 2 as const;

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const difyExperimentPreferencesSchema = z.object({
  age_range: requiredText(40),
  language: requiredText(40),
  visual_style: requiredText(200),
  character: requiredText(500),
}).strict();

export const difyExperimentPanelSchema = z.object({
  number: z.int().min(1).max(3),
  text: requiredText(500),
  scene: requiredText(2_000),
}).strict();

const countWords = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

export const difyExperimentStorySchema = z.object({
  title: requiredText(160),
  storyline: requiredText(2_000),
  character_description: requiredText(2_000),
  panels: z.array(difyExperimentPanelSchema).length(3),
  first_panel_image_prompt: requiredText(4_000),
}).strict().superRefine((story, context) => {
  if (countWords(story.storyline) > 100) context.addIssue({ code: "custom", path: ["storyline"], message: "Storyline must contain at most 100 words." });
  story.panels.forEach((panel, index) => {
    if (panel.number !== index + 1) context.addIssue({ code: "custom", path: ["panels", index, "number"], message: "Panels must be ordered 1, 2, 3." });
    if (countWords(panel.text) > 40) context.addIssue({ code: "custom", path: ["panels", index, "text"], message: "Panel text must contain at most 40 words." });
  });
});

export const difyExperimentActionSchema = z.enum(["create", "resume", "revise"]);
export const difyExperimentImageStatusSchema = z.enum(["generating", "ready", "failed", "unknown"]);
export const difyExperimentStateSchema = z.enum(["draft_needed", "draft_saved", "awaiting_review", "ready_for_image", "generating", "complete", "image_failed"]);
export const difyExperimentAllowedActionSchema = z.enum(["save_story_draft", "request_review", "illustrate_panel"]);

export type DifyExperimentPreferences = z.infer<typeof difyExperimentPreferencesSchema>;
export type DifyExperimentStory = z.infer<typeof difyExperimentStorySchema>;
export type DifyExperimentAction = z.infer<typeof difyExperimentActionSchema>;
export type DifyExperimentImageStatus = z.infer<typeof difyExperimentImageStatusSchema>;

export type DifyExperimentRevision = { revision: number; story: DifyExperimentStory; createdAtMs: number };
export type DifyExperimentFeedback = { text: string; basedOnRevision: number; consumedByRevision: number | null; createdAtMs: number };
export type DifyExperimentImage = {
  id: string; status: DifyExperimentImageStatus; revision: number; attemptCount: number; prompt: string;
  assetPath: string | null; mimeType: string | null; error: string | null; startedAtMs: number; completedAtMs: number | null;
  originatingRunId?: string; workflowRunId?: string; deadlineAtMs?: number; savedDigest?: string;
  failureCategory?: "generation_failed" | "generation_unknown" | "upload_failed";
  completionClaim?: { id: string; deadlineAtMs: number } | null;
};
export type DifyExperimentRun = { id: string; action: DifyExperimentAction; status: "running" | "completed" | "failed" | "unknown"; startedAtMs: number; deadlineAtMs: number; finishedAtMs: number | null; message: string | null; error: string | null; toolCalls: string[]; providerTaskId: string | null; providerConversationId: string | null; providerMessageId: string | null; usage: { inputTokens: number; outputTokens: number } | null };

export const difyExperimentContextSchema = z.object({
  project_id: z.literal(DIFY_EXPERIMENT_PROJECT_ID),
  idea: requiredText(2_000),
  preferences: difyExperimentPreferencesSchema,
  current_revision: z.int().min(0),
  story: difyExperimentStorySchema.nullable(),
  review_revision: z.int().min(1).nullable(),
  approved_revision: z.int().min(1).nullable(),
  pending_feedback: z.array(requiredText(2_000)).max(5),
  image: z.object({
    attempt_id: z.string().uuid(),
    status: difyExperimentImageStatusSchema,
    revision: z.int().min(1),
    attempt_count: z.int().min(1).max(DIFY_EXPERIMENT_MAX_IMAGE_ATTEMPTS),
    prompt: requiredText(4_000),
    asset_path: z.string().nullable(),
    error: z.string().nullable(),
    workflow_run_id: z.string().nullable(),
    completion_in_progress: z.boolean(),
  }).nullable(),
  state: difyExperimentStateSchema,
  allowed_actions: z.array(difyExperimentAllowedActionSchema),
  image_attempt_count: z.int().min(0).max(DIFY_EXPERIMENT_MAX_IMAGE_ATTEMPTS),
  active_run_id: z.string().uuid().nullable(),
}).strict();

export type DifyExperimentContext = z.infer<typeof difyExperimentContextSchema>;
