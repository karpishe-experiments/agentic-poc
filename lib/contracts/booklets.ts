import { z } from "zod";
import { opaqueIdSchema, schemaVersionSchema, unixMillisecondsSchema, utcIsoTimestampSchema } from "@/lib/contracts/common";
import { artifactStateSchema, artifactTypeSchema, bookletLifecycleSchema } from "@/lib/contracts/domain";

export const bookletSchema = z.object({
  id: opaqueIdSchema,
  schemaVersion: schemaVersionSchema,
  workingTitle: z.string().min(1),
  lifecycle: bookletLifecycleSchema,
  currentStage: artifactTypeSchema,
  coverAssetId: opaqueIdSchema.nullable(),
  createdAt: utcIsoTimestampSchema,
  updatedAt: utcIsoTimestampSchema,
});

export const artifactSummarySchema = z.object({
  id: opaqueIdSchema,
  artifactType: artifactTypeSchema,
  state: artifactStateSchema,
  currentVersionId: opaqueIdSchema.nullable(),
  createdAt: utcIsoTimestampSchema,
  updatedAt: utcIsoTimestampSchema,
});

export const generationProgressSchema = z.object({
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const activeJobSummarySchema = z.object({
  id: opaqueIdSchema,
  jobType: z.enum(["references", "pages", "export"]),
  status: z.enum(["pending", "running", "waiting_for_agents", "waiting_for_selection", "partial", "paused", "succeeded", "failed", "cancelled"]),
  progress: generationProgressSchema,
  updatedAt: utcIsoTimestampSchema,
});

export const homeBookletSchema = bookletSchema.extend({
  generationProgress: generationProgressSchema.nullable(),
});

export const persistedMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  sequence: z.number().int().nonnegative(),
  message: z.unknown(),
  createdAt: utcIsoTimestampSchema,
});

export const exportSummarySchema = z.object({
  id: opaqueIdSchema,
  status: z.enum(["pending", "running", "succeeded", "failed"]),
  assetId: opaqueIdSchema.nullable(),
  createdAt: utcIsoTimestampSchema,
  updatedAt: utcIsoTimestampSchema,
});

export const pendingCardFollowupSchema = z.object({
  responseId: opaqueIdSchema,
  summary: z.string().min(1),
});

export const workspaceSnapshotSchema = z.object({
  booklet: bookletSchema,
  artifacts: z.array(artifactSummarySchema),
  messages: z.array(persistedMessageSchema),
  activeCard: z.unknown().nullable(),
  activeJobs: z.array(activeJobSummarySchema),
  exports: z.array(exportSummarySchema),
  pendingCardFollowup: pendingCardFollowupSchema.nullable(),
});

export const createBookletRequestSchema = z.object({
  idea: z.string().trim().min(1, "Enter a story idea to begin.").max(5_000, "Keep the initial idea under 5,000 characters."),
});

export const timestampedRecordSchema = z.object({
  createdAtMs: unixMillisecondsSchema,
  updatedAtMs: unixMillisecondsSchema,
});

export type BookletSnapshot = z.infer<typeof workspaceSnapshotSchema>;
export type BookletSummary = z.infer<typeof homeBookletSchema>;
export type ArtifactSummary = z.infer<typeof artifactSummarySchema>;
export type ActiveJobSummary = z.infer<typeof activeJobSummarySchema>;
export type PersistedMessage = z.infer<typeof persistedMessageSchema>;
export type ExportSummary = z.infer<typeof exportSummarySchema>;
export type CreateBookletRequest = z.infer<typeof createBookletRequestSchema>;
