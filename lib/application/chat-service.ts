import { randomUUID } from "node:crypto";
import { validateUIMessages } from "ai";
import { createRepositories, type Repositories } from "@/db/repositories";
import { RecoverableApplicationError } from "@/lib/application/application-error";
import { createDatabase, type Database } from "@/db/client";
import { BookletNotFoundError } from "@/lib/application/booklet-service";
import { createFakeConversationResult } from "@/lib/application/fake-conversation-runtime";
import { bookletMessageMetadataSchema, bookletUIMessageDataSchemas, type BookletUIMessage } from "@/lib/contracts/messages";

export type ChatTurn = { userMessage: BookletUIMessage; assistantMessage: BookletUIMessage };

export class ChatService {
  private readonly repositories: Repositories;

  public constructor(dependencies: { database?: Database; repositories?: Repositories } = {}) {
    const database = dependencies.database ?? createDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
  }

  public async createFakeTurn(bookletId: string, input: unknown): Promise<ChatTurn> {
    const [message] = await validateUIMessages<BookletUIMessage>({
      messages: [input],
      metadataSchema: bookletMessageMetadataSchema,
      dataSchemas: bookletUIMessageDataSchemas,
    });
    if (!message || message.role !== "user") throw new RecoverableApplicationError({ code: "invalid_chat_message", message: "Send one text message at a time.", status: 400 });
    if (!await this.repositories.booklets.get(bookletId)) throw new BookletNotFoundError(bookletId);

    const text = message.parts.find((part) => part.type === "text")?.text?.trim();
    if (!text) throw new RecoverableApplicationError({ code: "invalid_chat_message", message: "Add a message before sending it.", status: 400 });
    const previousMessages = await this.repositories.conversation.listMessages(bookletId);
    const responseId = message.metadata?.responseId;
    let claimedResponseId: string | null = null;
    let authoritativeText = text;

    if (responseId) {
      const claim = await this.repositories.conversation.claimCardFollowup({ bookletId, responseId });
      if (claim.status === "missing") {
        throw new RecoverableApplicationError({ code: "card_response_not_found", message: "That saved decision is no longer available. Please reopen the card and try again.", status: 409 });
      }
      if (claim.status === "running") {
        throw new RecoverableApplicationError({ code: "card_followup_running", message: "That decision is still being processed. Please try again in a moment.", status: 409 });
      }
      if (claim.status === "completed") {
        const [assistantMessage] = await validateUIMessages<BookletUIMessage>({
          messages: [claim.assistantMessage],
          metadataSchema: bookletMessageMetadataSchema,
          dataSchemas: bookletUIMessageDataSchemas,
        });
        if (!assistantMessage || assistantMessage.role !== "assistant") throw new Error("Saved assistant follow-up is invalid.");
        return { userMessage: message, assistantMessage };
      }
      claimedResponseId = responseId;
      authoritativeText = claim.summary;
    } else if (await this.repositories.conversation.getActiveCard(bookletId)) {
      throw new RecoverableApplicationError({ code: "active_card_required", message: "Respond to the active card before starting a different request.", status: 409 });
    }

    const originalIdea = previousMessages
      .flatMap((persisted) => {
        const saved = persisted.message;
        return saved && typeof saved === "object" && "parts" in saved && Array.isArray(saved.parts)
          ? saved.parts.filter((part): part is { type: "text"; text: string } => Boolean(part) && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string").map((part) => part.text)
          : [];
      })
      .find(Boolean) ?? authoritativeText;
    const now = Date.now();
    const persistedUserMessage: BookletUIMessage = {
      ...message,
      metadata: {
        schemaVersion: "1",
        bookletId,
        responseId: responseId ?? undefined,
        persistedAt: new Date(now).toISOString(),
      },
      parts: [{ type: "text", text: authoritativeText }],
    };
    try {
      await this.repositories.conversation.appendMessage({ id: persistedUserMessage.id, bookletId, role: "user", message: persistedUserMessage, createdAtMs: now });
      const result = createFakeConversationResult({ bookletId, cardId: randomUUID(), idea: originalIdea });
      const assistantMessageId = randomUUID();
      await this.repositories.conversation.persistAssistantCard({
        bookletId,
        messageId: assistantMessageId,
        narration: result.narration,
        card: result.card,
        createdAtMs: now,
      });
      if (claimedResponseId) await this.repositories.conversation.completeCardFollowup({ responseId: claimedResponseId, assistantMessageId });
      return {
        userMessage: persistedUserMessage,
        assistantMessage: {
          id: assistantMessageId,
          role: "assistant",
          metadata: { schemaVersion: "1", bookletId, persistedAt: new Date(now).toISOString() },
          parts: [{ type: "text", text: result.narration }, { type: "data-card", id: result.card.cardId, data: result.card }],
        },
      };
    } catch (error) {
      if (claimedResponseId) await this.repositories.conversation.resetRunningCardFollowup(claimedResponseId);
      throw error;
    }
  }
}

export function getChatService(): ChatService {
  return new ChatService();
}
