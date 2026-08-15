import { z } from "zod";

export const bookletLifecycleSchema = z.enum(["draft", "generating", "ready_for_export", "completed", "failed"]);
export const artifactTypeSchema = z.enum([
  "audience_profile",
  "story_plan",
  "visual_style",
  "visual_bible",
  "booklet_specification",
  "page_plan",
  "final_pages",
  "pdf_export",
]);
export const artifactStateSchema = z.enum(["empty", "generating", "draft", "approved", "needs_review", "failed"]);
export const pageGeometrySchema = z.enum(["landscape_5_4", "portrait_4_5", "square_1_1"]);

export const BOOKLET_ARTIFACT_TYPES = artifactTypeSchema.options;

export type BookletLifecycle = z.infer<typeof bookletLifecycleSchema>;
export type ArtifactType = z.infer<typeof artifactTypeSchema>;
export type ArtifactState = z.infer<typeof artifactStateSchema>;
export type PageGeometry = z.infer<typeof pageGeometrySchema>;

export type Booklet = {
  id: string;
  schemaVersion: "1";
  workingTitle: string;
  lifecycle: BookletLifecycle;
  currentStage: ArtifactType;
  coverAssetId: string | null;
  createdAt: string;
  updatedAt: string;
};
