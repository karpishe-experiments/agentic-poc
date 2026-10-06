import { randomUUID } from "node:crypto";
import { MongoServerError } from "mongodb";
import { withMongoTransaction, type Database } from "@/db/client";
import type { ApprovalDocument, ArtifactDocument, ArtifactVersionDocument, AssetDocument, BookletDocument } from "@/db/documents";
import { createAgentRepository, type AgentRepository } from "@/db/agent-repository";
import { createExecutionRepository, type ExecutionRepository } from "@/db/execution-repository";
import type { Asset } from "@/lib/contracts/assets";
import type { ActiveJobSummary, ArtifactSummary, ExportSummary, PersistedMessage } from "@/lib/contracts/booklets";
import { cardResponseSchema, genUICardSchema, validateCardResponseValue, type CardResponse, type GenUICard } from "@/lib/contracts/cards";
import { artifactStateSchema, artifactTypeSchema, bookletLifecycleSchema, type ArtifactType, type Booklet } from "@/lib/contracts/domain";
import { approvalSchema, artifactDetailSchema, artifactVersionSchema, finalPagesSchema, parseArtifactDocument, visualBibleSchema, type ArtifactApproval, type ArtifactDetail, type ArtifactVersion } from "@/lib/contracts/artifacts";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import { qualityReviewSchema, type QualityReview } from "@/lib/contracts/quality";

const activeJobStatuses = new Set(["pending", "running", "partial", "paused", "failed"]);
const iso = (timestamp: number) => new Date(timestamp).toISOString();
const parseJson = (value: string): unknown => JSON.parse(value) as unknown;
const duplicate = (error: unknown) => error instanceof MongoServerError && error.code === 11000;

function replaceCardMessageProjection(messageJson: string, nextCard: GenUICard): string {
  const message = parseJson(messageJson);
  if (!message || typeof message !== "object" || !("parts" in message) || !Array.isArray(message.parts)) throw new Error("Saved card message is not a valid display projection.");
  return JSON.stringify({ ...message, parts: message.parts.map((part) => !part || typeof part !== "object" || !("type" in part) || part.type !== "data-card" || !("data" in part) ? part : genUICardSchema.parse(part.data).cardId === nextCard.cardId ? { ...part, data: nextCard } : part) });
}
function updateCardMessageProjection(messageJson: string, cardId: string, status: GenUICard["status"]): string {
  const message = parseJson(messageJson);
  if (!message || typeof message !== "object" || !("parts" in message) || !Array.isArray(message.parts)) throw new Error("Saved card message is not a valid display projection.");
  return JSON.stringify({ ...message, parts: message.parts.map((part) => {
    if (!part || typeof part !== "object" || !("type" in part) || part.type !== "data-card" || !("data" in part)) return part;
    const card = genUICardSchema.parse(part.data); return card.cardId === cardId ? { ...part, data: genUICardSchema.parse({ ...card, status }) } : part;
  }) });
}
function responseSummary(card: GenUICard, response: CardResponse): string {
  if (response.revisionInstruction) return response.revisionInstruction;
  if (card.family === "question" && card.variant !== "free_text") {
    const selected = Array.isArray(response.value) ? response.value : [response.value];
    return `${card.title}: ${selected.map((value) => card.payload.choices.find((choice) => choice.id === value)?.label ?? String(value)).join(", ")}`;
  }
  if (card.family === "question" && typeof response.value === "string") return `${card.title}: ${response.value}`;
  return `${card.title}: ${response.action}`;
}
function unchangedScopedSubjects(artifactType: ArtifactType, previous: unknown, next: unknown): Set<string> {
  if (artifactType === "visual_bible") {
    const before = visualBibleSchema.parse(previous); const after = visualBibleSchema.parse(next);
    const values = new Map([...before.characters, ...before.locations].map((item) => [item.entityId, JSON.stringify(item)]));
    return new Set([...after.characters, ...after.locations].filter((item) => values.get(item.entityId) === JSON.stringify(item)).map((item) => item.entityId));
  }
  if (artifactType === "final_pages") {
    const before = finalPagesSchema.parse(previous); const after = finalPagesSchema.parse(next);
    const values = new Map(before.pages.map((item) => [item.pageId, JSON.stringify(item)]));
    return new Set(after.pages.filter((item) => values.get(item.pageId) === JSON.stringify(item)).map((item) => item.pageId));
  }
  return new Set();
}
function visualBibleDefinitionsUnchanged(previous: unknown, next: unknown): boolean {
  const comparable = (value: unknown) => { const bible = visualBibleSchema.parse(value); const strip = (item: { currentReferenceAssetId: string | null }) => ({ ...item, currentReferenceAssetId: null }); return JSON.stringify({ characters: bible.characters.map(strip), locations: bible.locations.map(strip), styleReferences: bible.styleReferences }); };
  return comparable(previous) === comparable(next);
}
const toBooklet = (row: BookletDocument): Booklet => ({ id: row._id, schemaVersion: SCHEMA_VERSION, workingTitle: row.workingTitle, lifecycle: bookletLifecycleSchema.parse(row.lifecycle), currentStage: artifactTypeSchema.parse(row.currentStage), coverAssetId: row.coverAssetId, createdAt: iso(row.createdAtMs), updatedAt: iso(row.updatedAtMs) });
const toArtifactSummary = (row: ArtifactDocument): ArtifactSummary => ({ id: row._id, artifactType: artifactTypeSchema.parse(row.artifactType), state: artifactStateSchema.parse(row.state), currentVersionId: row.currentVersionId, createdAt: iso(row.createdAtMs), updatedAt: iso(row.updatedAtMs) });
const toArtifactVersion = (row: ArtifactVersionDocument, type: ArtifactType): ArtifactVersion => artifactVersionSchema.parse({ id: row._id, artifactId: row.artifactId, versionNumber: row.versionNumber, schemaVersion: SCHEMA_VERSION, content: parseArtifactDocument(type, parseJson(row.contentJson)), createdBy: row.createdBy, sourceVersionId: row.sourceVersionId, createdAt: iso(row.createdAtMs) });
const toArtifactApproval = (row: ApprovalDocument): ArtifactApproval => approvalSchema.parse({ id: row._id, artifactVersionId: row.artifactVersionId, scope: row.scope, subjectKey: row.subjectKey, action: row.action, origin: row.origin, createdAt: iso(row.createdAtMs) });
const toAsset = (row: AssetDocument): Asset => ({ id: row._id, bookletId: row.bookletId, kind: row.kind as Asset["kind"], uri: row.uri, mimeType: row.mimeType, width: row.width, height: row.height, sourceAssetId: row.sourceAssetId, metadata: row.metadataJson ? parseJson(row.metadataJson) as Record<string, unknown> : null, createdAtMs: row.createdAtMs });

