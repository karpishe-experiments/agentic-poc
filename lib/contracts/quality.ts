import { z } from "zod";

export const qualityIssueSchema = z.object({
  id: z.string().uuid(),
  severity: z.enum(["critical", "major", "minor"]),
  target: z.string().min(1),
  message: z.string().min(1),
  suggestedRepair: z.string().min(1),
});

export const qualityReviewSchema = z.object({
  gate: z.enum(["story_readiness", "generation_readiness", "final_page_quality"]),
  attempt: z.number().int().min(1).max(2),
  status: z.enum(["passed", "repair_needed", "unresolved"]),
  issues: z.array(qualityIssueSchema),
});

export type QualityReview = z.infer<typeof qualityReviewSchema>;
