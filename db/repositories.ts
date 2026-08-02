import { asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  artifacts,
  assets,
  booklets,
  cards,
  cardResponses,
  exportsTable,
  generationItems,
  generationJobs,
  messages,
  modelCalls,
  qualityReviews,
} from "@/db/schema";
import type { Asset } from "@/lib/contracts/assets";
import type {
  ActiveJobSummary,
  ArtifactSummary,
  ExportSummary,
  PersistedMessage,
} from "@/lib/contracts/booklets";
import { cardResponseSchema, genUICardSchema, validateCardResponseValue, type CardResponse, type GenUICard } from "@/lib/contracts/cards";
import { artifactStateSchema, artifactTypeSchema, bookletLifecycleSchema, type ArtifactType, type Booklet } from "@/lib/contracts/domain";
import { SCHEMA_VERSION } from "@/lib/contracts/common";

const activeJobStatuses = new Set(["pending", "running", "partial"]);

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function updateCardMessageProjection(messageJson: string, cardId: string, status: GenUICard["status"]): string {
  const message = parseJson(messageJson);
  if (!message || typeof message !== "object" || !("parts" in message) || !Array.isArray(message.parts)) {
    throw new Error("Saved card message is not a valid display projection.");
  }

  return JSON.stringify({
    ...message,
    parts: message.parts.map((part) => {
      if (!part || typeof part !== "object" || !("type" in part) || part.type !== "data-card" || !("data" in part)) return part;
      const card = genUICardSchema.parse(part.data);
      return card.cardId === cardId ? { ...part, data: genUICardSchema.parse({ ...card, status }) } : part;
    }),
  });
}

function responseSummary(card: GenUICard, response: CardResponse): string {
  if (response.revisionInstruction) return response.revisionInstruction;
  if (card.family === "question" && card.variant !== "free_text") {
    const selected = Array.isArray(response.value) ? response.value : [response.value];
    const labels = selected.map((value) => card.payload.choices.find((choice) => choice.id === value)?.label ?? String(value));
    return `${card.title}: ${labels.join(", ")}`;
  }
  if (card.family === "question" && typeof response.value === "string") return `${card.title}: ${response.value}`;
  return `${card.title}: ${response.action}`;
}

function toBooklet(row: typeof booklets.$inferSelect): Booklet {
  return {
    id: row.id,
    schemaVersion: SCHEMA_VERSION,
    workingTitle: row.workingTitle,
    lifecycle: bookletLifecycleSchema.parse(row.lifecycle),
    currentStage: artifactTypeSchema.parse(row.currentStage),
    coverAssetId: row.coverAssetId,
    createdAt: iso(row.createdAtMs),
    updatedAt: iso(row.updatedAtMs),
  };
}

function toArtifactSummary(row: typeof artifacts.$inferSelect): ArtifactSummary {
  return {
    id: row.id,
    artifactType: artifactTypeSchema.parse(row.artifactType),
    state: artifactStateSchema.parse(row.state),
    currentVersionId: row.currentVersionId,
    createdAt: iso(row.createdAtMs),
    updatedAt: iso(row.updatedAtMs),
  };
}

function toAsset(row: typeof assets.$inferSelect): Asset {
  return {
    id: row.id,
    bookletId: row.bookletId,
    kind: row.kind as Asset["kind"],
    uri: row.uri,
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    sourceAssetId: row.sourceAssetId,
    metadata: row.metadataJson ? (parseJson(row.metadataJson) as Record<string, unknown>) : null,
    createdAtMs: row.createdAtMs,
  };
}

export type NewBookletState = {
  booklet: { id: string; workingTitle: string; createdAtMs: number };
  artifacts: Array<{ id: string; artifactType: ArtifactType }>;
  initialMessage: { id: string; idea: string };
};

export type BookletRepository = {
  createWithInitialState(input: NewBookletState): Promise<Booklet>;
  list(): Promise<Booklet[]>;
  get(id: string): Promise<Booklet | null>;
  updateDerivedState(input: { id: string; lifecycle: Booklet["lifecycle"]; currentStage: ArtifactType; updatedAtMs: number }): Promise<void>;
};

