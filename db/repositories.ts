import { asc, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "@/db/client";
import {
  artifacts,
  artifactDependencies,
  artifactVersions,
  approvals,
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
import {
  approvalSchema,
  artifactDetailSchema,
  artifactVersionSchema,
  finalPagesSchema,
  parseArtifactDocument,
  visualBibleSchema,
  type ArtifactApproval,
  type ArtifactDetail,
  type ArtifactVersion,
} from "@/lib/contracts/artifacts";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import { qualityReviewSchema, type QualityReview } from "@/lib/contracts/quality";

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

function unchangedScopedSubjects(artifactType: ArtifactType, previous: unknown, next: unknown): Set<string> {
  if (artifactType === "visual_bible") {
    const previousBible = visualBibleSchema.parse(previous);
    const nextBible = visualBibleSchema.parse(next);
    const previousDefinitions = new Map([...previousBible.characters, ...previousBible.locations].map((definition) => [definition.entityId, JSON.stringify(definition)]));
    return new Set([...nextBible.characters, ...nextBible.locations]
      .filter((definition) => previousDefinitions.get(definition.entityId) === JSON.stringify(definition))
      .map((definition) => definition.entityId));
  }
  if (artifactType === "final_pages") {
    const previousPages = finalPagesSchema.parse(previous);
    const nextPages = finalPagesSchema.parse(next);
    const previousById = new Map(previousPages.pages.map((page) => [page.pageId, JSON.stringify(page)]));
    return new Set(nextPages.pages.filter((page) => previousById.get(page.pageId) === JSON.stringify(page)).map((page) => page.pageId));
  }
  return new Set();
}

function visualBibleDefinitionsUnchanged(previous: unknown, next: unknown): boolean {
  const comparable = (value: unknown) => {
    const bible = visualBibleSchema.parse(value);
    const withoutReference = (definition: { currentReferenceAssetId: string | null }) => ({ ...definition, currentReferenceAssetId: null });
    return JSON.stringify({
      characters: bible.characters.map(withoutReference),
      locations: bible.locations.map(withoutReference),
      styleReferences: bible.styleReferences,
    });
  };
  return comparable(previous) === comparable(next);
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

function toArtifactVersion(row: typeof artifactVersions.$inferSelect, artifactType: ArtifactType): ArtifactVersion {
  return artifactVersionSchema.parse({
    id: row.id,
    artifactId: row.artifactId,
    versionNumber: row.versionNumber,
    schemaVersion: SCHEMA_VERSION,
    content: parseArtifactDocument(artifactType, parseJson(row.contentJson)),
    createdBy: row.createdBy,
    sourceVersionId: row.sourceVersionId,
    createdAt: iso(row.createdAtMs),
  });
}

function toArtifactApproval(row: typeof approvals.$inferSelect): ArtifactApproval {
  return approvalSchema.parse({
    id: row.id,
    artifactVersionId: row.artifactVersionId,
    scope: row.scope,
    subjectKey: row.subjectKey,
    action: row.action,
    origin: row.origin,
    createdAt: iso(row.createdAtMs),
  });
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
  getDetail(bookletId: string, artifactType: ArtifactType): Promise<ArtifactDetail | null>;
  createVersion(input: {
    id: string;
    bookletId: string;
    artifactType: ArtifactType;
    content: unknown;
    dependencyVersionIds: string[];
    createdBy: "agent" | "user_edit" | "repair" | "application";
    createdAtMs: number;
  }): Promise<ArtifactVersion>;
  approve(input: { id: string; bookletId: string; artifactType: ArtifactType; artifactVersionId: string; scope?: "artifact_content" | "reference" | "page" | "artifact"; subjectKey?: string | null; createdAtMs: number }): Promise<void>;
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
  recoverInterruptedFollowups(): Promise<number>;
};

export type JobRepository = {
  listActiveByBooklet(bookletId: string): Promise<ActiveJobSummary[]>;
  getStatus(jobId: string): Promise<{ id: string; bookletId: string; jobType: "references" | "pages" | "export"; status: "pending" | "running" | "partial" | "succeeded" | "failed" | "cancelled"; updatedAt: string; items: Array<{ id: string; itemKey: string; position: number; status: "pending" | "running" | "succeeded" | "failed"; attemptCount: number; error: unknown | null }> } | null>;
  createOrGet(input: { id: string; bookletId: string; jobType: "references" | "pages" | "export"; idempotencyKey: string; input: unknown; items: Array<{ id: string; itemKey: string; position: number; input: unknown }>; createdAtMs: number }): Promise<{ id: string; status: string; reused: boolean }>;
  getItems(jobId: string): Promise<Array<{ id: string; itemKey: string; position: number; status: string; attemptCount: number; input: unknown; result: unknown | null; assetId: string | null; error: unknown | null }>>;
  claimNextPending(jobId: string, startedAtMs: number): Promise<{ id: string; itemKey: string; position: number; attemptCount: number; input: unknown } | null>;
  completeItem(input: { jobId: string; itemId: string; result: unknown; assets: Asset[]; primaryAssetId: string; finishedAtMs: number }): Promise<void>;
  failItem(input: { jobId: string; itemId: string; error: unknown; finishedAtMs: number }): Promise<void>;
  retryItem(jobId: string, itemId: string): Promise<void>;
  recoverInterrupted(): Promise<number>;
  listRunnable(): Promise<Array<{ id: string; bookletId: string; jobType: "references" | "pages" | "export" }>>;
};

export type AssetRepository = {
  get(id: string): Promise<Asset | null>;
  create(asset: Asset): Promise<void>;
  listByBooklet(bookletId: string, kind?: Asset["kind"]): Promise<Asset[]>;
};

export type EvidenceRepository = {
  countModelCalls(bookletId: string): Promise<number>;
  countQualityReviews(bookletId: string): Promise<number>;
  recordModelCall(input: {
    id: string;
    bookletId: string;
    operation: string;
    skillId: string | null;
    artifactVersionId?: string | null;
    jobId?: string | null;
    provider: string;
    model: string;
    traceId: string | null;
    status: "succeeded" | "failed";
    attempt: number;
    startedAtMs: number;
    latencyMs: number;
    inputReference: unknown;
    outputReference?: unknown;
    usage?: { inputTokens: number; outputTokens: number } | null;
    providerRequestId?: string | null;
    actualCostUsd?: string | null;
    estimatedCostUsd?: string | null;
    pricingVersion?: string | null;
    errorMessage?: string;
    errorKind?: string | null;
  }): Promise<void>;
  recordQualityReview(input: {
    id: string;
    bookletId: string;
    review: QualityReview;
    artifactVersionIds: string[];
    repairVersionIds: string[];
    createdAtMs: number;
  }): Promise<void>;
  acceptLatestUnresolvedQualityReview(bookletId: string, acceptedAtMs: number): Promise<boolean>;
  listModelCalls(bookletId: string): Promise<Array<{ operation: string; skillId: string | null; artifactVersionId: string | null; jobId: string | null; provider: string; model: string; traceId: string | null; providerRequestId: string | null; status: string; attempt: number; latencyMs: number; usage: unknown | null; actualCostUsd: string | null; estimatedCostUsd: string | null; pricingVersion: string | null; errorKind: string | null }>>;
};

export type ExportRepository = {
  listByBooklet(bookletId: string): Promise<ExportSummary[]>;
  create(input: { id: string; bookletId: string; artifactVersionId: string; pageAssetIds: string[]; createdAtMs: number }): Promise<void>;
  complete(input: { id: string; assetId: string; preflight: unknown; updatedAtMs: number }): Promise<void>;
  fail(input: { id: string; error: unknown; updatedAtMs: number }): Promise<void>;
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
      async getDetail(bookletId, artifactType) {
        const artifact = await database.select().from(artifacts)
          .where(sql`${artifacts.bookletId} = ${bookletId} and ${artifacts.artifactType} = ${artifactType}`)
          .limit(1);
        const row = artifact[0];
        if (!row) return null;
        const versions = await database.select().from(artifactVersions)
          .where(eq(artifactVersions.artifactId, row.id))
          .orderBy(desc(artifactVersions.versionNumber));
        const versionIds = versions.map((version) => version.id);
        const approvalRows = versionIds.length === 0
          ? []
          : (await Promise.all(versionIds.map((id) => database.select().from(approvals).where(eq(approvals.artifactVersionId, id))))).flat();
        const history = versions.map((version) => toArtifactVersion(version, artifactType));
        const currentVersion = row.currentVersionId ? history.find((version) => version.id === row.currentVersionId) ?? null : null;
        return artifactDetailSchema.parse({
          artifactType,
          state: artifactStateSchema.parse(row.state),
          currentVersion,
          history,
          approvals: approvalRows.map(toArtifactApproval),
        });
      },
      async createVersion(input) {
        const content = parseArtifactDocument(input.artifactType, input.content);
        return database.transaction(async (transaction) => {
          const artifactRows = await transaction.select().from(artifacts)
            .where(sql`${artifacts.bookletId} = ${input.bookletId} and ${artifacts.artifactType} = ${input.artifactType}`)
            .limit(1);
          const artifact = artifactRows[0];
          if (!artifact) throw new Error(`The ${input.artifactType} artifact was not found.`);
          const currentVersionId = artifact.currentVersionId;
          const maximum = await transaction.select({ value: sql<number>`max(${artifactVersions.versionNumber})` })
            .from(artifactVersions).where(eq(artifactVersions.artifactId, artifact.id));
          const versionNumber = Number(maximum[0]?.value ?? 0) + 1;
          await transaction.insert(artifactVersions).values({
            id: input.id,
            artifactId: artifact.id,
            versionNumber,
            schemaVersion: SCHEMA_VERSION,
            contentJson: JSON.stringify(content),
            createdBy: input.createdBy,
            sourceVersionId: currentVersionId,
            createdAtMs: input.createdAtMs,
          });
          if (input.dependencyVersionIds.length) {
            await transaction.insert(artifactDependencies).values(input.dependencyVersionIds.map((upstreamVersionId, index) => ({
              id: `${input.id}:dependency:${index}`,
              downstreamVersionId: input.id,
              upstreamVersionId,
              createdAtMs: input.createdAtMs,
            })));
          }
          if (currentVersionId) {
            const previousVersion = await transaction.select().from(artifactVersions).where(eq(artifactVersions.id, currentVersionId)).limit(1);
            if (previousVersion[0]) {
              const previousContent = parseJson(previousVersion[0].contentJson);
              const retainedSubjects = unchangedScopedSubjects(input.artifactType, previousContent, content);
              const carryVisualBibleContent = input.artifactType === "visual_bible" && visualBibleDefinitionsUnchanged(previousContent, content);
              const previousApprovals = await transaction.select().from(approvals).where(eq(approvals.artifactVersionId, currentVersionId));
              const carried = previousApprovals.filter((approval) =>
                (approval.scope !== "artifact" && approval.subjectKey && retainedSubjects.has(approval.subjectKey))
                || (carryVisualBibleContent && approval.scope === "artifact_content"),
              );
              if (carried.length) {
                await transaction.insert(approvals).values(carried.map((approval) => ({
                  id: randomUUID(),
                  bookletId: input.bookletId,
                  artifactVersionId: input.id,
                  scope: approval.scope,
                  subjectKey: approval.subjectKey,
                  action: approval.action,
                  origin: "carried_forward",
                  sourceApprovalId: approval.id,
                  cardResponseId: null,
                  qualityReviewId: null,
                  createdAtMs: input.createdAtMs,
                })));
              }
            }
          }
          await transaction.update(artifacts).set({ currentVersionId: input.id, state: "draft", updatedAtMs: input.createdAtMs })
            .where(eq(artifacts.id, artifact.id));

          if (currentVersionId) {
            const pendingVersionIds = [currentVersionId];
            const invalidatedArtifactIds = new Set<string>();
            while (pendingVersionIds.length) {
              const upstreamVersionId = pendingVersionIds.shift();
              if (!upstreamVersionId) continue;
              const dependencies = await transaction.select({ downstreamVersionId: artifactDependencies.downstreamVersionId })
                .from(artifactDependencies).where(eq(artifactDependencies.upstreamVersionId, upstreamVersionId));
              for (const dependency of dependencies) {
                const downstreamVersion = await transaction.select().from(artifactVersions)
                  .where(eq(artifactVersions.id, dependency.downstreamVersionId)).limit(1);
                const downstreamArtifact = downstreamVersion[0]
                  ? (await transaction.select().from(artifacts).where(eq(artifacts.id, downstreamVersion[0].artifactId)).limit(1))[0]
                  : null;
                if (!downstreamVersion[0] || !downstreamArtifact || downstreamArtifact.currentVersionId !== downstreamVersion[0].id || invalidatedArtifactIds.has(downstreamArtifact.id)) continue;
                invalidatedArtifactIds.add(downstreamArtifact.id);
                await transaction.update(artifacts).set({ state: "needs_review", updatedAtMs: input.createdAtMs })
                  .where(eq(artifacts.id, downstreamArtifact.id));
                pendingVersionIds.push(downstreamVersion[0].id);
              }
            }
          }

          return toArtifactVersion({
            id: input.id,
            artifactId: artifact.id,
            versionNumber,
            schemaVersion: SCHEMA_VERSION,
            contentJson: JSON.stringify(content),
            createdBy: input.createdBy,
            sourceVersionId: currentVersionId,
            createdAtMs: input.createdAtMs,
          }, input.artifactType);
        });
      },
      async approve(input) {
        await database.transaction(async (transaction) => {
          const artifactRows = await transaction.select().from(artifacts)
            .where(sql`${artifacts.bookletId} = ${input.bookletId} and ${artifacts.artifactType} = ${input.artifactType}`)
            .limit(1);
          const artifact = artifactRows[0];
          if (!artifact || artifact.currentVersionId !== input.artifactVersionId) throw new Error("Only the current artifact version can be approved.");
          const scope = input.scope ?? "artifact";
          await transaction.insert(approvals).values({
            id: input.id,
            bookletId: input.bookletId,
            artifactVersionId: input.artifactVersionId,
            scope,
            subjectKey: input.subjectKey ?? null,
            action: "approve",
            origin: "user",
            sourceApprovalId: null,
            cardResponseId: null,
            qualityReviewId: null,
            createdAtMs: input.createdAtMs,
          });
          if (scope === "artifact") {
            await transaction.update(artifacts).set({ state: "approved", updatedAtMs: input.createdAtMs })
              .where(eq(artifacts.id, artifact.id));
          }
        });
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
          const followupRequired = !(card.family === "artifact_review" && validatedResponse.action === "approve_and_continue")
            && !(card.family === "issue" && validatedResponse.action === "accept_with_issue");
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
            followupStatus: followupRequired ? "pending" : "not_required",
            followupMessageId: null,
            createdAtMs: input.createdAtMs,
          });
          return { kind: "saved" as const, duplicate: false, followupRequired, summary };
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
      async recoverInterruptedFollowups() {
        const recovered = await database.update(cardResponses).set({ followupStatus: "pending" })
          .where(eq(cardResponses.followupStatus, "running"))
          .returning({ id: cardResponses.id });
        return recovered.length;
      },
    },
    jobs: {
      async createOrGet(input) {
        return database.transaction(async (transaction) => {
          const existing = await transaction.select({ id: generationJobs.id, status: generationJobs.status }).from(generationJobs)
            .where(eq(generationJobs.idempotencyKey, input.idempotencyKey)).limit(1);
          if (existing[0]) return { ...existing[0], reused: true };
          await transaction.insert(generationJobs).values({
            id: input.id, bookletId: input.bookletId, jobType: input.jobType, status: "pending", idempotencyKey: input.idempotencyKey,
            inputJson: JSON.stringify(input.input), errorJson: null, createdAtMs: input.createdAtMs, startedAtMs: null, finishedAtMs: null, updatedAtMs: input.createdAtMs,
          });
          if (input.items.length) {
            await transaction.insert(generationItems).values(input.items.map((item) => ({
              id: item.id, jobId: input.id, itemKey: item.itemKey, position: item.position, status: "pending", attemptCount: 0,
              inputJson: JSON.stringify(item.input), resultJson: null, assetId: null, errorJson: null, startedAtMs: null, finishedAtMs: null,
            })));
          }
          return { id: input.id, status: "pending", reused: false };
        });
      },
      async getItems(jobId) {
        const rows = await database.select().from(generationItems).where(eq(generationItems.jobId, jobId)).orderBy(asc(generationItems.position));
        return rows.map((item) => ({ id: item.id, itemKey: item.itemKey, position: item.position, status: item.status, attemptCount: item.attemptCount, input: parseJson(item.inputJson), result: item.resultJson ? parseJson(item.resultJson) : null, assetId: item.assetId, error: item.errorJson ? parseJson(item.errorJson) : null }));
      },
      async claimNextPending(jobId, startedAtMs) {
        return database.transaction(async (transaction) => {
          const item = (await transaction.select().from(generationItems)
            .where(sql`${generationItems.jobId} = ${jobId} and ${generationItems.status} = 'pending'`)
            .orderBy(asc(generationItems.position)).limit(1))[0];
          if (!item) return null;
          const claimed = await transaction.update(generationItems).set({ status: "running", attemptCount: item.attemptCount + 1, startedAtMs, finishedAtMs: null })
            .where(sql`${generationItems.id} = ${item.id} and ${generationItems.status} = 'pending'`).returning({ id: generationItems.id });
          if (!claimed[0]) return null;
          await transaction.update(generationJobs).set({ status: "running", startedAtMs, updatedAtMs: startedAtMs }).where(eq(generationJobs.id, jobId));
          return { id: item.id, itemKey: item.itemKey, position: item.position, attemptCount: item.attemptCount + 1, input: parseJson(item.inputJson) };
        });
      },
      async completeItem(input) {
        await database.transaction(async (transaction) => {
          await transaction.insert(assets).values(input.assets.map((asset) => ({
            id: asset.id, bookletId: asset.bookletId, kind: asset.kind, uri: asset.uri, mimeType: asset.mimeType,
            width: asset.width, height: asset.height, sourceAssetId: asset.sourceAssetId, metadataJson: asset.metadata ? JSON.stringify(asset.metadata) : null, createdAtMs: asset.createdAtMs,
          })));
          await transaction.update(generationItems).set({ status: "succeeded", resultJson: JSON.stringify(input.result), assetId: input.primaryAssetId, errorJson: null, finishedAtMs: input.finishedAtMs })
            .where(eq(generationItems.id, input.itemId));
          const remaining = await transaction.select({ count: sql<number>`count(*)` }).from(generationItems)
            .where(sql`${generationItems.jobId} = ${input.jobId} and ${generationItems.status} != 'succeeded'`);
          await transaction.update(generationJobs).set({ status: Number(remaining[0]?.count ?? 0) === 0 ? "succeeded" : "running", finishedAtMs: Number(remaining[0]?.count ?? 0) === 0 ? input.finishedAtMs : null, updatedAtMs: input.finishedAtMs })
            .where(eq(generationJobs.id, input.jobId));
        });
      },
      async failItem(input) {
        await database.transaction(async (transaction) => {
          await transaction.update(generationItems).set({ status: "failed", errorJson: JSON.stringify(input.error), finishedAtMs: input.finishedAtMs }).where(eq(generationItems.id, input.itemId));
          await transaction.update(generationJobs).set({ status: "partial", errorJson: JSON.stringify(input.error), updatedAtMs: input.finishedAtMs }).where(eq(generationJobs.id, input.jobId));
        });
      },
      async retryItem(jobId, itemId) {
        await database.transaction(async (transaction) => {
          await transaction.update(generationItems).set({ status: "pending", errorJson: null, finishedAtMs: null }).where(sql`${generationItems.id} = ${itemId} and ${generationItems.jobId} = ${jobId} and ${generationItems.status} = 'failed'`);
          await transaction.update(generationJobs).set({ status: "pending", errorJson: null, finishedAtMs: null, updatedAtMs: Date.now() }).where(eq(generationJobs.id, jobId));
        });
      },
      async recoverInterrupted() {
        return database.transaction(async (transaction) => {
          const recovered = await transaction.update(generationItems).set({ status: "pending", startedAtMs: null })
            .where(eq(generationItems.status, "running"))
            .returning({ id: generationItems.id });
          await transaction.update(generationJobs).set({ status: "pending", startedAtMs: null, finishedAtMs: null, updatedAtMs: Date.now() })
            .where(eq(generationJobs.status, "running"));
          return recovered.length;
        });
      },
      async listRunnable() {
        const rows = await database.select({ id: generationJobs.id, bookletId: generationJobs.bookletId, jobType: generationJobs.jobType })
          .from(generationJobs)
          .where(sql`${generationJobs.status} in ('pending', 'partial', 'running')`)
          .orderBy(asc(generationJobs.createdAtMs));
        return rows
          .filter((row): row is typeof row & { jobType: "references" | "pages" | "export" } => row.jobType === "references" || row.jobType === "pages" || row.jobType === "export")
          .map((row) => ({ id: row.id, bookletId: row.bookletId, jobType: row.jobType }));
      },
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
      async getStatus(jobId) {
        const job = await database.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
        if (!job[0]) return null;
        const items = await database.select().from(generationItems).where(eq(generationItems.jobId, jobId)).orderBy(asc(generationItems.position));
        const row = job[0];
        if (row.jobType !== "references" && row.jobType !== "pages" && row.jobType !== "export") throw new Error("Unknown generation job type.");
        return {
          id: row.id, bookletId: row.bookletId, jobType: row.jobType, status: row.status as "pending" | "running" | "partial" | "succeeded" | "failed" | "cancelled", updatedAt: iso(row.updatedAtMs),
          items: items.map((item) => ({ id: item.id, itemKey: item.itemKey, position: item.position, status: item.status as "pending" | "running" | "succeeded" | "failed", attemptCount: item.attemptCount, error: item.errorJson ? parseJson(item.errorJson) : null })),
        };
      },
    },
    assets: {
      async get(id) {
        const row = await database.select().from(assets).where(eq(assets.id, id)).limit(1);
        return row[0] ? toAsset(row[0]) : null;
      },
      async create(asset) {
        await database.insert(assets).values({
          id: asset.id, bookletId: asset.bookletId, kind: asset.kind, uri: asset.uri, mimeType: asset.mimeType, width: asset.width, height: asset.height,
          sourceAssetId: asset.sourceAssetId, metadataJson: asset.metadata ? JSON.stringify(asset.metadata) : null, createdAtMs: asset.createdAtMs,
        });
      },
      async listByBooklet(bookletId, kind) {
        const rows = await database.select().from(assets).where(kind ? sql`${assets.bookletId} = ${bookletId} and ${assets.kind} = ${kind}` : eq(assets.bookletId, bookletId)).orderBy(desc(assets.createdAtMs));
        return rows.map(toAsset);
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
      async recordModelCall(input) {
        await database.insert(modelCalls).values({
          id: input.id,
          bookletId: input.bookletId,
          operation: input.operation,
          skillId: input.skillId,
          artifactVersionId: input.artifactVersionId ?? null,
          jobId: input.jobId ?? null,
          provider: input.provider,
          model: input.model,
          traceId: input.traceId,
          providerRequestId: input.providerRequestId ?? null,
          status: input.status,
          attempt: input.attempt,
          startedAtMs: input.startedAtMs,
          latencyMs: input.latencyMs,
          inputRefJson: JSON.stringify(input.inputReference),
          outputRefJson: input.outputReference === undefined ? null : JSON.stringify(input.outputReference),
          usageJson: input.usage ? JSON.stringify(input.usage) : null,
          actualCostUsd: input.actualCostUsd ?? null,
          estimatedCostUsd: input.estimatedCostUsd ?? null,
          pricingVersion: input.pricingVersion ?? null,
          errorKind: input.status === "failed" ? input.errorKind ?? "validation" : null,
          errorMessage: input.errorMessage ?? null,
        });
      },
      async recordQualityReview(input) {
        const review = qualityReviewSchema.parse(input.review);
        await database.insert(qualityReviews).values({
          id: input.id,
          bookletId: input.bookletId,
          gate: review.gate,
          attempt: review.attempt,
          status: review.status,
          artifactVersionIdsJson: JSON.stringify(input.artifactVersionIds),
          issuesJson: JSON.stringify(review.issues),
          repairVersionIdsJson: input.repairVersionIds.length ? JSON.stringify(input.repairVersionIds) : null,
          acceptedAtMs: null,
          createdAtMs: input.createdAtMs,
        });
      },
      async acceptLatestUnresolvedQualityReview(bookletId, acceptedAtMs) {
        const review = await database.select({ id: qualityReviews.id }).from(qualityReviews)
          .where(sql`${qualityReviews.bookletId} = ${bookletId} and ${qualityReviews.status} = 'unresolved' and ${qualityReviews.acceptedAtMs} is null`)
          .orderBy(desc(qualityReviews.createdAtMs)).limit(1);
        if (!review[0]) return false;
        await database.update(qualityReviews).set({ acceptedAtMs }).where(eq(qualityReviews.id, review[0].id));
        return true;
      },
      async listModelCalls(bookletId) {
        const rows = await database.select({ operation: modelCalls.operation, skillId: modelCalls.skillId, artifactVersionId: modelCalls.artifactVersionId, jobId: modelCalls.jobId, provider: modelCalls.provider, model: modelCalls.model, traceId: modelCalls.traceId, providerRequestId: modelCalls.providerRequestId, status: modelCalls.status, attempt: modelCalls.attempt, latencyMs: modelCalls.latencyMs, usageJson: modelCalls.usageJson, actualCostUsd: modelCalls.actualCostUsd, estimatedCostUsd: modelCalls.estimatedCostUsd, pricingVersion: modelCalls.pricingVersion, errorKind: modelCalls.errorKind })
          .from(modelCalls).where(eq(modelCalls.bookletId, bookletId)).orderBy(asc(modelCalls.startedAtMs));
        return rows.map((row) => ({ ...row, usage: row.usageJson ? parseJson(row.usageJson) : null }));
      },
    },
    exports: {
      async create(input) {
        await database.insert(exportsTable).values({ id: input.id, bookletId: input.bookletId, artifactVersionId: input.artifactVersionId, status: "running", assetId: null, pageAssetIdsJson: JSON.stringify(input.pageAssetIds), preflightJson: null, errorJson: null, createdAtMs: input.createdAtMs, updatedAtMs: input.createdAtMs });
      },
      async complete(input) {
        await database.update(exportsTable).set({ status: "succeeded", assetId: input.assetId, preflightJson: JSON.stringify(input.preflight), errorJson: null, updatedAtMs: input.updatedAtMs }).where(eq(exportsTable.id, input.id));
      },
      async fail(input) {
        await database.update(exportsTable).set({ status: "failed", errorJson: JSON.stringify(input.error), updatedAtMs: input.updatedAtMs }).where(eq(exportsTable.id, input.id));
      },
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