export type NewBookletState = { booklet: { id: string; workingTitle: string; createdAtMs: number }; artifacts: Array<{ id: string; artifactType: ArtifactType }>; initialMessage: { id: string; idea: string } };
export type BookletRepository = { createWithInitialState(input: NewBookletState): Promise<Booklet>; list(): Promise<Booklet[]>; get(id: string): Promise<Booklet | null>; updateDerivedState(input: { id: string; lifecycle: Booklet["lifecycle"]; currentStage: ArtifactType; updatedAtMs: number }): Promise<void> };
export type ArtifactRepository = { listByBooklet(bookletId: string): Promise<ArtifactSummary[]>; getDetail(bookletId: string, artifactType: ArtifactType): Promise<ArtifactDetail | null>; createVersion(input: { id: string; bookletId: string; artifactType: ArtifactType; content: unknown; dependencyVersionIds: string[]; createdBy: "agent" | "user_edit" | "repair" | "application"; sourceExecutionBatchId?: string | null; createdAtMs: number }): Promise<ArtifactVersion>; approve(input: { id: string; bookletId: string; artifactType: ArtifactType; artifactVersionId: string; scope?: "artifact_content" | "reference" | "page" | "artifact"; subjectKey?: string | null; createdAtMs: number }): Promise<void> };
export type ConversationRepository = { listMessages(bookletId: string): Promise<PersistedMessage[]>; getActiveCard(bookletId: string): Promise<unknown | null>; appendMessage(input: { id: string; bookletId: string; role: "user" | "assistant"; message: unknown; createdAtMs: number }): Promise<void>; persistAssistantCard(input: { bookletId: string; messageId: string; card: GenUICard; narration: string; createdAtMs: number; readyInput?: unknown; readyInputSchemaVersion?: string; readyWorkflowFingerprint?: unknown; readyPreviousBatchId?: string | null }): Promise<void>; getCard(bookletId: string, cardId: string): Promise<GenUICard | null>; getAgentRunReadyInput(bookletId: string, cardId: string): Promise<{ input: unknown; schemaVersion: string; workflowFingerprint: unknown; previousBatchId: string | null } | null>; updateAgentRunProjection(input: { bookletId: string; card: Extract<GenUICard, { family: "agent_run" }>; readyInput?: unknown | null; readyInputSchemaVersion?: string | null; readyWorkflowFingerprint?: unknown | null; readyPreviousBatchId?: string | null; updatedAtMs: number }): Promise<void>; getPendingCardFollowup(bookletId: string): Promise<{ responseId: string; summary: string } | null>; submitCardResponse(input: { bookletId: string; response: CardResponse; createdAtMs: number }): Promise<{ kind: "saved" | "duplicate"; duplicate: boolean; followupRequired: boolean; summary: string } | { kind: "conflict"; duplicate: false; followupRequired: false; summary: string }>; claimCardFollowup(input: { bookletId: string; responseId: string }): Promise<{ status: "claimed" | "running"; summary: string } | { status: "completed"; summary: string; assistantMessage: unknown } | { status: "missing" }>; completeCardFollowup(input: { responseId: string; assistantMessageId: string }): Promise<void>; resetRunningCardFollowup(responseId: string): Promise<void>; recoverInterruptedFollowups(): Promise<number> };
export type JobRepository = { listActiveByBooklet(bookletId: string): Promise<ActiveJobSummary[]>; getStatus(jobId: string): Promise<{ id: string; bookletId: string; jobType: "references" | "pages" | "export"; status: ActiveJobSummary["status"]; updatedAt: string; items: Array<{ id: string; itemKey: string; position: number; status: "pending" | "running" | "waiting_for_agents" | "waiting_for_selection" | "succeeded" | "failed"; attemptCount: number; error: unknown | null }> } | null>; createOrGet(input: { id: string; bookletId: string; jobType: "references" | "pages" | "export"; idempotencyKey: string; input: unknown; items: Array<{ id: string; itemKey: string; position: number; input: unknown }>; createdAtMs: number }): Promise<{ id: string; status: string; reused: boolean }>; getItems(jobId: string): Promise<Array<{ id: string; itemKey: string; position: number; status: string; attemptCount: number; input: unknown; result: unknown | null; assetId: string | null; error: unknown | null }>>; claimNextPending(jobId: string, startedAtMs: number, keepJobPaused?: boolean): Promise<{ id: string; itemKey: string; position: number; attemptCount: number; input: unknown } | null>; completeItem(input: { jobId: string; itemId: string; result: unknown; assets: Asset[]; primaryAssetId: string; finishedAtMs: number; pauseWithPending?: boolean }): Promise<void>; failItem(input: { jobId: string; itemId: string; error: unknown; finishedAtMs: number; haltJob?: boolean }): Promise<void>; resumeForCandidateRetry(jobId: string, itemId: string, now: number): Promise<boolean>; retryItem(jobId: string, itemId: string): Promise<void>; continueJob(jobId: string): Promise<void>; recoverInterrupted(): Promise<number>; listRunnable(): Promise<Array<{ id: string; bookletId: string; jobType: "references" | "pages" | "export" }>> };
export type AssetRepository = { get(id: string): Promise<Asset | null>; create(asset: Asset): Promise<void>; listByBooklet(bookletId: string, kind?: Asset["kind"]): Promise<Asset[]> };
export type EvidenceRepository = { countModelCalls(bookletId: string): Promise<number>; countQualityReviews(bookletId: string): Promise<number>; hasPassedQualityReview(input: { bookletId: string; gate: string; artifactVersionId: string }): Promise<boolean>; recordModelCall(input: { id: string; bookletId: string; operation: string; skillId: string | null; artifactVersionId?: string | null; jobId?: string | null; provider: string; model: string; traceId: string | null; status: "succeeded" | "failed"; attempt: number; startedAtMs: number; latencyMs: number; inputReference: unknown; outputReference?: unknown; usage?: { inputTokens: number; outputTokens: number } | null; providerRequestId?: string | null; actualCostUsd?: string | null; estimatedCostUsd?: string | null; pricingVersion?: string | null; errorMessage?: string; errorKind?: string | null; agentDefinitionId?: string | null; agentVersionId?: string | null; agentConfigSnapshot?: unknown | null; executionBatchId?: string | null; executionItemId?: string | null }): Promise<void>; recordQualityReview(input: { id: string; bookletId: string; review: QualityReview; artifactVersionIds: string[]; repairVersionIds: string[]; createdAtMs: number }): Promise<void>; acceptLatestUnresolvedQualityReview(bookletId: string, acceptedAtMs: number): Promise<boolean>; listModelCalls(bookletId: string): Promise<Array<{ operation: string; skillId: string | null; artifactVersionId: string | null; jobId: string | null; provider: string; model: string; traceId: string | null; providerRequestId: string | null; status: string; attempt: number; latencyMs: number; usage: unknown | null; actualCostUsd: string | null; estimatedCostUsd: string | null; pricingVersion: string | null; errorKind: string | null; agentDefinitionId: string | null; agentVersionId: string | null; agentConfigSnapshot: unknown | null; executionBatchId: string | null; executionItemId: string | null }>> };
export type ExportRepository = { listByBooklet(bookletId: string): Promise<ExportSummary[]>; create(input: { id: string; bookletId: string; artifactVersionId: string; pageAssetIds: string[]; createdAtMs: number }): Promise<void>; complete(input: { id: string; assetId: string; preflight: unknown; updatedAtMs: number }): Promise<void>; fail(input: { id: string; error: unknown; updatedAtMs: number }): Promise<void> };
export type Repositories = { database: Database; booklets: BookletRepository; artifacts: ArtifactRepository; conversation: ConversationRepository; jobs: JobRepository; assets: AssetRepository; evidence: EvidenceRepository; exports: ExportRepository; agents: AgentRepository; execution: ExecutionRepository };