export type ArtifactRepository = {
  listByBooklet(bookletId: string): Promise<ArtifactSummary[]>;
};

export type ConversationRepository = {
  listMessages(bookletId: string): Promise<PersistedMessage[]>;
  getActiveCard(bookletId: string): Promise<unknown | null>;
  appendMessage(input: { id: string; bookletId: string; role: "user" | "assistant"; message: unknown; createdAtMs: number }): Promise<void>;
  persistAssistantCard(input: { bookletId: string; messageId: string; card: GenUICard; narration: string; createdAtMs: number }): Promise<void>;
  getCard(bookletId: string, cardId: string): Promise<GenUICard | null>;
  submitCardResponse(input: { bookletId: string; response: CardResponse; createdAtMs: number }): Promise<
    | { kind: "saved" | "duplicate"; duplicate: boolean; followupRequired: boolean; summary: string }
    | { kind: "conflict"; duplicate: false; followupRequired: false; summary: string }
  >;
  claimCardFollowup(input: { bookletId: string; responseId: string }): Promise<
    | { status: "claimed"; summary: string }
    | { status: "running"; summary: string }
    | { status: "completed"; summary: string; assistantMessage: unknown }
    | { status: "missing" }
  >;
  completeCardFollowup(input: { responseId: string; assistantMessageId: string }): Promise<void>;
  resetRunningCardFollowup(responseId: string): Promise<void>;
};

export type JobRepository = {
  listActiveByBooklet(bookletId: string): Promise<ActiveJobSummary[]>;
};

export type AssetRepository = {
  get(id: string): Promise<Asset | null>;
};

export type EvidenceRepository = {
  countModelCalls(bookletId: string): Promise<number>;
  countQualityReviews(bookletId: string): Promise<number>;
};

export type ExportRepository = {
  listByBooklet(bookletId: string): Promise<ExportSummary[]>;
};

export type Repositories = {
  booklets: BookletRepository;
  artifacts: ArtifactRepository;
  conversation: ConversationRepository;
  jobs: JobRepository;
  assets: AssetRepository;
  evidence: EvidenceRepository;
  exports: ExportRepository;
};

