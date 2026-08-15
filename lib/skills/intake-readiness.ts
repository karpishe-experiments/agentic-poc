import { SCHEMA_VERSION } from "@/lib/contracts/common";
import { readinessAssessmentSchema, type ReadinessAssessment, type SkillContext } from "@/lib/contracts/skills";

export async function assessIntake(input: { cardId: string }, context: SkillContext): Promise<ReadinessAssessment> {
  const mentionsAge = context.knownFacts.some((fact) => /\b(3[-–]5|6[-–]8|9[-–]12|age)\b/i.test(fact));
  return readinessAssessmentSchema.parse({
    ready: mentionsAge,
    knownFacts: context.knownFacts,
    missingInformation: mentionsAge ? [] : ["reading age"],
    highestValueGap: mentionsAge ? null : "reading age",
    questionCard: mentionsAge ? null : {
      schemaVersion: SCHEMA_VERSION,
      cardId: input.cardId,
      family: "question",
      variant: "single_select",
      status: "active",
      title: "Who is this story for?",
      explanation: "A reading age keeps the language and pacing suitable.",
      allowedActions: ["select", "submit"],
      payload: {
        prompt: "Choose the best reading age.",
        choices: [
          { id: "3-5", label: "Ages 3–5" },
          { id: "6-8", label: "Ages 6–8" },
          { id: "9-12", label: "Ages 9–12" },
        ],
        recommendedChoiceId: "6-8",
      },
    },
    rationale: mentionsAge ? "The age band is known, so intake can prepare a profile." : "Reading age is the highest-value missing fact.",
  });
}
