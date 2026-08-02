import { z } from "zod";
import { genUICardSchema } from "@/lib/contracts/cards";
import { storyPlanSchema } from "@/lib/contracts/artifacts";
import { qualityReviewSchema } from "@/lib/contracts/quality";
import { artifactTypeSchema } from "@/lib/contracts/domain";

export const skillIdSchema = z.enum([
  "intake_readiness@1",
  "story_planning_revision@1",
  "quality_review_targeted_repair@1",
  "visual_direction_reference_planning@1",
  "image_prompt_compilation@1",
  "booklet_specification@1",
  "page_planning_writing@1",
]);

export const skillContextSchema = z.object({
  bookletId: z.string().uuid(),
  stage: artifactTypeSchema,
  operation: z.string().min(1),
  intent: z.string().min(1).max(5_000),
  knownFacts: z.array(z.string()),
  recentMessages: z.array(z.string()).max(20),
  approvedArtifactVersionIds: z.array(z.string().uuid()),
  // Application UUIDs and SDK-generated provider trace IDs are both valid
  // opaque correlation values; neither needs to be a persistent entity ID.
  traceId: z.string().min(1),
});

export const managerRouteInputSchema = z.object({
  stage: artifactTypeSchema,
  operation: z.string().min(1),
  intent: z.string().min(1).max(5_000),
  availableSkills: z.array(z.object({ id: skillIdSchema, description: z.string().min(1) })).min(1),
});

export const managerRouteResultSchema = z.object({
  skillId: skillIdSchema,
  // The manager only forwards the original intent. A closed object is required
  // by the Agents SDK's strict structured-output converter.
  arguments: z.object({ intent: z.string().min(1).max(5_000) }),
  explanation: z.string().min(1).max(500),
});

export const readinessAssessmentSchema = z.object({
  ready: z.boolean(),
  knownFacts: z.array(z.string()),
  missingInformation: z.array(z.string()),
  highestValueGap: z.string().nullable(),
  questionCard: genUICardSchema.nullable(),
  rationale: z.string().min(1),
});

export const artifactMutationSchema = z.object({
  artifactType: artifactTypeSchema,
  baseVersionId: z.string().uuid().nullable(),
  content: z.unknown(),
  dependencyVersionIds: z.array(z.string().uuid()),
  reviewCard: genUICardSchema,
});

export const storyPlanningInputSchema = z.object({
  intent: z.string().min(1).max(5_000),
  currentStory: storyPlanSchema.nullable(),
});

export const storyQualityInputSchema = z.object({
  intent: z.string().min(1).max(5_000),
  storyPlan: storyPlanSchema,
});

export const storyQualityResultSchema = z.object({
  review: qualityReviewSchema,
  repairedStory: storyPlanSchema.nullable(),
  forceValidationFailure: z.boolean(),
});

export type SkillId = z.infer<typeof skillIdSchema>;
export type SkillContext = z.infer<typeof skillContextSchema>;
export type ManagerRouteInput = z.infer<typeof managerRouteInputSchema>;
export type ManagerRouteResult = z.infer<typeof managerRouteResultSchema>;
export type ReadinessAssessment = z.infer<typeof readinessAssessmentSchema>;
export type ArtifactMutation = z.infer<typeof artifactMutationSchema>;