export function createRepositories(database: Database): Repositories {
  return {
    booklets: {
      async createWithInitialState(input) {
        const { booklet, artifacts: initialArtifacts, initialMessage } = input;
        await database.transaction(async (transaction) => {
          await transaction.insert(booklets).values({
            id: booklet.id,
            schemaVersion: SCHEMA_VERSION,
            workingTitle: booklet.workingTitle,
            lifecycle: "draft",
            currentStage: "audience_profile",
            coverAssetId: null,
            createdAtMs: booklet.createdAtMs,
            updatedAtMs: booklet.createdAtMs,
          });
          await transaction.insert(artifacts).values(initialArtifacts.map((artifact) => ({
            id: artifact.id,
            bookletId: booklet.id,
            artifactType: artifact.artifactType,
            state: "empty",
            currentVersionId: null,
            createdAtMs: booklet.createdAtMs,
            updatedAtMs: booklet.createdAtMs,
          })));
          await transaction.insert(messages).values({
            id: initialMessage.id,
            bookletId: booklet.id,
            sequence: 0,
            role: "user",
            schemaVersion: SCHEMA_VERSION,
            uiMessageJson: JSON.stringify({
              id: initialMessage.id,
              role: "user",
              parts: [{ type: "text", text: initialMessage.idea }],
            }),
            createdAtMs: booklet.createdAtMs,
          });
        });
        return {
          id: booklet.id,
          schemaVersion: SCHEMA_VERSION,
          workingTitle: booklet.workingTitle,
          lifecycle: "draft",
          currentStage: "audience_profile",
          coverAssetId: null,
          createdAt: iso(booklet.createdAtMs),
          updatedAt: iso(booklet.createdAtMs),
        };
      },
      async list() {
        const rows = await database.select().from(booklets).orderBy(desc(booklets.updatedAtMs));
        return rows.map(toBooklet);
      },
      async get(id) {
        const row = await database.select().from(booklets).where(eq(booklets.id, id)).limit(1);
        return row[0] ? toBooklet(row[0]) : null;
      },
      async updateDerivedState(input) {
        await database.update(booklets).set({
          lifecycle: input.lifecycle,
          currentStage: input.currentStage,
          updatedAtMs: input.updatedAtMs,
        }).where(eq(booklets.id, input.id));
      },
    },
    artifacts: {
      async listByBooklet(bookletId) {
        const rows = await database.select().from(artifacts).where(eq(artifacts.bookletId, bookletId));
        return rows.map(toArtifactSummary);
      },
    },
    conversation: {
      async listMessages(bookletId) {
        const rows = await database.select().from(messages)
          .where(eq(messages.bookletId, bookletId))
          .orderBy(asc(messages.sequence));
        return rows.map((row) => ({
          id: row.id,
          role: row.role === "assistant" ? "assistant" : "user",
          sequence: row.sequence,
          message: parseJson(row.uiMessageJson),
          createdAt: iso(row.createdAtMs),
        }));
      },
      async getActiveCard(bookletId) {
        const row = await database.select({ cardJson: cards.cardJson }).from(cards)
          .where(sql`${cards.bookletId} = ${bookletId} and ${cards.status} = 'active'`)
          .orderBy(desc(cards.updatedAtMs))
          .limit(1);
        return row[0] ? parseJson(row[0].cardJson) : null;
      },
      async appendMessage(input) {
        await database.transaction(async (transaction) => {
          const sequenceResult = await transaction.select({ maximum: sql<number>`max(${messages.sequence})` })
            .from(messages).where(eq(messages.bookletId, input.bookletId));
          await transaction.insert(messages).values({
            id: input.id,
            bookletId: input.bookletId,
            sequence: Number(sequenceResult[0]?.maximum ?? -1) + 1,
            role: input.role,
            schemaVersion: SCHEMA_VERSION,
            uiMessageJson: JSON.stringify(input.message),
            createdAtMs: input.createdAtMs,
          }).onConflictDoNothing();
        });
      },
      async persistAssistantCard(input) {
        const persistedCard = genUICardSchema.parse({ ...input.card, status: "active" });
        await database.transaction(async (transaction) => {
          const sequenceResult = await transaction.select({ maximum: sql<number>`max(${messages.sequence})` })
            .from(messages).where(eq(messages.bookletId, input.bookletId));
          const activeCards = await transaction.select().from(cards)
            .where(sql`${cards.bookletId} = ${input.bookletId} and ${cards.status} = 'active'`);
          for (const activeCard of activeCards) {
            const savedCard = genUICardSchema.parse(parseJson(activeCard.cardJson));
            const superseded = genUICardSchema.parse({ ...savedCard, status: "superseded" });
            await transaction.update(cards).set({
              status: "superseded",
              cardJson: JSON.stringify(superseded),
              updatedAtMs: input.createdAtMs,
            }).where(eq(cards.id, activeCard.id));
            if (activeCard.messageId) {
              const message = await transaction.select().from(messages).where(eq(messages.id, activeCard.messageId)).limit(1);
              if (message[0]) {
                await transaction.update(messages).set({
                  uiMessageJson: updateCardMessageProjection(message[0].uiMessageJson, activeCard.id, "superseded"),
                }).where(eq(messages.id, activeCard.messageId));
              }
            }
          }
          await transaction.insert(messages).values({
            id: input.messageId,
            bookletId: input.bookletId,
            sequence: Number(sequenceResult[0]?.maximum ?? -1) + 1,
            role: "assistant",
            schemaVersion: SCHEMA_VERSION,
            uiMessageJson: JSON.stringify({
              id: input.messageId,
              role: "assistant",
              metadata: {
                schemaVersion: SCHEMA_VERSION,
                bookletId: input.bookletId,
                persistedAt: iso(input.createdAtMs),
              },
              parts: [
                { type: "text", text: input.narration },
                { type: "data-card", id: input.card.cardId, data: persistedCard },
              ],
            }),
            createdAtMs: input.createdAtMs,
          });
          await transaction.insert(cards).values({
            id: persistedCard.cardId,
            bookletId: input.bookletId,
            messageId: input.messageId,
            artifactId: null,
            family: persistedCard.family,
            variant: persistedCard.variant,
            status: "active",
            schemaVersion: SCHEMA_VERSION,
            cardJson: JSON.stringify(persistedCard),
            createdAtMs: input.createdAtMs,
            updatedAtMs: input.createdAtMs,
          });
        });
      },
      async getCard(bookletId, cardId) {
        const row = await database.select({ cardJson: cards.cardJson }).from(cards)
          .where(sql`${cards.id} = ${cardId} and ${cards.bookletId} = ${bookletId}`)
          .limit(1);
        return row[0] ? genUICardSchema.parse(parseJson(row[0].cardJson)) : null;
      },
      async submitCardResponse(input) {
        const response = cardResponseSchema.parse(input.response);
        const existing = await database.select().from(cardResponses).where(eq(cardResponses.id, response.responseId)).limit(1);
        if (existing[0]) {
          const existingCard = await database.select({ cardJson: cards.cardJson, bookletId: cards.bookletId }).from(cards)
            .where(eq(cards.id, existing[0].cardId)).limit(1);
          if (!existingCard[0] || existingCard[0].bookletId !== input.bookletId) throw new Error("The requested response does not belong to this booklet.");
          const card = genUICardSchema.parse(parseJson(existingCard[0].cardJson));
          const persistedResponse = cardResponseSchema.parse({
            cardId: existing[0].cardId,
            responseId: existing[0].id,
            action: existing[0].action,
            value: existing[0].valueJson ? parseJson(existing[0].valueJson) : undefined,
            revisionInstruction: existing[0].revisionInstruction ?? undefined,
          });
          return {
            kind: "duplicate" as const,
            duplicate: true,
            followupRequired: existing[0].followupStatus === "pending" || existing[0].followupStatus === "running",
            summary: responseSummary(card, persistedResponse),
          };
        }

        return database.transaction(async (transaction) => {
          const rows = await transaction.select().from(cards)
            .where(sql`${cards.id} = ${response.cardId} and ${cards.bookletId} = ${input.bookletId}`)
            .limit(1);
          const cardRow = rows[0];
          if (!cardRow) throw new Error("The requested card was not found for this booklet.");
          const card = genUICardSchema.parse(parseJson(cardRow.cardJson));
          if (card.status !== "active" || cardRow.status !== "active") {
            return { kind: "conflict" as const, duplicate: false, followupRequired: false, summary: "This decision was already saved. A recovery card is ready." };
          }
          if (!card.allowedActions.includes(response.action)) throw new Error("That action is not available for this card.");
          const validatedResponse = validateCardResponseValue(card, response);

          const submittedCard = genUICardSchema.parse({ ...card, status: "submitted" });
          const summary = responseSummary(card, validatedResponse);
          await transaction.update(cards).set({ status: "submitted", cardJson: JSON.stringify(submittedCard), updatedAtMs: input.createdAtMs })
            .where(eq(cards.id, card.cardId));
          if (cardRow.messageId) {
            const message = await transaction.select().from(messages).where(eq(messages.id, cardRow.messageId)).limit(1);
            if (message[0]) {
              await transaction.update(messages).set({
                uiMessageJson: updateCardMessageProjection(message[0].uiMessageJson, card.cardId, "submitted"),
              }).where(eq(messages.id, cardRow.messageId));
            }
          }
          await transaction.insert(cardResponses).values({
            id: validatedResponse.responseId,
            cardId: validatedResponse.cardId,
            action: validatedResponse.action,
            valueJson: validatedResponse.value === undefined ? null : JSON.stringify(validatedResponse.value),
            revisionInstruction: validatedResponse.revisionInstruction ?? null,
            followupStatus: "pending",
            followupMessageId: null,
            createdAtMs: input.createdAtMs,
          });
          return { kind: "saved" as const, duplicate: false, followupRequired: true, summary };
        });
      },
      async claimCardFollowup(input) {
        const response = await database.select({
          id: cardResponses.id,
          followupStatus: cardResponses.followupStatus,
          followupMessageId: cardResponses.followupMessageId,
          action: cardResponses.action,
          valueJson: cardResponses.valueJson,
          revisionInstruction: cardResponses.revisionInstruction,
          cardJson: cards.cardJson,
          bookletId: cards.bookletId,
        }).from(cardResponses).innerJoin(cards, eq(cardResponses.cardId, cards.id))
          .where(eq(cardResponses.id, input.responseId)).limit(1);
        const row = response[0];
        if (!row || row.bookletId !== input.bookletId) return { status: "missing" as const };
        const card = genUICardSchema.parse(parseJson(row.cardJson));
        const saved = cardResponseSchema.parse({
          cardId: card.cardId,
          responseId: row.id,
          action: row.action,
          value: row.valueJson ? parseJson(row.valueJson) : undefined,
          revisionInstruction: row.revisionInstruction ?? undefined,
        });
        const summary = responseSummary(card, saved);
        if (row.followupStatus === "completed") {
          if (!row.followupMessageId) throw new Error("Completed card follow-up is missing its assistant message.");
          const message = await database.select({ message: messages.uiMessageJson }).from(messages)
            .where(eq(messages.id, row.followupMessageId)).limit(1);
          if (!message[0]) throw new Error("Completed card follow-up message is missing.");
          return { status: "completed" as const, summary, assistantMessage: parseJson(message[0].message) };
        }
        if (row.followupStatus === "running") return { status: "running" as const, summary };
        if (row.followupStatus !== "pending") return { status: "missing" as const };
        const claimed = await database.update(cardResponses).set({ followupStatus: "running" })
          .where(sql`${cardResponses.id} = ${input.responseId} and ${cardResponses.followupStatus} = 'pending'`)
          .returning({ id: cardResponses.id });
        return claimed[0] ? { status: "claimed" as const, summary } : { status: "running" as const, summary };
      },
      async completeCardFollowup(input) {
        await database.update(cardResponses).set({ followupStatus: "completed", followupMessageId: input.assistantMessageId })
          .where(eq(cardResponses.id, input.responseId));
      },
      async resetRunningCardFollowup(responseId) {
        await database.update(cardResponses).set({ followupStatus: "pending" })
          .where(sql`${cardResponses.id} = ${responseId} and ${cardResponses.followupStatus} = 'running'`);
      },
    },
    jobs: {
      async listActiveByBooklet(bookletId) {
        const rows = await database.select().from(generationJobs).where(eq(generationJobs.bookletId, bookletId));
        const active = rows.filter((row) => activeJobStatuses.has(row.status));
        return Promise.all(active.map(async (job) => {
          const counts = await database.select({
            total: sql<number>`count(*)`,
            completed: sql<number>`sum(case when ${generationItems.status} = 'succeeded' then 1 else 0 end)`,
          }).from(generationItems).where(eq(generationItems.jobId, job.id));
          return {
            id: job.id,
            jobType: job.jobType as ActiveJobSummary["jobType"],
            status: job.status as ActiveJobSummary["status"],
            progress: { completed: Number(counts[0]?.completed ?? 0), total: Number(counts[0]?.total ?? 0) },
            updatedAt: iso(job.updatedAtMs),
          };
        }));
      },
    },
    assets: {
      async get(id) {
        const row = await database.select().from(assets).where(eq(assets.id, id)).limit(1);
        return row[0] ? toAsset(row[0]) : null;
      },
    },
    evidence: {
      async countModelCalls(bookletId) {
        const result = await database.select({ count: sql<number>`count(*)` }).from(modelCalls)
          .where(eq(modelCalls.bookletId, bookletId));
        return Number(result[0]?.count ?? 0);
      },
      async countQualityReviews(bookletId) {
        const result = await database.select({ count: sql<number>`count(*)` }).from(qualityReviews)
          .where(eq(qualityReviews.bookletId, bookletId));
        return Number(result[0]?.count ?? 0);
      },
    },
    exports: {
      async listByBooklet(bookletId) {
        const rows = await database.select().from(exportsTable)
          .where(eq(exportsTable.bookletId, bookletId))
          .orderBy(desc(exportsTable.updatedAtMs));
        return rows.map((row) => ({
          id: row.id,
          status: row.status as ExportSummary["status"],
          assetId: row.assetId,
          createdAt: iso(row.createdAtMs),
          updatedAt: iso(row.updatedAtMs),
        }));
      },
    },
  };
}