async function retryDuplicate<T>(work: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 0; ; attempt += 1) try { return await work(); } catch (error) { if (!duplicate(error) || attempt >= attempts - 1) throw error; }
}
const assetDocument = (asset: Asset): AssetDocument => ({ _id: asset.id, bookletId: asset.bookletId, kind: asset.kind, uri: asset.uri, mimeType: asset.mimeType, width: asset.width, height: asset.height, sourceAssetId: asset.sourceAssetId, metadataJson: asset.metadata ? JSON.stringify(asset.metadata) : null, createdAtMs: asset.createdAtMs });

export function createRepositories(database: Database): Repositories {
  const c = database.collections;
  const derivedJobStatus = async (rawStatus: string, items: Array<{ status: string; executionCardId?: string | null; executionBatchId?: string | null }>): Promise<ActiveJobSummary["status"]> => {
    if (rawStatus !== "running") return rawStatus as ActiveJobSummary["status"];
    const current = items.find((item) => item.status === "waiting_for_agents" || item.status === "waiting_for_selection");
    if (!current) return "running";
    if (current.status === "waiting_for_selection" && !current.executionBatchId) return "running";
    return current.status as Extract<ActiveJobSummary["status"], "waiting_for_agents" | "waiting_for_selection">;
  };
  const bookletsRepository: BookletRepository = {
    async createWithInitialState(input) {
      await withMongoTransaction(database, async (session) => {
        if (await c.booklets.findOne({ _id: input.booklet.id }, { session })) throw new Error("The booklet already exists.");
        await c.booklets.insertOne({ _id: input.booklet.id, schemaVersion: SCHEMA_VERSION, workingTitle: input.booklet.workingTitle, lifecycle: "draft", currentStage: "audience_profile", coverAssetId: null, createdAtMs: input.booklet.createdAtMs, updatedAtMs: input.booklet.createdAtMs }, { session });
        await c.artifacts.insertMany(input.artifacts.map((artifact) => ({ _id: artifact.id, bookletId: input.booklet.id, artifactType: artifact.artifactType, state: "empty", currentVersionId: null, createdAtMs: input.booklet.createdAtMs, updatedAtMs: input.booklet.createdAtMs })), { session });
        await c.messages.insertOne({ _id: input.initialMessage.id, bookletId: input.booklet.id, sequence: 0, role: "user", schemaVersion: SCHEMA_VERSION, uiMessageJson: JSON.stringify({ id: input.initialMessage.id, role: "user", parts: [{ type: "text", text: input.initialMessage.idea }] }), createdAtMs: input.booklet.createdAtMs }, { session });
      });
      return toBooklet({ _id: input.booklet.id, schemaVersion: SCHEMA_VERSION, workingTitle: input.booklet.workingTitle, lifecycle: "draft", currentStage: "audience_profile", coverAssetId: null, createdAtMs: input.booklet.createdAtMs, updatedAtMs: input.booklet.createdAtMs });
    },
    // The v2 experiment has its own projections; legacy parsers must not interpret it.
    async list() { return (await c.booklets.find({ executionProfile: { $ne: "dify_booklet_v1" } }).sort({ updatedAtMs: -1 }).toArray()).map(toBooklet); },
    async get(id) { const row = await c.booklets.findOne({ _id: id, executionProfile: { $ne: "dify_booklet_v1" } }); return row ? toBooklet(row) : null; },
    async updateDerivedState(input) {
      const result = await c.booklets.updateOne({ _id: input.id, executionProfile: { $ne: "dify_booklet_v1" } }, { $set: { lifecycle: input.lifecycle, currentStage: input.currentStage, updatedAtMs: input.updatedAtMs } });
      if (!result.matchedCount) throw new Error("The booklet was not found.");
    },
  };

  const artifactsRepository: ArtifactRepository = {
    async listByBooklet(bookletId) { return (await c.artifacts.find({ bookletId }).toArray()).map(toArtifactSummary); },
    async getDetail(bookletId, artifactType) {
      const artifact = await c.artifacts.findOne({ bookletId, artifactType }); if (!artifact) return null;
      const rows = await c.artifact_versions.find({ artifactId: artifact._id }).sort({ versionNumber: -1 }).toArray();
      const versionIds = rows.map(({ _id }) => _id); const approvalRows = versionIds.length ? await c.approvals.find({ artifactVersionId: { $in: versionIds } }).toArray() : [];
      const history = rows.map((row) => toArtifactVersion(row, artifactType));
      return artifactDetailSchema.parse({ artifactType, state: artifactStateSchema.parse(artifact.state), currentVersion: artifact.currentVersionId ? history.find(({ id }) => id === artifact.currentVersionId) ?? null : null, history, approvals: approvalRows.map(toArtifactApproval) });
    },
    async createVersion(input) {
      const content = parseArtifactDocument(input.artifactType, input.content);
      return retryDuplicate(() => withMongoTransaction(database, async (session) => {
        const artifact = await c.artifacts.findOne({ bookletId: input.bookletId, artifactType: input.artifactType }, { session });
        if (!artifact) throw new Error(`The ${input.artifactType} artifact was not found.`);
        if (input.sourceExecutionBatchId) {
          const existing = await c.artifact_versions.findOne({ sourceExecutionBatchId: input.sourceExecutionBatchId }, { session });
          if (existing) {
            if (existing.artifactId !== artifact._id) throw new Error("An execution batch cannot materialize more than one artifact target.");
            return toArtifactVersion(existing, input.artifactType);
          }
        }
        if (input.dependencyVersionIds.length) {
          const upstream = await c.artifact_versions.find({ _id: { $in: input.dependencyVersionIds } }, { session }).toArray();
          const upstreamArtifacts = await c.artifacts.find({ _id: { $in: upstream.map((version) => version.artifactId) }, bookletId: input.bookletId }, { session }).toArray();
          if (upstream.length !== new Set(input.dependencyVersionIds).size || new Set(upstreamArtifacts.map((row) => row._id)).size !== new Set(upstream.map((version) => version.artifactId)).size) throw new Error("An upstream artifact version is missing or belongs to another booklet.");
        }
        const latest = await c.artifact_versions.find({ artifactId: artifact._id }, { session }).sort({ versionNumber: -1 }).limit(1).next();
        const document: ArtifactVersionDocument = { _id: input.id, artifactId: artifact._id, versionNumber: (latest?.versionNumber ?? 0) + 1, schemaVersion: SCHEMA_VERSION, contentJson: JSON.stringify(content), dependencyVersionIdsJson: JSON.stringify(input.dependencyVersionIds), createdBy: input.createdBy, sourceVersionId: artifact.currentVersionId, sourceExecutionBatchId: input.sourceExecutionBatchId ?? null, createdAtMs: input.createdAtMs };
        await c.artifact_versions.insertOne(document, { session });
        if (input.dependencyVersionIds.length) await c.artifact_dependencies.insertMany(input.dependencyVersionIds.map((upstreamVersionId, index) => ({ _id: `${input.id}:dependency:${index}`, downstreamVersionId: input.id, upstreamVersionId, createdAtMs: input.createdAtMs })), { session });
        if (artifact.currentVersionId) {
          const previous = await c.artifact_versions.findOne({ _id: artifact.currentVersionId }, { session });
          if (previous) {
            const previousContent = parseJson(previous.contentJson); const retained = unchangedScopedSubjects(input.artifactType, previousContent, content);
            const carryContent = input.artifactType === "visual_bible" && visualBibleDefinitionsUnchanged(previousContent, content);
            const priorApprovals = await c.approvals.find({ artifactVersionId: artifact.currentVersionId }, { session }).toArray();
            const carried = priorApprovals.filter((approval) => (approval.scope !== "artifact" && approval.subjectKey && retained.has(approval.subjectKey)) || (carryContent && approval.scope === "artifact_content"));
            if (carried.length) await c.approvals.insertMany(carried.map((approval) => ({ _id: randomUUID(), bookletId: input.bookletId, artifactVersionId: input.id, scope: approval.scope, subjectKey: approval.subjectKey, action: approval.action, origin: "carried_forward", sourceApprovalId: approval._id, cardResponseId: null, qualityReviewId: null, createdAtMs: input.createdAtMs })), { session });
          }
        }
        await c.artifacts.updateOne({ _id: artifact._id }, { $set: { currentVersionId: input.id, state: "draft", updatedAtMs: input.createdAtMs } }, { session });
        if (artifact.currentVersionId) {
          const pending = [artifact.currentVersionId]; const invalidated = new Set<string>();
          while (pending.length) {
            const upstreamVersionId = pending.shift()!;
            const dependencies = await c.artifact_dependencies.find({ upstreamVersionId }, { session }).toArray();
            for (const dependency of dependencies) {
              const downstreamVersion = await c.artifact_versions.findOne({ _id: dependency.downstreamVersionId }, { session });
              const downstreamArtifact = downstreamVersion ? await c.artifacts.findOne({ _id: downstreamVersion.artifactId }, { session }) : null;
              if (!downstreamVersion || !downstreamArtifact || downstreamArtifact.currentVersionId !== downstreamVersion._id || invalidated.has(downstreamArtifact._id)) continue;
              invalidated.add(downstreamArtifact._id); await c.artifacts.updateOne({ _id: downstreamArtifact._id }, { $set: { state: "needs_review", updatedAtMs: input.createdAtMs } }, { session }); pending.push(downstreamVersion._id);
            }
          }
        }
        return toArtifactVersion(document, input.artifactType);
      }));
    },
    async approve(input) {
      await withMongoTransaction(database, async (session) => {
        const artifact = await c.artifacts.findOne({ bookletId: input.bookletId, artifactType: input.artifactType }, { session });
        if (!artifact || artifact.currentVersionId !== input.artifactVersionId) throw new Error("Only the current artifact version can be approved.");
        const scope = input.scope ?? "artifact";
        await c.approvals.insertOne({ _id: input.id, bookletId: input.bookletId, artifactVersionId: input.artifactVersionId, scope, subjectKey: input.subjectKey ?? null, action: "approve", origin: "user", sourceApprovalId: null, cardResponseId: null, qualityReviewId: null, createdAtMs: input.createdAtMs }, { session });
        if (scope === "artifact") await c.artifacts.updateOne({ _id: artifact._id }, { $set: { state: "approved", updatedAtMs: input.createdAtMs } }, { session });
      });
    },
  };

  const conversationRepository: ConversationRepository = {
    async listMessages(bookletId) { return (await c.messages.find({ bookletId }).sort({ sequence: 1 }).toArray()).map((row) => ({ id: row._id, role: row.role === "assistant" ? "assistant" : "user", sequence: row.sequence, message: parseJson(row.uiMessageJson), createdAt: iso(row.createdAtMs) })); },
    async getActiveCard(bookletId) { const row = await c.cards.find({ bookletId, status: "active" }).sort({ updatedAtMs: -1 }).limit(1).next(); return row ? parseJson(row.cardJson) : null; },
    async appendMessage(input) {
      await retryDuplicate(() => withMongoTransaction(database, async (session) => {
        if (await c.messages.findOne({ _id: input.id }, { session })) return;
        if (!(await c.booklets.findOne({ _id: input.bookletId }, { session }))) throw new Error("The message booklet was not found.");
        const latest = await c.messages.find({ bookletId: input.bookletId }, { session }).sort({ sequence: -1 }).limit(1).next();
        await c.messages.insertOne({ _id: input.id, bookletId: input.bookletId, sequence: (latest?.sequence ?? -1) + 1, role: input.role, schemaVersion: SCHEMA_VERSION, uiMessageJson: JSON.stringify(input.message), createdAtMs: input.createdAtMs }, { session });
      }));
    },
    async persistAssistantCard(input) {
      const persistedCard = genUICardSchema.parse({ ...input.card, status: "active" });
      await retryDuplicate(() => withMongoTransaction(database, async (session) => {
        if (!(await c.booklets.findOne({ _id: input.bookletId }, { session }))) throw new Error("The card booklet was not found.");
        const latest = await c.messages.find({ bookletId: input.bookletId }, { session }).sort({ sequence: -1 }).limit(1).next();
        const activeCards = await c.cards.find({ bookletId: input.bookletId, status: "active" }, { session }).toArray();
        for (const activeCard of activeCards) {
          const saved = genUICardSchema.parse(parseJson(activeCard.cardJson));
          await c.cards.updateOne({ _id: activeCard._id }, { $set: { status: "superseded", cardJson: JSON.stringify(genUICardSchema.parse({ ...saved, status: "superseded" })), updatedAtMs: input.createdAtMs } }, { session });
          if (activeCard.messageId) { const message = await c.messages.findOne({ _id: activeCard.messageId }, { session }); if (message) await c.messages.updateOne({ _id: message._id }, { $set: { uiMessageJson: updateCardMessageProjection(message.uiMessageJson, activeCard._id, "superseded") } }, { session }); }
        }
        await c.messages.insertOne({ _id: input.messageId, bookletId: input.bookletId, sequence: (latest?.sequence ?? -1) + 1, role: "assistant", schemaVersion: SCHEMA_VERSION, uiMessageJson: JSON.stringify({ id: input.messageId, role: "assistant", metadata: { schemaVersion: SCHEMA_VERSION, bookletId: input.bookletId, persistedAt: iso(input.createdAtMs) }, parts: [{ type: "text", text: input.narration }, { type: "data-card", id: input.card.cardId, data: persistedCard }] }), createdAtMs: input.createdAtMs }, { session });
        await c.cards.insertOne({ _id: persistedCard.cardId, bookletId: input.bookletId, messageId: input.messageId, artifactId: null, family: persistedCard.family, variant: persistedCard.variant, status: "active", schemaVersion: SCHEMA_VERSION, cardJson: JSON.stringify(persistedCard), readyInputJson: input.readyInput === undefined ? null : JSON.stringify(input.readyInput), readyInputSchemaVersion: input.readyInputSchemaVersion ?? null, readyWorkflowFingerprintJson: input.readyWorkflowFingerprint === undefined ? null : JSON.stringify(input.readyWorkflowFingerprint), readyPreviousBatchId: input.readyPreviousBatchId ?? null, createdAtMs: input.createdAtMs, updatedAtMs: input.createdAtMs }, { session });
      }));
    },
    async getCard(bookletId, cardId) { const row = await c.cards.findOne({ _id: cardId, bookletId }); return row ? genUICardSchema.parse(parseJson(row.cardJson)) : null; },
    async getAgentRunReadyInput(bookletId, cardId) { const row = await c.cards.findOne({ _id: cardId, bookletId, family: "agent_run" }); if (!row || !row.readyInputJson || !row.readyInputSchemaVersion || !row.readyWorkflowFingerprintJson) return null; return { input: parseJson(row.readyInputJson), schemaVersion: row.readyInputSchemaVersion, workflowFingerprint: parseJson(row.readyWorkflowFingerprintJson), previousBatchId: row.readyPreviousBatchId ?? null }; },
    async updateAgentRunProjection(input) { await withMongoTransaction(database, async (session) => { const row = await c.cards.findOne({ _id: input.card.cardId, bookletId: input.bookletId }, { session }); if (!row) throw new Error("The Agent run card was not found."); const next = genUICardSchema.parse(input.card); await c.cards.updateOne({ _id: row._id }, { $set: { cardJson: JSON.stringify(next), readyInputJson: input.readyInput === undefined ? row.readyInputJson ?? null : input.readyInput === null ? null : JSON.stringify(input.readyInput), readyInputSchemaVersion: input.readyInputSchemaVersion === undefined ? row.readyInputSchemaVersion ?? null : input.readyInputSchemaVersion, readyWorkflowFingerprintJson: input.readyWorkflowFingerprint === undefined ? row.readyWorkflowFingerprintJson ?? null : input.readyWorkflowFingerprint === null ? null : JSON.stringify(input.readyWorkflowFingerprint), readyPreviousBatchId: input.readyPreviousBatchId === undefined ? row.readyPreviousBatchId ?? null : input.readyPreviousBatchId, updatedAtMs: input.updatedAtMs } }, { session }); if (row.messageId) { const message = await c.messages.findOne({ _id: row.messageId }, { session }); if (message) await c.messages.updateOne({ _id: message._id }, { $set: { uiMessageJson: replaceCardMessageProjection(message.uiMessageJson, next) } }, { session }); } }); },
    async getPendingCardFollowup(bookletId) {
      const cardIds = (await c.cards.find({ bookletId }).project<{ _id: string }>({ _id: 1 }).toArray()).map(({ _id }) => _id); if (!cardIds.length) return null;
      const response = await c.card_responses.find({ cardId: { $in: cardIds }, followupStatus: "pending" }).sort({ createdAtMs: -1 }).limit(1).next(); if (!response) return null;
      const cardRow = await c.cards.findOne({ _id: response.cardId }); if (!cardRow) return null; const card = genUICardSchema.parse(parseJson(cardRow.cardJson));
      const saved = cardResponseSchema.parse({ cardId: card.cardId, responseId: response._id, action: response.action, value: response.valueJson ? parseJson(response.valueJson) : undefined, revisionInstruction: response.revisionInstruction ?? undefined });
      return { responseId: response._id, summary: responseSummary(card, saved) };
    },
    async submitCardResponse(input) {
      const response = cardResponseSchema.parse(input.response);
      const existing = await c.card_responses.findOne({ _id: response.responseId });
      if (existing) {
        const cardRow = await c.cards.findOne({ _id: existing.cardId }); if (!cardRow || cardRow.bookletId !== input.bookletId) throw new Error("The requested response does not belong to this booklet.");
        const card = genUICardSchema.parse(parseJson(cardRow.cardJson)); const saved = cardResponseSchema.parse({ cardId: existing.cardId, responseId: existing._id, action: existing.action, value: existing.valueJson ? parseJson(existing.valueJson) : undefined, revisionInstruction: existing.revisionInstruction ?? undefined });
        return { kind: "duplicate", duplicate: true, followupRequired: existing.followupStatus === "pending" || existing.followupStatus === "running", summary: responseSummary(card, saved) };
      }
      try {
        return await withMongoTransaction(database, async (session) => {
          const cardRow = await c.cards.findOne({ _id: response.cardId, bookletId: input.bookletId }, { session }); if (!cardRow) throw new Error("The requested card was not found for this booklet.");
          const card = genUICardSchema.parse(parseJson(cardRow.cardJson));
          if (card.status !== "active" || cardRow.status !== "active") return { kind: "conflict" as const, duplicate: false as const, followupRequired: false as const, summary: "This decision was already saved. A recovery card is ready." };
          if (!card.allowedActions.includes(response.action)) throw new Error("That action is not available for this card.");
          const validated = validateCardResponseValue(card, response); const summary = responseSummary(card, validated);
          const followupRequired = !(card.family === "artifact_review" && validated.action === "approve_and_continue") && !(card.family === "issue" && validated.action === "accept_with_issue");
          const update = await c.cards.updateOne({ _id: cardRow._id, status: "active" }, { $set: { status: "submitted", cardJson: JSON.stringify(genUICardSchema.parse({ ...card, status: "submitted" })), updatedAtMs: input.createdAtMs } }, { session });
          if (!update.matchedCount) return { kind: "conflict" as const, duplicate: false as const, followupRequired: false as const, summary: "This decision was already saved. A recovery card is ready." };
          if (cardRow.messageId) { const message = await c.messages.findOne({ _id: cardRow.messageId }, { session }); if (message) await c.messages.updateOne({ _id: message._id }, { $set: { uiMessageJson: updateCardMessageProjection(message.uiMessageJson, card.cardId, "submitted") } }, { session }); }
          await c.card_responses.insertOne({ _id: validated.responseId, cardId: validated.cardId, action: validated.action, valueJson: validated.value === undefined ? null : JSON.stringify(validated.value), revisionInstruction: validated.revisionInstruction ?? null, followupStatus: followupRequired ? "pending" : "not_required", followupMessageId: null, createdAtMs: input.createdAtMs }, { session });
          return { kind: "saved" as const, duplicate: false as const, followupRequired, summary };
        });
      } catch (error) { if (duplicate(error)) return conversationRepository.submitCardResponse(input); throw error; }
    },
    async claimCardFollowup(input) {
      const response = await c.card_responses.findOne({ _id: input.responseId }); if (!response) return { status: "missing" };
      const cardRow = await c.cards.findOne({ _id: response.cardId }); if (!cardRow || cardRow.bookletId !== input.bookletId) return { status: "missing" };
      const card = genUICardSchema.parse(parseJson(cardRow.cardJson)); const saved = cardResponseSchema.parse({ cardId: card.cardId, responseId: response._id, action: response.action, value: response.valueJson ? parseJson(response.valueJson) : undefined, revisionInstruction: response.revisionInstruction ?? undefined }); const summary = responseSummary(card, saved);
      if (response.followupStatus === "completed") { if (!response.followupMessageId) throw new Error("Completed card follow-up is missing its assistant message."); const message = await c.messages.findOne({ _id: response.followupMessageId }); if (!message) throw new Error("Completed card follow-up message is missing."); return { status: "completed", summary, assistantMessage: parseJson(message.uiMessageJson) }; }
      if (response.followupStatus === "running") return { status: "running", summary }; if (response.followupStatus !== "pending") return { status: "missing" };
      const claimed = await c.card_responses.findOneAndUpdate({ _id: response._id, followupStatus: "pending" }, { $set: { followupStatus: "running" } }, { returnDocument: "after" });
      return claimed ? { status: "claimed", summary } : { status: "running", summary };
    },
    async completeCardFollowup(input) {
      const response = await c.card_responses.findOne({ _id: input.responseId }), message = await c.messages.findOne({ _id: input.assistantMessageId });
      const card = response ? await c.cards.findOne({ _id: response.cardId }) : null;
      if (!response || !card || !message || message.bookletId !== card.bookletId) throw new Error("The card follow-up message is missing or belongs to another booklet.");
      await c.card_responses.updateOne({ _id: input.responseId }, { $set: { followupStatus: "completed", followupMessageId: input.assistantMessageId } });
    },
    async resetRunningCardFollowup(responseId) { await c.card_responses.updateOne({ _id: responseId, followupStatus: "running" }, { $set: { followupStatus: "pending" } }); },
    async recoverInterruptedFollowups() { const result = await c.card_responses.updateMany({ followupStatus: "running" }, { $set: { followupStatus: "pending" } }); return result.modifiedCount; },
  };

  const jobsRepository: JobRepository = {
    async createOrGet(input) {
      if (!(await c.booklets.findOne({ _id: input.bookletId }))) throw new Error("The generation-job booklet was not found.");
      const existing = await c.generation_jobs.findOne({ idempotencyKey: input.idempotencyKey }); if (existing) return { id: existing._id, status: existing.status, reused: true };
      try {
        return await withMongoTransaction(database, async (session) => {
          const winner = await c.generation_jobs.findOne({ idempotencyKey: input.idempotencyKey }, { session }); if (winner) return { id: winner._id, status: winner.status, reused: true };
          await c.generation_jobs.insertOne({ _id: input.id, bookletId: input.bookletId, jobType: input.jobType, status: "pending", idempotencyKey: input.idempotencyKey, inputJson: JSON.stringify(input.input), errorJson: null, createdAtMs: input.createdAtMs, startedAtMs: null, finishedAtMs: null, updatedAtMs: input.createdAtMs }, { session });
          if (input.items.length) await c.generation_items.insertMany(input.items.map((item) => ({ _id: item.id, jobId: input.id, itemKey: item.itemKey, position: item.position, status: "pending", attemptCount: 0, inputJson: JSON.stringify(item.input), resultJson: null, assetId: null, errorJson: null, executionCardId: null, executionBatchId: null, startedAtMs: null, finishedAtMs: null })), { session });
          return { id: input.id, status: "pending", reused: false };
        });
      } catch (error) { if (!duplicate(error)) throw error; const winner = await c.generation_jobs.findOne({ idempotencyKey: input.idempotencyKey }); if (!winner) throw error; return { id: winner._id, status: winner.status, reused: true }; }
    },
    async getItems(jobId) { return (await c.generation_items.find({ jobId }).sort({ position: 1 }).toArray()).map((item) => ({ id: item._id, itemKey: item.itemKey, position: item.position, status: item.status, attemptCount: item.attemptCount, input: parseJson(item.inputJson), result: item.resultJson ? parseJson(item.resultJson) : null, assetId: item.assetId, error: item.errorJson ? parseJson(item.errorJson) : null })); },
    async claimNextPending(jobId, startedAtMs, keepJobPaused = false) {
      return withMongoTransaction(database, async (session) => {
        const item = await c.generation_items.findOneAndUpdate({ jobId, status: "pending" }, { $set: { status: "running", startedAtMs, finishedAtMs: null }, $inc: { attemptCount: 1 } }, { sort: { position: 1 }, returnDocument: "after", session });
        if (!item) return null;
        await c.generation_jobs.updateOne({ _id: jobId }, { $set: { status: keepJobPaused ? "paused" : "running", startedAtMs, updatedAtMs: startedAtMs } }, { session });
        return { id: item._id, itemKey: item.itemKey, position: item.position, attemptCount: item.attemptCount, input: parseJson(item.inputJson) };
      });
    },
    async completeItem(input) {
      await withMongoTransaction(database, async (session) => {
        const job = await c.generation_jobs.findOne({ _id: input.jobId }, { session }); if (!job) throw new Error("The generation job was not found.");
        const newAssets = new Map(input.assets.map((asset) => [asset.id, asset]));
        for (const asset of input.assets) {
          if (asset.bookletId && asset.bookletId !== job.bookletId) throw new Error("A generated asset belongs to another booklet.");
          if (asset.sourceAssetId && !newAssets.has(asset.sourceAssetId) && !(await c.assets.findOne({ _id: asset.sourceAssetId }, { session }))) throw new Error("A generated source asset is missing.");
        }
        if (!newAssets.has(input.primaryAssetId) && !(await c.assets.findOne({ _id: input.primaryAssetId }, { session }))) throw new Error("The primary generated asset is missing.");
        if (input.assets.length) await c.assets.insertMany(input.assets.map(assetDocument), { session });
        const result = await c.generation_items.updateOne({ _id: input.itemId, jobId: input.jobId, status: { $in: ["running", "waiting_for_selection"] } }, { $set: { status: "succeeded", resultJson: JSON.stringify(input.result), assetId: input.primaryAssetId, errorJson: null, finishedAtMs: input.finishedAtMs } }, { session });
        if (!result.matchedCount) throw new Error("The generation item is no longer running.");
        const remaining = await c.generation_items.countDocuments({ jobId: input.jobId, status: { $ne: "succeeded" } }, { session });
        await c.generation_jobs.updateOne({ _id: input.jobId }, { $set: { status: remaining === 0 ? "succeeded" : input.pauseWithPending ? "paused" : "running", finishedAtMs: remaining === 0 ? input.finishedAtMs : null, updatedAtMs: input.finishedAtMs } }, { session });
      });
    },
    async failItem(input) {
      await withMongoTransaction(database, async (session) => {
        const item = await c.generation_items.updateOne({ _id: input.itemId, jobId: input.jobId }, { $set: { status: "failed", errorJson: JSON.stringify(input.error), finishedAtMs: input.finishedAtMs } }, { session });
        if (!item.matchedCount) throw new Error("The generation item was not found.");
        await c.generation_jobs.updateOne({ _id: input.jobId }, { $set: { status: input.haltJob ? "failed" : "partial", errorJson: JSON.stringify(input.error), finishedAtMs: input.haltJob ? input.finishedAtMs : null, updatedAtMs: input.finishedAtMs } }, { session });
      });
    },
    async resumeForCandidateRetry(jobId, itemId, now) {
      return withMongoTransaction(database, async (session) => {
        const item = await c.generation_items.updateOne(
          { _id: itemId, jobId, status: { $in: ["failed", "waiting_for_selection"] } },
          { $set: { status: "running", errorJson: null, finishedAtMs: null } },
          { session },
        );
        if (!item.matchedCount) return false;
        await c.generation_jobs.updateOne(
          { _id: jobId },
          { $set: { status: "running", errorJson: null, finishedAtMs: null, updatedAtMs: now } },
          { session },
        );
        return true;
      });
    },
    async retryItem(jobId, itemId) {
      await withMongoTransaction(database, async (session) => {
        const result = await c.generation_items.updateOne({ _id: itemId, jobId, status: "failed" }, { $set: { status: "pending", errorJson: null, finishedAtMs: null } }, { session });
        if (!result.matchedCount) return;
        await c.generation_jobs.updateOne({ _id: jobId }, { $set: { status: "paused", errorJson: null, finishedAtMs: null, updatedAtMs: Date.now() } }, { session });
      });
    },
    async continueJob(jobId) { await c.generation_jobs.updateOne({ _id: jobId, status: "paused" }, { $set: { status: "pending", errorJson: null, finishedAtMs: null, updatedAtMs: Date.now() } }); },
    async recoverInterrupted() {
      return withMongoTransaction(database, async (session) => {
        // Dify jobs use their retained operation ledger to reconcile uncertain
        // outcomes. The legacy worker must never reset those items for replay.
        const legacyJobs = await c.generation_jobs.find({ jobType: { $in: ["references", "pages", "export"] } }, { session }).toArray();
        const legacyJobIds = legacyJobs.map((job) => job._id);
        const waitingJobIds = await c.generation_items.distinct("jobId", { jobId: { $in: legacyJobIds }, status: { $in: ["waiting_for_agents", "waiting_for_selection"] } }, { session });
        const recovered = await c.generation_items.updateMany({ jobId: { $in: legacyJobIds }, status: "running" }, { $set: { status: "pending", startedAtMs: null } }, { session });
        await c.generation_jobs.updateMany({ jobType: { $in: ["references", "pages", "export"] }, status: "running", _id: { $nin: waitingJobIds } }, { $set: { status: "pending", startedAtMs: null, finishedAtMs: null, updatedAtMs: Date.now() } }, { session }); return recovered.modifiedCount;
      });
    },
    async listRunnable() { const rows = await c.generation_jobs.find({ status: { $in: ["pending", "partial", "running"] } }).sort({ createdAtMs: 1 }).toArray(); return rows.filter((row): row is typeof row & { jobType: "references" | "pages" | "export" } => row.jobType === "references" || row.jobType === "pages" || row.jobType === "export").map((row) => ({ id: row._id, bookletId: row.bookletId, jobType: row.jobType })); },
    async listActiveByBooklet(bookletId) {
      const rows = (await c.generation_jobs.find({ bookletId, jobType: { $in: ["references", "pages", "export"] } }).toArray()).filter((row) => activeJobStatuses.has(row.status));
      return Promise.all(rows.map(async (job) => {
        const items = await c.generation_items.find({ jobId: job._id }).toArray();
        return { id: job._id, jobType: job.jobType as ActiveJobSummary["jobType"], status: await derivedJobStatus(job.status, items), progress: { completed: items.filter((item) => item.status === "succeeded").length, total: items.length }, updatedAt: iso(job.updatedAtMs) };
      }));
    },
    async getStatus(jobId) {
      const row = await c.generation_jobs.findOne({ _id: jobId }); if (!row) return null;
      if (row.jobType !== "references" && row.jobType !== "pages" && row.jobType !== "export") throw new Error("Unknown generation job type.");
      const items = await c.generation_items.find({ jobId }).sort({ position: 1 }).toArray();
      return { id: row._id, bookletId: row.bookletId, jobType: row.jobType, status: await derivedJobStatus(row.status, items), updatedAt: iso(row.updatedAtMs), items: items.map((item) => ({ id: item._id, itemKey: item.itemKey, position: item.position, status: item.status as "pending" | "running" | "waiting_for_agents" | "waiting_for_selection" | "succeeded" | "failed", attemptCount: item.attemptCount, error: item.errorJson ? parseJson(item.errorJson) : null })) };
    },
  };

  const assetsRepository: AssetRepository = {
    async get(id) { const row = await c.assets.findOne({ _id: id }); return row ? toAsset(row) : null; },
    async create(asset) {
      if (asset.bookletId && !(await c.booklets.findOne({ _id: asset.bookletId }))) throw new Error("The asset booklet was not found.");
      if (asset.sourceAssetId && !(await c.assets.findOne({ _id: asset.sourceAssetId }))) throw new Error("The source asset was not found.");
      await c.assets.insertOne(assetDocument(asset));
    },
    async listByBooklet(bookletId, kind) { return (await c.assets.find(kind ? { bookletId, kind } : { bookletId }).sort({ createdAtMs: -1 }).toArray()).map(toAsset); },
  };

  const evidenceRepository: EvidenceRepository = {
    async countModelCalls(bookletId) { return c.model_calls.countDocuments({ bookletId }); },
    async countQualityReviews(bookletId) { return c.quality_reviews.countDocuments({ bookletId }); },
    async hasPassedQualityReview(input) {
      const candidates = await c.quality_reviews.find({ bookletId: input.bookletId, gate: input.gate, status: "passed" }).sort({ createdAtMs: -1 }).toArray();
      return candidates.some((review) => { const ids = parseJson(review.artifactVersionIdsJson); return Array.isArray(ids) && ids.includes(input.artifactVersionId); });
    },
    async recordModelCall(input) {
      if (!(await c.booklets.findOne({ _id: input.bookletId }))) throw new Error("The evidence booklet was not found.");
      if (input.artifactVersionId) { const version = await c.artifact_versions.findOne({ _id: input.artifactVersionId }), artifact = version ? await c.artifacts.findOne({ _id: version.artifactId }) : null; if (!artifact || artifact.bookletId !== input.bookletId) throw new Error("The evidence artifact version was not found for this booklet."); }
      if (input.jobId && (await c.generation_jobs.findOne({ _id: input.jobId }))?.bookletId !== input.bookletId) throw new Error("The evidence job was not found for this booklet.");
      if (input.agentVersionId && !(await c.agent_versions.findOne({ _id: input.agentVersionId }))) throw new Error("The evidence agent version was not found.");
      if (input.agentDefinitionId && !(await c.agent_definitions.findOne({ _id: input.agentDefinitionId }))) throw new Error("The evidence agent definition was not found.");
      await c.model_calls.insertOne({ _id: input.id, bookletId: input.bookletId, operation: input.operation, skillId: input.skillId, artifactVersionId: input.artifactVersionId ?? null, jobId: input.jobId ?? null, provider: input.provider, model: input.model, traceId: input.traceId, providerRequestId: input.providerRequestId ?? null, status: input.status, attempt: input.attempt, startedAtMs: input.startedAtMs, latencyMs: input.latencyMs, inputRefJson: JSON.stringify(input.inputReference), outputRefJson: input.outputReference === undefined ? null : JSON.stringify(input.outputReference), usageJson: input.usage ? JSON.stringify(input.usage) : null, actualCostUsd: input.actualCostUsd ?? null, estimatedCostUsd: input.estimatedCostUsd ?? null, pricingVersion: input.pricingVersion ?? null, errorKind: input.status === "failed" ? input.errorKind ?? "validation" : null, errorMessage: input.errorMessage ?? null, agentDefinitionId: input.agentDefinitionId ?? null, agentVersionId: input.agentVersionId ?? null, agentConfigSnapshotJson: input.agentConfigSnapshot ? JSON.stringify(input.agentConfigSnapshot) : null, executionBatchId: input.executionBatchId ?? null, executionItemId: input.executionItemId ?? null });
    },
    async recordQualityReview(input) {
      const review = qualityReviewSchema.parse(input.review);
      if (!(await c.booklets.findOne({ _id: input.bookletId }))) throw new Error("The quality-review booklet was not found.");
      const ids = [...new Set([...input.artifactVersionIds, ...input.repairVersionIds])];
      if (ids.length) { const versions = await c.artifact_versions.find({ _id: { $in: ids } }).toArray(); const artifactIds = [...new Set(versions.map((version) => version.artifactId))]; const count = await c.artifacts.countDocuments({ _id: { $in: artifactIds }, bookletId: input.bookletId }); if (versions.length !== ids.length || count !== artifactIds.length) throw new Error("A quality-review artifact version is missing or belongs to another booklet."); }
      await c.quality_reviews.insertOne({ _id: input.id, bookletId: input.bookletId, gate: review.gate, attempt: review.attempt, status: review.status, artifactVersionIdsJson: JSON.stringify(input.artifactVersionIds), issuesJson: JSON.stringify(review.issues), repairVersionIdsJson: input.repairVersionIds.length ? JSON.stringify(input.repairVersionIds) : null, sourceExecutionBatchId: null, acceptedAtMs: null, createdAtMs: input.createdAtMs });
    },
    async acceptLatestUnresolvedQualityReview(bookletId, acceptedAtMs) { return Boolean(await c.quality_reviews.findOneAndUpdate({ bookletId, status: "unresolved", acceptedAtMs: null }, { $set: { acceptedAtMs } }, { sort: { createdAtMs: -1 }, returnDocument: "after" })); },
    async listModelCalls(bookletId) {
      const rows = await c.model_calls.find({ bookletId }).sort({ startedAtMs: 1 }).toArray();
      return rows.map((row) => ({ operation: row.operation, skillId: row.skillId, artifactVersionId: row.artifactVersionId, jobId: row.jobId, provider: row.provider, model: row.model, traceId: row.traceId, providerRequestId: row.providerRequestId, status: row.status, attempt: row.attempt, latencyMs: row.latencyMs, usage: row.usageJson ? parseJson(row.usageJson) : null, actualCostUsd: row.actualCostUsd, estimatedCostUsd: row.estimatedCostUsd, pricingVersion: row.pricingVersion, errorKind: row.errorKind, agentDefinitionId: row.agentDefinitionId, agentVersionId: row.agentVersionId, agentConfigSnapshot: row.agentConfigSnapshotJson ? parseJson(row.agentConfigSnapshotJson) : null, executionBatchId: row.executionBatchId ?? null, executionItemId: row.executionItemId ?? null }));
    },
  };

  const exportsRepository: ExportRepository = {
    async create(input) {
      const version = await c.artifact_versions.findOne({ _id: input.artifactVersionId }), artifact = version ? await c.artifacts.findOne({ _id: version.artifactId }) : null;
      if (!(await c.booklets.findOne({ _id: input.bookletId })) || !artifact || artifact.bookletId !== input.bookletId) throw new Error("The export booklet or artifact version is missing or incompatible.");
      if (input.pageAssetIds.length && await c.assets.countDocuments({ _id: { $in: input.pageAssetIds }, bookletId: input.bookletId }) !== new Set(input.pageAssetIds).size) throw new Error("An export page asset is missing or belongs to another booklet.");
      await c.exports.insertOne({ _id: input.id, bookletId: input.bookletId, artifactVersionId: input.artifactVersionId, status: "running", assetId: null, pageAssetIdsJson: JSON.stringify(input.pageAssetIds), preflightJson: null, errorJson: null, createdAtMs: input.createdAtMs, updatedAtMs: input.createdAtMs });
    },
    async complete(input) { if (!(await c.assets.findOne({ _id: input.assetId }))) throw new Error("The export asset is missing."); await c.exports.updateOne({ _id: input.id }, { $set: { status: "succeeded", assetId: input.assetId, preflightJson: JSON.stringify(input.preflight), errorJson: null, updatedAtMs: input.updatedAtMs } }); },
    async fail(input) { await c.exports.updateOne({ _id: input.id }, { $set: { status: "failed", errorJson: JSON.stringify(input.error), updatedAtMs: input.updatedAtMs } }); },
    async listByBooklet(bookletId) { return (await c.exports.find({ bookletId }).sort({ updatedAtMs: -1 }).toArray()).map((row) => ({ id: row._id, status: row.status as ExportSummary["status"], assetId: row.assetId, createdAt: iso(row.createdAtMs), updatedAt: iso(row.updatedAtMs) })); },
  };

  return { database, booklets: bookletsRepository, artifacts: artifactsRepository, conversation: conversationRepository, jobs: jobsRepository, assets: assetsRepository, evidence: evidenceRepository, exports: exportsRepository, agents: createAgentRepository(database), execution: createExecutionRepository(database) };
}
