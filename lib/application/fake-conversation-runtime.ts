import { SCHEMA_VERSION } from "@/lib/contracts/common";
import type { GenUICard } from "@/lib/contracts/cards";

export type FakeConversationResult = { narration: string; card: GenUICard };

export function createFakeConversationResult(input: { bookletId: string; cardId: string; idea: string }): FakeConversationResult {
  return {
    narration: "I’ll shape this around the idea you shared. First, let’s choose the reading audience.",
    card: {
      schemaVersion: SCHEMA_VERSION,
      cardId: input.cardId,
      family: "question",
      variant: "single_select",
      status: "active",
      title: "Who is this story for?",
      explanation: "A reading age helps set the language, page count, and story rhythm.",
      allowedActions: ["submit"],
      payload: {
        prompt: `Which age band best fits “${input.idea.slice(0, 120)}”?`,
        choices: [
          { id: "3-5", label: "Ages 3–5", description: "Short, gentle language and a simple arc." },
          { id: "6-8", label: "Ages 6–8", description: "A playful story with a little more adventure." },
          { id: "9-12", label: "Ages 9–12", description: "A richer plot and more emotional detail." },
        ],
        recommendedChoiceId: "6-8",
      },
    },
  };
}
