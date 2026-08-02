import { describe, expect, it } from "vitest";
import { cardResponseSchema, genUICardSchema } from "@/lib/contracts/cards";
import {
  createGenerationFailureCard,
  createProgressCard,
  createQualityIssueCard,
  createRecoveryCard,
  createValidationFailureCard,
} from "@/lib/application/card-factories";
import { isPersistableBookletMessage, type BookletUIMessage } from "@/lib/contracts/messages";

const cardId = "00000000-0000-4000-8000-000000000101";

const base = {
  schemaVersion: "1",
  cardId,
  status: "active" as const,
  title: "A decision",
  allowedActions: ["submit"] as const,
};

describe("generative UI contracts", () => {
  it("accepts each finite card family", () => {
    const cards = [
      {
        ...base,
        family: "question",
        variant: "free_text",
        payload: { prompt: "What should the story feel like?" },
      },
      {
        ...base,
        family: "artifact_review",
        variant: "summary",
        payload: {
          artifactType: "audience_profile",
          versionId: null,
          summary: [{ label: "Age", value: "6–8" }],
        },
      },
      {
        ...base,
        family: "progress",
        variant: "page_batch",
        payload: { completed: 1, total: 3, currentLabel: "Painting page 2" },
      },
      {
        ...base,
        family: "issue",
        variant: "recovery",
        payload: { code: "interrupted_turn", summary: "The previous turn stopped before it completed." },
      },
    ];

    cards.forEach((card) => expect(genUICardSchema.safeParse(card).success).toBe(true));
  });

  it("rejects an invalid card payload and an unrecognized action", () => {
    expect(genUICardSchema.safeParse({
      ...base,
      family: "progress",
      variant: "page_batch",
      payload: { completed: 4, total: 3 },
    }).success).toBe(false);

    expect(cardResponseSchema.safeParse({
      cardId,
      responseId: "00000000-0000-4000-8000-000000000102",
      action: "execute_html",
    }).success).toBe(false);
  });

  it("does not permit transient working status to enter persisted history", () => {
    const transient: BookletUIMessage = {
      id: "00000000-0000-4000-8000-000000000103",
      role: "assistant",
      parts: [{ type: "data-workingStatus", data: { operation: "intake", label: "Planning the next question" } }],
    };
    const complete: BookletUIMessage = {
      id: "00000000-0000-4000-8000-000000000104",
      role: "assistant",
      parts: [{ type: "text", text: "I have one focused question." }],
    };

    expect(isPersistableBookletMessage(transient)).toBe(false);
    expect(isPersistableBookletMessage(complete)).toBe(true);
  });

  it("creates only validated application-owned progress and issue cards", () => {
    const cards = [
      createProgressCard({ cardId, title: "Generating pages", variant: "page_batch", completed: 1, total: 3 }),
      createQualityIssueCard({ cardId, title: "Review needed", code: "quality", summary: "One detail needs review." }),
      createGenerationFailureCard({ cardId, title: "Generation paused", code: "temporary", summary: "Try again." }),
      createValidationFailureCard({ cardId, title: "Fix this detail", code: "invalid", summary: "Choose a valid value." }),
      createRecoveryCard({ cardId, title: "Continue saved work", code: "interrupted", summary: "Nothing was lost." }),
    ];

    cards.forEach((card) => expect(genUICardSchema.safeParse(card).success).toBe(true));
  });
});
