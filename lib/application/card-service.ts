import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import { RecoverableApplicationError } from "@/lib/application/application-error";
import { createRecoveryCard } from "@/lib/application/card-factories";
import { cardResponseSchema, genUICardSchema } from "@/lib/contracts/cards";

export class CardService {
  private readonly repositories: Repositories;

  public constructor(dependencies: { database?: Database; repositories?: Repositories } = {}) {
    const database = dependencies.database ?? createDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
  }

  public async submit(bookletId: string, input: unknown) {
    const parsed = cardResponseSchema.parse(input);
    const now = Date.now();
    const result = await this.repositories.conversation.submitCardResponse({ bookletId, response: parsed, createdAtMs: now });
    if (result.kind !== "conflict") return result;

    const recoveryCard = createRecoveryCard({
      cardId: randomUUID(),
      title: "Decision already saved",
      explanation: "The earlier response remains in the booklet history.",
      code: "card_already_submitted",
      summary: result.summary,
      details: ["Reopen the previous card if you need to make a different decision."],
    });
    await this.repositories.conversation.persistAssistantCard({
      bookletId,
      messageId: randomUUID(),
      narration: "I kept the first saved decision and added a recovery option.",
      card: recoveryCard,
      createdAtMs: now,
    });
    return { ...result, recoveryCard };
  }

  public async reopen(bookletId: string, cardId: string) {
    const previous = await this.repositories.conversation.getCard(bookletId, cardId);
    if (!previous) throw new RecoverableApplicationError({ code: "card_not_found", message: "This card is no longer available.", status: 404 });
    if (previous.status === "active") throw new RecoverableApplicationError({ code: "card_already_active", message: "This card is already open for a response." });
    const card = genUICardSchema.parse({ ...previous, cardId: randomUUID(), status: "active" });
    await this.repositories.conversation.persistAssistantCard({
      bookletId,
      messageId: randomUUID(),
      narration: `Reopened: ${previous.title}`,
      card,
      createdAtMs: Date.now(),
    });
    return card;
  }
}

export function getCardService(): CardService {
  return new CardService();
}
