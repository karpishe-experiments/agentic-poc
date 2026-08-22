import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createRepositories, type Repositories } from "@/db/repositories";
import { getDatabase, type Database } from "@/db/client";
import type { AssetStore } from "@/lib/assets/asset-store";
import { CandidateExecutionService } from "@/lib/application/candidate-execution-service";
import { CandidatePoolService } from "@/lib/application/candidate-pool-service";
import { ExecutionService } from "@/lib/application/execution-service";
import { executionTargetKeyForImage, type ExecutionBatch } from "@/lib/contracts/execution";
import { cardResponseSchema, validateCardResponseValue, type GenUICard } from "@/lib/contracts/cards";
import { imageRequestSchema } from "@/lib/contracts/images";
import { composePage } from "@/lib/composition/compose-page";
import { getServerEnv, resolveDataRoot } from "@/lib/config/env";

const readyInputSchema = z.object({ kind: z.literal("image"), jobId: z.string().uuid(), itemId: z.string().uuid(), itemKey: z.string().min(1), position: z.number().int().nonnegative(), target: z.enum(["reference", "page"]), subjectLabel: z.string().min(1), request: imageRequestSchema, page: z.unknown().nullable() });
type ReadyInput = z.infer<typeof readyInputSchema>;
type AgentRunCard = Extract<GenUICard, { family: "agent_run" }>;
type CardResult = { kind: "saved"; duplicate: false; followupRequired: false; summary: string; refreshRequired: true };

