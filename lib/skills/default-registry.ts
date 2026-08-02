import { z } from "zod";
import { assessIntake } from "@/lib/skills/intake-readiness";
import { readinessAssessmentSchema } from "@/lib/contracts/skills";
import { SkillRegistry } from "@/lib/skills/registry";
import { planOrReviseStory, storyPlanningInputSchema, storyPlanningResultSchema } from "@/lib/skills/story-planning-revision";
import { reviewAndRepairStory, storyQualityInputSchema, storyQualityResultSchema } from "@/lib/skills/quality-review-repair";
import { planVisualDirection, visualDirectionInputSchema, visualDirectionResultSchema } from "@/lib/skills/visual-direction-reference-planning";
import { recommendBookletSpecification, bookletSpecificationInputSchema, bookletSpecificationResultSchema } from "@/lib/skills/booklet-specification";
import { planAndWritePages, pagePlanningInputSchema, pagePlanningResultSchema } from "@/lib/skills/page-planning-writing";
import { compileImagePrompts, imagePromptCompilationInputSchema, imagePromptCompilationResultSchema } from "@/lib/skills/image-prompt-compilation";

export function createDefaultSkillRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  registry.register({
    id: "image_prompt_compilation@1",
    description: "Compile approved page and reference constraints into deterministic image work or final-page review context.",
    stages: ["final_pages"],
    inputSchema: imagePromptCompilationInputSchema,
    outputSchema: imagePromptCompilationResultSchema,
    run: compileImagePrompts,
  });
  registry.register({
    id: "booklet_specification@1",
    description: "Recommend bounded booklet geometry and page count for the approved story.",
    stages: ["booklet_specification"],
    inputSchema: bookletSpecificationInputSchema,
    outputSchema: bookletSpecificationResultSchema,
    run: recommendBookletSpecification,
  });
  registry.register({
    id: "page_planning_writing@1",
    description: "Create ordered, one-scene page packages from approved booklet constraints.",
    stages: ["page_plan"],
    inputSchema: pagePlanningInputSchema,
    outputSchema: pagePlanningResultSchema,
    run: planAndWritePages,
  });
  registry.register({
    id: "visual_direction_reference_planning@1",
    description: "Choose visual direction and plan canonical references from approved story constraints.",
    stages: ["visual_style", "visual_bible"],
    inputSchema: visualDirectionInputSchema,
    outputSchema: visualDirectionResultSchema,
    run: planVisualDirection,
  });
  registry.register({
    id: "intake_readiness@1",
    description: "Assess known facts and return one high-value intake decision.",
    stages: ["audience_profile"],
    inputSchema: z.object({ cardId: z.string().uuid() }),
    outputSchema: readinessAssessmentSchema,
    run: assessIntake,
  });
  registry.register({
    id: "story_planning_revision@1",
    description: "Draft or revise a Story Plan while preserving approved constraints.",
    stages: ["story_plan"],
    inputSchema: storyPlanningInputSchema,
    outputSchema: storyPlanningResultSchema,
    run: planOrReviseStory,
  });
  registry.register({
    id: "quality_review_targeted_repair@1",
    description: "Review one quality gate and propose at most one targeted repair.",
    stages: ["story_plan", "final_pages", "pdf_export"],
    inputSchema: storyQualityInputSchema,
    outputSchema: storyQualityResultSchema,
    run: reviewAndRepairStory,
  });
  return registry;
}
