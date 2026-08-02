import { z } from "zod";
import { bookletSpecificationSchema, storyPlanSchema } from "@/lib/contracts/artifacts";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import type { SkillContext } from "@/lib/contracts/skills";

export const bookletSpecificationInputSchema = z.object({ intent: z.string().trim().min(1).max(5_000), storyPlan: storyPlanSchema });
export const bookletSpecificationResultSchema = z.object({ content: bookletSpecificationSchema, summary: z.string().min(1) });

export async function recommendBookletSpecification(input: z.infer<typeof bookletSpecificationInputSchema>, context: SkillContext) {
  void context;
  const parsed = bookletSpecificationInputSchema.parse(input);
  const ageFit = parsed.storyPlan.ageFitNotes;
  const recommendation = /9[–-]12/.test(ageFit)
    ? { storyPageCount: 8, geometry: "portrait_4_5" as const, description: "eight-story-page portrait" }
    : /6[–-]8/.test(ageFit)
      ? { storyPageCount: 6, geometry: "landscape_5_4" as const, description: "six-story-page landscape" }
      : { storyPageCount: 3, geometry: "square_1_1" as const, description: "three-story-page square" };
  return bookletSpecificationResultSchema.parse({
    content: {
      schemaVersion: SCHEMA_VERSION,
      title: parsed.storyPlan.premise.slice(0, 120),
      coverDirection: "Show the main character and setting with a welcoming, uncluttered opening image.",
      storyPageCount: recommendation.storyPageCount,
      geometry: recommendation.geometry,
      geometryConfirmed: false,
      typographyTheme: "Warm Nunito display text with short readable paragraphs.",
      dialoguePolicy: "Use short narration rather than speech balloons for this first booklet.",
      castLimitWarningAccepted: true,
      locationLimitWarningAccepted: true,
    },
    summary: `I recommend a ${recommendation.description} booklet for the current story scope.`,
  });
}