export class ImageAgentRunService {
  private readonly repositories: Repositories;
  private readonly pools: CandidatePoolService;
  private readonly executor: CandidateExecutionService;
  private readonly execution: ExecutionService;
  private assets?: AssetStore;
  private readonly database: Database;
  private readonly onMaterialized?: (input: ReadyInput) => Promise<void>;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; runtimeMode?: "fake" | "real"; assets?: AssetStore; pools?: CandidatePoolService; executor?: CandidateExecutionService; execution?: ExecutionService; onMaterialized?: (input: ReadyInput) => Promise<void> } = {}) {
    this.database = dependencies.database ?? dependencies.repositories?.database ?? getDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(this.database);
    const runtimeMode = dependencies.runtimeMode ?? (process.env.MODEL_RUNTIME === "real" ? "real" : "fake");
    this.pools = dependencies.pools ?? new CandidatePoolService(this.repositories, runtimeMode);
    this.executor = dependencies.executor ?? new CandidateExecutionService({ database: this.database, repositories: this.repositories, runtimeMode });
    this.execution = dependencies.execution ?? new ExecutionService(this.repositories, this.pools);
    this.assets = dependencies.assets;
    this.onMaterialized = dependencies.onMaterialized;
  }

  private result(summary: string): CardResult { return { kind: "saved", duplicate: false, followupRequired: false, summary, refreshRequired: true }; }
  private candidates(pool: Awaited<ReturnType<CandidatePoolService["resolve"]>>) { return pool.candidates.map((candidate) => ({ agentId: candidate.agentId, agentVersionId: candidate.id, displayName: candidate.displayName, purpose: candidate.purpose, profileSummary: `${candidate.profileId} · ${candidate.modelId}`, eligible: true })); }
  private async store(): Promise<AssetStore> { if (this.assets) return this.assets; const { FilesystemAssetStore } = await import("@/lib/assets/filesystem-asset-store"); this.assets = new FilesystemAssetStore(resolveDataRoot(getServerEnv())); return this.assets; }
  private async requireCard(bookletId: string, cardId: string): Promise<AgentRunCard> { const card = await this.repositories.conversation.getCard(bookletId, cardId); if (!card || card.family !== "agent_run") throw new Error("The Image Agent run card was not found."); return card; }

  public async createReady(input: { bookletId: string; jobId: string; itemId: string; itemKey: string; position: number; target: "reference" | "page"; subjectLabel: string; request: unknown; page?: unknown | null }): Promise<string> {
    const targetKey = executionTargetKeyForImage(input.target);
    const ready = readyInputSchema.parse({ ...input, kind: "image", request: input.request, page: input.page ?? null });
    const pool = await this.pools.resolve(targetKey, { hasImageInput: ready.request.references.length > 0 || ready.request.editTargetAssetId !== null });
    if (!pool.candidates.length) throw new Error("execution_pool_unavailable");
    const preference = await this.repositories.execution.getPreference(input.bookletId, targetKey);
    const cardId = randomUUID();
    const card: AgentRunCard = { schemaVersion: "1", cardId, family: "agent_run", variant: "parallel_execution", status: "active", title: `Choose agents for ${input.subjectLabel}`, explanation: "Choose one or more image agents for this item. Only the selected result will become current.", allowedActions: ["run_agents", "change_agents"], payload: { revision: 1, target: targetKey, subjectLabel: input.subjectLabel, state: "ready", batchId: null, poolFingerprint: pool.fingerprint, candidates: this.candidates(pool), selectedAgentIds: pool.candidates.length === 1 ? [pool.candidates[0]!.agentId] : preference ?? [], staleSelectionNotices: pool.notices, items: [], selectedItemId: null, selectionMode: null, history: [] } };
    await this.repositories.conversation.persistAssistantCard({ bookletId: input.bookletId, messageId: randomUUID(), narration: `Choose image agents for ${input.subjectLabel}.`, card, createdAtMs: Date.now(), readyInput: ready, readyInputSchemaVersion: "1", readyWorkflowFingerprint: { jobId: input.jobId, itemId: input.itemId, target: input.target }, readyPreviousBatchId: null });
    await this.database.collections.generation_items.updateOne({ _id: input.itemId, jobId: input.jobId, status: "running" }, { $set: { executionCardId: cardId } });
    if (pool.candidates.length === 1) await this.start(input.bookletId, cardId, { cardId, responseId: randomUUID(), action: "run_agents", value: [pool.candidates[0]!.agentId] });
    return cardId;
  }

  private async project(bookletId: string, card: AgentRunCard, state: AgentRunCard["payload"]["state"], batchId: string | null, ready?: ReadyInput) {
    const status = batchId ? await this.execution.status(batchId) : null;
    const names = new Map(card.payload.candidates.map((candidate) => [candidate.agentId, candidate.displayName]));
    const hasFailedItems = (status?.items ?? []).some((item) => item.status === "failed");
    const allowedActions = state === "ready" ? ["run_agents", "change_agents"] as const : state === "results" ? hasFailedItems ? ["select_agent_result", "retry_failed_agents", "change_agents"] as const : ["select_agent_result", "change_agents"] as const : state === "completed" ? ["restart_with_agents"] as const : [] as const;
    const next: AgentRunCard = { ...card, allowedActions: [...allowedActions], payload: { ...card.payload, state, batchId, items: (status?.items ?? []).map((item) => ({ itemId: item.id, agentId: item.agentId, displayName: names.get(item.agentId) ?? item.agentId, status: item.status, elapsedMs: item.startedAt ? Math.max(0, Date.now() - Date.parse(item.startedAt)) : 0, attemptCount: item.attemptCount, summary: typeof item.resultSummary === "string" ? item.resultSummary : item.resultSummary ? "Generated image candidate" : null, safeError: item.safeError?.message ?? null, candidateAssetId: item.candidateAssetId })), selectedItemId: status?.batch.selectedItemId ?? null, selectionMode: status?.batch.selectionMode ?? null } };
    await this.repositories.conversation.updateAgentRunProjection({ bookletId, card: next, readyInput: ready ?? null, readyInputSchemaVersion: ready ? "1" : null, readyWorkflowFingerprint: ready ? { jobId: ready.jobId, itemId: ready.itemId, target: ready.target } : null, readyPreviousBatchId: null, updatedAtMs: Date.now() });
  }

  private async inputAssets(ready: ReadyInput) {
    const ids = [ready.request.editTargetAssetId, ...ready.request.references.map((reference) => reference.assetId)].filter((id): id is string => Boolean(id));
    const assets = await Promise.all(ids.map(async (id) => { const asset = await this.repositories.assets.get(id); return asset ? { asset, bytes: Buffer.from(await (await this.store()).get(asset.uri)) } : null; }));
    if (assets.some((asset) => !asset)) throw new Error("A required image reference asset is missing.");
    return assets.filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
  }

  private async execute(ready: ReadyInput, agent: Parameters<CandidateExecutionService["executeImage"]>[0]["agent"], batchId: string, itemId: string) {
    const inputs = await this.inputAssets(ready);
    const profileNeutralRequest = { schemaVersion: ready.request.schemaVersion, operation: ready.request.operation, promptPlan: ready.request.promptPlan, prompt: ready.request.prompt, geometry: ready.request.geometry, references: ready.request.references, editTargetAssetId: ready.request.editTargetAssetId };
    const output = await this.executor.executeImage({ bookletId: (await this.repositories.execution.getBatch(batchId))!.bookletId, target: ready.target, agent, request: profileNeutralRequest, inputAssets: inputs.map((asset) => ({ assetId: asset.asset.id, bytes: asset.bytes })), executionBatchId: batchId, executionItemId: itemId });
    const result = output.result;
    if (result.status !== "succeeded" || !result.bytesBase64 || !result.mimeType || !result.width || !result.height) throw new Error(result.error?.message ?? "Image candidate returned no usable image.");
    const assetId = randomUUID();
    const uri = ready.target === "reference" ? `${(await this.repositories.execution.getBatch(batchId))!.bookletId}/references/candidates/${ready.position}/${assetId}.png` : `${(await this.repositories.execution.getBatch(batchId))!.bookletId}/pages/candidates/${ready.position}/${assetId}.png`;
    await (await this.store()).put(uri, Buffer.from(result.bytesBase64, "base64"), result.mimeType);
    await this.repositories.assets.create({ id: assetId, bookletId: (await this.repositories.execution.getBatch(batchId))!.bookletId, kind: ready.target === "reference" ? "reference" : "page_source", uri, mimeType: result.mimeType, width: result.width, height: result.height, sourceAssetId: null, metadata: { executionBatchId: batchId, executionItemId: itemId, candidate: true, provider: result.provider, model: result.model }, createdAtMs: Date.now() });
    return { result: { assetId, provider: result.provider, model: result.model, providerRequestId: result.providerRequestId, usage: result.usage }, summary: output.summary, candidateAssetId: assetId };
  }

  private async completeOrShowResults(bookletId: string, cardId: string, batchId: string) {
    const [card, status] = await Promise.all([this.repositories.conversation.getCard(bookletId, cardId), this.execution.status(batchId)]);
    if (!card || card.family !== "agent_run" || !status) return;
    const successes = status.items.filter((item) => item.status === "succeeded" && item.canonicalResult !== null);
    if (status.batch.resultChoicePolicy === "implicit_sole" && successes.length === 1) {
      try { await this.materialize(bookletId, card, status.batch, successes[0]!.id, randomUUID(), "implicit_sole"); return; }
      catch { /* Preserve the completed candidate result for recovery and explicit selection. */ }
    }
    if (successes.length === 0 && status.items.length > 0 && status.items.every((item) => item.status === "failed")) {
      const ready = readyInputSchema.parse(status.batch.canonicalInput);
      await this.repositories.jobs.failItem({
        jobId: ready.jobId,
        itemId: ready.itemId,
        error: { kind: "transient", message: status.items[0]?.safeError?.message ?? "Every selected image agent failed." },
        finishedAtMs: Date.now(),
      });
    }
    await this.project(bookletId, card, "results", batchId);
  }

  private async materialize(bookletId: string, card: AgentRunCard, batch: ExecutionBatch, itemId: string, responseId: string, mode: "implicit_sole" | "explicit") {
    const status = await this.execution.status(batch.id); const item = status?.items.find((candidate) => candidate.id === itemId && candidate.status === "succeeded");
    if (!item || !item.canonicalResult || typeof item.canonicalResult !== "object" || !("assetId" in item.canonicalResult)) throw new Error("execution_result_invalid");
    if (!await this.repositories.execution.markSelected({ batchId: batch.id, itemId, responseId, mode, now: Date.now() })) throw new Error("execution_action_conflict");
    const ready = readyInputSchema.parse(batch.canonicalInput); const result = item.canonicalResult as { assetId: string; provider: string; model: string; providerRequestId: string | null; usage: unknown };
    const source = await this.repositories.assets.get(result.assetId); if (!source) throw new Error("Selected candidate asset is missing.");
    if (ready.target === "reference") {
      await this.repositories.jobs.completeItem({ jobId: ready.jobId, itemId: ready.itemId, primaryAssetId: source.id, assets: [], result: { sourceAssetId: source.id, request: ready.request, provider: result.provider, model: result.model, usage: result.usage, executionBatchId: batch.id }, finishedAtMs: Date.now() });
    } else {
      const bytes = Buffer.from(await (await this.store()).get(source.uri)); const composed = await composePage({ source: bytes, page: ready.page as Parameters<typeof composePage>[0]["page"], geometry: ready.request.geometry }); const composedId = randomUUID(); const uri = `${bookletId}/pages/composed/${ready.position}/${composedId}.png`; await (await this.store()).put(uri, composed.bytes, "image/png");
      await this.repositories.jobs.completeItem({ jobId: ready.jobId, itemId: ready.itemId, primaryAssetId: composedId, assets: [{ id: composedId, bookletId, kind: "page_composed", uri, mimeType: "image/png", width: composed.width, height: composed.height, sourceAssetId: source.id, metadata: { executionBatchId: batch.id, pageIndex: ready.position }, createdAtMs: Date.now() }], result: { sourceAssetId: source.id, composedAssetId: composedId, request: ready.request, provider: result.provider, model: result.model, usage: result.usage, executionBatchId: batch.id }, finishedAtMs: Date.now() });
    }
    await this.repositories.execution.completeMaterialization({ batchId: batch.id, assetId: source.id, now: Date.now() }); await this.project(bookletId, { ...card, status: "submitted" }, "completed", batch.id); await this.onMaterialized?.(ready);
  }

  public async recoverInterrupted(): Promise<string[]> {
    return this.execution.recoverInterrupted(
      ({ canonicalInput, agent, executionBatchId, executionItemId }) => this.execute(readyInputSchema.parse(canonicalInput), agent, executionBatchId, executionItemId),
      async (batchId) => {
        const batch = await this.repositories.execution.getBatch(batchId);
        if (batch) await this.completeOrShowResults(batch.bookletId, batch.cardId, batchId);
      },
      (batch) => Boolean(batch && batch.canonicalInput && typeof batch.canonicalInput === "object" && "kind" in batch.canonicalInput && (batch.canonicalInput as { kind?: unknown }).kind === "image"),
    );
  }
  public async start(bookletId: string, cardId: string, responseInput: unknown): Promise<CardResult> {
    const card = await this.requireCard(bookletId, cardId); const response = validateCardResponseValue(card, cardResponseSchema.parse(responseInput)); if (response.action !== "run_agents" || card.payload.state !== "ready") throw new Error("execution_action_invalid"); const stored = await this.repositories.conversation.getAgentRunReadyInput(bookletId, cardId); if (!stored) throw new Error("The saved Image Agent run input is no longer available."); const ready = readyInputSchema.parse(stored.input); const pool = await this.pools.resolve(executionTargetKeyForImage(ready.target), { hasImageInput: ready.request.references.length > 0 || ready.request.editTargetAssetId !== null }); if (pool.fingerprint !== card.payload.poolFingerprint) throw new Error("execution_pool_stale"); const selected = z.array(z.string().uuid()).parse(response.value);
    const batchId = await this.execution.start({ bookletId, cardId, targetKey: executionTargetKeyForImage(ready.target), subjectKind: "image", subjectId: ready.itemId, canonicalInput: ready, workflowFingerprint: stored.workflowFingerprint, schemaVersion: stored.schemaVersion, selectedAgentIds: selected, executor: ({ canonicalInput, agent, executionBatchId, executionItemId }) => this.execute(readyInputSchema.parse(canonicalInput), agent, executionBatchId, executionItemId), beforeRun: async (id) => { await this.database.collections.generation_items.updateOne({ _id: ready.itemId, jobId: ready.jobId }, { $set: { executionBatchId: id } }); await this.project(bookletId, card, "running", id); }, onTerminal: async (id) => this.completeOrShowResults(bookletId, cardId, id) });
    return this.result(`Image execution ${batchId} has started.`);
  }

  private async readyFromBatch(bookletId: string, card: AgentRunCard, batch: ExecutionBatch, createNewCard: boolean) {
    const ready = readyInputSchema.parse(batch.canonicalInput);
    const targetKey = executionTargetKeyForImage(ready.target);
    const pool = await this.pools.resolve(targetKey, { hasImageInput: ready.request.references.length > 0 || ready.request.editTargetAssetId !== null });
    if (!pool.candidates.length) throw new Error("execution_pool_unavailable");
    const preference = await this.repositories.execution.getPreference(bookletId, targetKey);
    const next: AgentRunCard = {
      ...card,
      cardId: createNewCard ? randomUUID() : card.cardId,
      status: "active",
      title: `Choose agents for ${card.payload.subjectLabel}`,
      explanation: "Choose one or more image agents for this item. Only the selected result will become current.",
      allowedActions: ["run_agents", "change_agents"],
      payload: { ...card.payload, state: "ready", batchId: null, poolFingerprint: pool.fingerprint, candidates: this.candidates(pool), selectedAgentIds: pool.candidates.length === 1 ? [pool.candidates[0]!.agentId] : preference ?? [], staleSelectionNotices: pool.notices, items: [], selectedItemId: null, selectionMode: null, history: [...card.payload.history, { batchId: batch.id, state: batch.status === "completed" ? ("completed" as const) : ("results" as const), selectedAgentName: null }].slice(-12) },
    };
    if (createNewCard) await this.repositories.conversation.persistAssistantCard({ bookletId, messageId: randomUUID(), narration: "Choose image agents to restart this item.", card: next, createdAtMs: Date.now(), readyInput: ready, readyInputSchemaVersion: "1", readyWorkflowFingerprint: batch.workflowFingerprint, readyPreviousBatchId: batch.id });
    else await this.repositories.conversation.updateAgentRunProjection({ bookletId, card: next, readyInput: ready, readyInputSchemaVersion: "1", readyWorkflowFingerprint: batch.workflowFingerprint, readyPreviousBatchId: batch.id, updatedAtMs: Date.now() });
  }

  public async changeAgents(bookletId: string, cardId: string, responseInput: unknown): Promise<CardResult> {
    const card = await this.requireCard(bookletId, cardId); const response = validateCardResponseValue(card, cardResponseSchema.parse(responseInput));
    if (response.action !== "change_agents" || card.payload.state !== "results" || !card.payload.batchId) throw new Error("execution_action_invalid");
    const batch = await this.repositories.execution.getBatch(card.payload.batchId); if (!batch || batch.status !== "results") throw new Error("execution_batch_not_terminal");
    await this.readyFromBatch(bookletId, card, batch, false); return this.result("Choose image agents for the next execution.");
  }

  public async restart(bookletId: string, cardId: string, responseInput: unknown): Promise<CardResult> {
    const card = await this.requireCard(bookletId, cardId); const response = validateCardResponseValue(card, cardResponseSchema.parse(responseInput));
    if (response.action !== "restart_with_agents" || !card.payload.batchId) throw new Error("execution_action_invalid");
    const batch = await this.repositories.execution.getBatch(card.payload.batchId); if (!batch || batch.status !== "completed") throw new Error("execution_restart_unavailable");
    await this.readyFromBatch(bookletId, card, batch, true); return this.result("Choose image agents to restart this item.");
  }
  public async select(bookletId: string, cardId: string, responseInput: unknown): Promise<CardResult> { const card = await this.requireCard(bookletId, cardId); const response = validateCardResponseValue(card, cardResponseSchema.parse(responseInput)); if (response.action !== "select_agent_result" || card.payload.state !== "results" || !card.payload.batchId) throw new Error("execution_action_invalid"); const status = await this.execution.status(card.payload.batchId); if (!status || status.batch.status !== "results") throw new Error("execution_batch_not_terminal"); await this.materialize(bookletId, card, status.batch, z.string().uuid().parse(response.value), response.responseId, "explicit"); return this.result("The selected image result was saved."); }
  public async retryFailed(bookletId: string, cardId: string, responseInput: unknown): Promise<CardResult> { const card = await this.requireCard(bookletId, cardId); const response = validateCardResponseValue(card, cardResponseSchema.parse(responseInput)); if (response.action !== "retry_failed_agents" || card.payload.state !== "results" || !card.payload.batchId) throw new Error("execution_action_invalid"); const batch = await this.repositories.execution.getBatch(card.payload.batchId); if (!batch) throw new Error("execution_batch_not_found"); await this.project(bookletId, card, "running", batch.id); await this.execution.retryFailed(batch.id, ({ canonicalInput, agent, executionBatchId, executionItemId }) => this.execute(readyInputSchema.parse(canonicalInput), agent, executionBatchId, executionItemId), async (id) => this.completeOrShowResults(bookletId, cardId, id)); return this.result("Failed image agents are retrying."); }
}
