import { randomUUID } from "node:crypto";
import { z } from "zod";
import { storyPlanSchema } from "@/lib/contracts/artifacts";
import { qualityReviewSchema } from "@/lib/contracts/quality";
import type { SkillContext } from "@/lib/contracts/skills";

export const storyQualityInputSchema = z.object({
  intent: z.string().trim().min(1).max(5_000),
  storyPlan: storyPlanSchema,
});

export const storyQualityResultSchema = z.object({
  review: qualityReviewSchema,
  repairedStory: storyPlanSchema.nullable(),
  forceValidationFailure: z.boolean(),
});

export async function reviewAndRepairStory(input: z.infer<typeof storyQualityInputSchema>, context: SkillContext) {
  void context;
  const parsed = storyQualityInputSchema.parse(input);
  const missing: Array<{ target: string; message: string; suggestedRepair: string }> = [];
  if (!parsed.storyPlan.characters.length) missing.push({ target: "characters", message: "The plan needs a central character for continuity.", suggestedRepair: "Add one continuity-relevant hero." });
  if (!parsed.storyPlan.settings.length) missing.push({ target: "settings", message: "The plan needs a main setting for continuity.", suggestedRepair: "Add one continuity-relevant location." });
  if (!parsed.storyPlan.continuityConstraints.length) missing.push({ target: "continuityConstraints", message: "The plan needs an explicit visual continuity constraint.", suggestedRepair: "Add one durable visual constraint." });
  const forceValidationFailure = /\[force-validation-failure\]/i.test(parsed.intent);

  if (!missing.length && !forceValidationFailure) {
    return storyQualityResultSchema.parse({
      review: { gate: "story_readiness", attempt: 1, status: "passed", issues: [] },
      repairedStory: null,
      forceValidationFailure: false,
    });
  }

  const repairedStory = {
    ...parsed.storyPlan,
    characters: parsed.storyPlan.characters.length ? parsed.storyPlan.characters : [{
      entityId: randomUUID(), name: "The young hero", narrativeRole: "hero", goal: "Help a friend solve a gentle problem.", relationships: [], named: false, continuityRelevant: true, recurringVisualSubject: true,
    }],
    settings: parsed.storyPlan.settings.length ? parsed.storyPlan.settings : [{
      entityId: randomUUID(), name: "A welcoming story place", narrativeRole: "main setting", named: false, continuityRelevant: true, recurringVisualSubject: true,
    }],
    continuityConstraints: parsed.storyPlan.continuityConstraints.length ? parsed.storyPlan.continuityConstraints : ["Keep the visual world calm and consistent."],
  };
  return storyQualityResultSchema.parse({
    review: {
      gate: "story_readiness",
      attempt: 1,
      status: "repair_needed",
      issues: missing.map((issue) => ({ id: randomUUID(), severity: "major", ...issue })),
    },
    repairedStory,
    forceValidationFailure,
  });
}
