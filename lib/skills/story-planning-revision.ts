import { z } from "zod";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import { storyPlanSchema } from "@/lib/contracts/artifacts";
import { storyPlanAsExistingChanges, storyPlanDraftSchema } from "@/lib/contracts/drafts";
import type { SkillContext } from "@/lib/contracts/skills";

export const storyPlanningInputSchema = z.object({
  intent: z.string().trim().min(1).max(5_000),
  currentStory: storyPlanSchema.nullable(),
});

export const storyPlanningResultSchema = z.object({
  storyPlan: storyPlanDraftSchema,
  preservedConstraints: z.array(z.string()),
  summary: z.string().min(1),
});

function ageBandFromFacts(facts: string[]) {
  if (facts.some((fact) => /3[-–]5/.test(fact))) return "3–5";
  if (facts.some((fact) => /9[-–]12/.test(fact))) return "9–12";
  return "6–8";
}

export async function planOrReviseStory(input: z.infer<typeof storyPlanningInputSchema>, context: SkillContext) {
  const parsed = storyPlanningInputSchema.parse(input);
  if (parsed.currentStory) {
    return storyPlanningResultSchema.parse({
      storyPlan: {
        ...storyPlanAsExistingChanges(parsed.currentStory),
        storyArc: `${parsed.currentStory.storyArc} Revision request: ${parsed.intent}`,
        continuityConstraints: [...new Set([...parsed.currentStory.continuityConstraints, "Preserve the approved reading age, named subjects, and gentle resolution."])],
      },
      preservedConstraints: parsed.currentStory.continuityConstraints,
      summary: "I revised the Story Plan while retaining its approved audience and continuity constraints.",
    });
  }

  const idea = context.knownFacts.find(Boolean) ?? parsed.intent;
  const ageBand = ageBandFromFacts(context.knownFacts);
  return storyPlanningResultSchema.parse({
    storyPlan: {
      schemaVersion: SCHEMA_VERSION,
      premise: idea,
      theme: "Small acts of care help a community grow.",
      characters: [{
        kind: "new",
        clientKey: "main-character",
        name: "The young hero",
        narrativeRole: "hero",
        goal: "Help a friend solve a gentle problem.",
        relationships: [],
        named: false,
        continuityRelevant: true,
        recurringVisualSubject: true,
      }],
      settings: [{
        kind: "new",
        clientKey: "main-setting",
        name: "A welcoming story place",
        narrativeRole: "main setting",
        named: false,
        continuityRelevant: true,
        recurringVisualSubject: true,
      }],
      storyArc: "The hero notices a problem, tries a kind solution, and shares a hopeful ending.",
      keyEvents: ["A small problem appears.", "The hero asks or offers help.", "The setting feels brighter together."],
      ending: "The friends celebrate a thoughtful solution.",
      ageFitNotes: `Pacing and language are tuned for ages ${ageBand}.`,
      continuityConstraints: ["Keep the visual world calm and consistent."],
    },
    preservedConstraints: [],
    summary: "I drafted a Story Plan from the approved audience profile and the original idea.",
  });
}
