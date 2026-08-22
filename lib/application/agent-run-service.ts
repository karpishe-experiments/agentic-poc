import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createRepositories, type Repositories } from "@/db/repositories";
import { getDatabase, type Database } from "@/db/client";
import { CandidatePoolService } from "@/lib/application/candidate-pool-service";
import { CandidateExecutionService } from "@/lib/application/candidate-execution-service";
import { ExecutionService } from "@/lib/application/execution-service";
import { TextResultMaterializer } from "@/lib/application/text-result-materializer";
import { executionTargetKeyForSkill, type ExecutionBatch } from "@/lib/contracts/execution";
import { cardResponseSchema, validateCardResponseValue, type GenUICard } from "@/lib/contracts/cards";
import { skillContextSchema, skillIdSchema } from "@/lib/contracts/skills";

const readyInputSchema = z.object({ kind: z.literal("text"), skillId: skillIdSchema, skillInput: z.unknown(), context: skillContextSchema, subjectKind: z.literal("text"), subjectId: z.string().min(1) });
type AgentRunCard = Extract<GenUICard, { family: "agent_run" }>;
type CardResult = { kind: "saved"; duplicate: false; followupRequired: false; summary: string; refreshRequired: true };

export class AgentRunService {
  private readonly repositories: Repositories;
  private readonly pools: CandidatePoolService;
  private readonly executor: CandidateExecutionService;
  private readonly execution: ExecutionService;
  private readonly materializer: TextResultMaterializer;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; runtimeMode?: "fake" | "real"; pools?: CandidatePoolService; executor?: CandidateExecutionService; execution?: ExecutionService; materializer?: TextResultMaterializer } = {}) {
    const database = dependencies.database ?? dependencies.repositories?.database ?? getDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
    const runtimeMode = dependencies.runtimeMode ?? (process.env.MODEL_RUNTIME === "real" ? "real" : "fake");
    this.pools = dependencies.pools ?? new CandidatePoolService(this.repositories, runtimeMode);
    this.executor = dependencies.executor ?? new CandidateExecutionService({ database, repositories: this.repositories, runtimeMode });
    this.execution = dependencies.execution ?? new ExecutionService(this.repositories, this.pools);
    this.materializer = dependencies.materializer ?? new TextResultMaterializer({ database });
  }

  public async recoverInterrupted(): Promise<string[]> {
    return this.execution.recoverInterrupted(
      ({ canonicalInput, agent, executionBatchId, executionItemId }) => this.execute(canonicalInput, agent, executionBatchId, executionItemId),
      async (batchId) => {
        const batch = await this.repositories.execution.getBatch(batchId);
        if (batch) await this.completeOrShowResults(batch.bookletId, batch.cardId, batchId);
      },
      (batch) => !batch || !(batch.canonicalInput && typeof batch.canonicalInput === "object" && "kind" in batch.canonicalInput && (batch.canonicalInput as { kind?: unknown }).kind === "image"),
    );
  }
  private result(summary: string): CardResult { return { kind: "saved", duplicate: false, followupRequired: false, summary, refreshRequired: true }; }
  private actionsFor(state: AgentRunCard["payload"]["state"]): AgentRunCard["allowedActions"] {
    if (state === "ready") return ["run_agents", "change_agents"];
    if (state === "results") return ["select_agent_result", "retry_failed_agents", "change_agents"];
    if (state === "completed") return ["restart_with_agents"];
    return [];
  }

  private async requireCard(bookletId: string, cardId: string): Promise<AgentRunCard> {
    const card = await this.repositories.conversation.getCard(bookletId, cardId);
    if (!card || card.family !== "agent_run") throw new Error("The Agent run card was not found.");
    return card;
  }

  private candidates(pool: Awaited<ReturnType<CandidatePoolService["resolve"]>>) {
    return pool.candidates.map((candidate) => ({ agentId: candidate.agentId, agentVersionId: candidate.id, displayName: candidate.displayName, purpose: candidate.purpose, profileSummary: `${candidate.profileId} · ${candidate.modelId}`, eligible: true }));
  }

  private async project(bookletId: string, card: AgentRunCard, state: AgentRunCard["payload"]["state"], batchId: string | null, ready?: { input?: unknown | null; schemaVersion?: string | null; workflowFingerprint?: unknown | null; previousBatchId?: string | null }) {
    const status = batchId ? await this.execution.status(batchId) : null;
    const names = new Map(card.payload.candidates.map((candidate) => [candidate.agentId, candidate.displayName]));
    const hasFailedItems = (status?.items ?? []).some((item) => item.status === "failed");
    const next: AgentRunCard = {
      ...card,
      allowedActions: state === "results" && !hasFailedItems ? ["select_agent_result", "change_agents"] : this.actionsFor(state),
      payload: {
        ...card.payload,
        state,
        batchId,
        items: (status?.items ?? []).map((item) => ({
          itemId: item.id,
          agentId: item.agentId,
          displayName: names.get(item.agentId) ?? item.agentId,
          status: item.status,
          elapsedMs: item.startedAt ? Math.max(0, Date.now() - Date.parse(item.startedAt)) : 0,
          attemptCount: item.attemptCount,
          summary: typeof item.resultSummary === "string" ? item.resultSummary : item.resultSummary ? "Validated candidate result" : null,
          safeError: item.safeError?.message ?? null,
          candidateAssetId: item.candidateAssetId,
        })),
        selectedItemId: status?.batch.selectedItemId ?? null,
        selectionMode: status?.batch.selectionMode ?? null,
      },
    };
    await this.repositories.conversation.updateAgentRunProjection({
      bookletId,
      card: next,
      readyInput: ready?.input,
      readyInputSchemaVersion: ready?.schemaVersion,
      readyWorkflowFingerprint: ready?.workflowFingerprint,
      readyPreviousBatchId: ready?.previousBatchId,
      updatedAtMs: Date.now(),
    });
    return next;
  }

  private execute(canonicalInput: unknown, agent: Parameters<CandidateExecutionService["executeText"]>[0]["agent"], executionBatchId?: string, executionItemId?: string) {
    const input = readyInputSchema.parse(canonicalInput);
    return this.executor.executeText({ agent, skillId: input.skillId, skillInput: input.skillInput, context: input.context, executionBatchId, executionItemId });
  }

  private async completeOrShowResults(bookletId: string, cardId: string, batchId: string) {
    const [card, status] = await Promise.all([this.repositories.conversation.getCard(bookletId, cardId), this.execution.status(batchId)]);
    if (!card || card.family !== "agent_run" || !status) return;
    const successful = status.items.filter((item) => item.status === "succeeded" && item.canonicalResult !== null);
    if (status.batch.resultChoicePolicy === "implicit_sole" && successful.length === 1) {
      try {
        await this.materializeSelection(bookletId, card, status.batch, successful[0]!.id, randomUUID(), "implicit_sole");
        return;
      } catch {
        // Keep a recoverable result card when a valid candidate needs a different creator decision.
      }
    }
    await this.project(bookletId, card, "results", batchId);
  }

  private async materializeSelection(bookletId: string, card: AgentRunCard, batch: ExecutionBatch, itemId: string, responseId: string, mode: "implicit_sole" | "explicit") {
    const status = await this.execution.status(batch.id);
    const item = status?.items.find((candidate) => candidate.id === itemId && candidate.status === "succeeded");
    if (!item || item.canonicalResult === null) throw new Error("execution_result_invalid");
    const selected = await this.repositories.execution.markSelected({ batchId: batch.id, itemId, responseId, mode, now: Date.now() });
    if (!selected) throw new Error("execution_action_conflict");
    const input = readyInputSchema.parse(batch.canonicalInput);
    const materialized = await this.materializer.materialize({ bookletId, skillId: input.skillId, result: item.canonicalResult, sourceExecutionBatchId: batch.id });
    await this.repositories.execution.completeMaterialization({ batchId: batch.id, now: Date.now() });
    await this.repositories.conversation.persistAssistantCard({ bookletId, messageId: randomUUID(), narration: materialized.narration, card: materialized.card, createdAtMs: Date.now() });
    await this.project(bookletId, { ...card, status: "submitted" }, "completed", batch.id);
  }

  public async start(bookletId: string, cardId: string, responseInput: unknown): Promise<CardResult> {
    const card = await this.requireCard(bookletId, cardId);
    const response = validateCardResponseValue(card, cardResponseSchema.parse(responseInput));
    if (response.action !== "run_agents" || card.payload.state !== "ready") throw new Error("execution_action_invalid");
    const ready = await this.repositories.conversation.getAgentRunReadyInput(bookletId, cardId);
    if (!ready) throw new Error("The saved Agent run input is no longer available.");
    const input = readyInputSchema.parse(ready.input);
    const targetKey = executionTargetKeyForSkill(input.skillId);
    if (card.payload.target !== targetKey) throw new Error("The Agent run target no longer matches its saved input.");
    const pool = await this.pools.resolve(targetKey);
    if (pool.fingerprint !== card.payload.poolFingerprint) throw new Error("execution_pool_stale");
    const selectedAgentIds = z.array(z.string().uuid()).parse(response.value);
    const batchId = await this.execution.start({
      bookletId, cardId, targetKey, subjectKind: input.subjectKind, subjectId: input.subjectId,
      canonicalInput: input, workflowFingerprint: ready.workflowFingerprint, schemaVersion: ready.schemaVersion,
      selectedAgentIds, previousBatchId: ready.previousBatchId,
      executor: ({ canonicalInput, agent, executionBatchId, executionItemId }) => this.execute(canonicalInput, agent, executionBatchId, executionItemId),
      beforeRun: async (id) => {
        const running: AgentRunCard = { ...card, payload: { ...card.payload, state: "running", batchId: id, selectedAgentIds, items: [], selectedItemId: null, selectionMode: null } };
        await this.repositories.conversation.updateAgentRunProjection({ bookletId, card: running, readyInput: null, readyInputSchemaVersion: null, readyWorkflowFingerprint: null, readyPreviousBatchId: null, updatedAtMs: Date.now() });
      },
      onTerminal: async (id) => this.completeOrShowResults(bookletId, cardId, id),
    });
    return this.result(`Agent execution ${batchId} has started.`);
  }

  public async select(bookletId: string, cardId: string, responseInput: unknown): Promise<CardResult> {
    const card = await this.requireCard(bookletId, cardId);
    const response = validateCardResponseValue(card, cardResponseSchema.parse(responseInput));
    if (response.action !== "select_agent_result" || card.payload.state !== "results" || !card.payload.batchId) throw new Error("execution_action_invalid");
    const status = await this.execution.status(card.payload.batchId);
    if (!status || status.batch.status !== "results" || status.items.some((item) => item.status === "queued" || item.status === "running")) throw new Error("execution_batch_not_terminal");
    await this.materializeSelection(bookletId, card, status.batch, z.string().uuid().parse(response.value), response.responseId, "explicit");
    return this.result("The selected agent result was saved.");
  }

  public async retryFailed(bookletId: string, cardId: string, responseInput: unknown): Promise<CardResult> {
    const card = await this.requireCard(bookletId, cardId);
    const response = validateCardResponseValue(card, cardResponseSchema.parse(responseInput));
    if (response.action !== "retry_failed_agents" || card.payload.state !== "results" || !card.payload.batchId) throw new Error("execution_action_invalid");
    const status = await this.execution.status(card.payload.batchId);
    if (!status || status.batch.status !== "results" || !status.items.some((item) => item.status === "failed")) throw new Error("execution_retry_unavailable");
    await this.project(bookletId, card, "running", status.batch.id);
    await this.execution.retryFailed(
      status.batch.id,
      ({ canonicalInput, agent, executionBatchId, executionItemId }) => this.execute(canonicalInput, agent, executionBatchId, executionItemId),
      async (batchId) => this.completeOrShowResults(bookletId, cardId, batchId),
    );    return this.result("Failed agents are retrying.");
  }

  private async readyFromBatch(bookletId: string, card: AgentRunCard, batch: ExecutionBatch, createNewCard: boolean): Promise<AgentRunCard> {
    const input = readyInputSchema.parse(batch.canonicalInput);
    const targetKey = executionTargetKeyForSkill(input.skillId);
    const pool = await this.pools.resolve(targetKey);
    if (!pool.candidates.length) throw new Error("execution_pool_unavailable");
    const preference = await this.repositories.execution.getPreference(bookletId, targetKey);
    const next: AgentRunCard = {
      ...card,
      cardId: createNewCard ? randomUUID() : card.cardId,
      status: "active",
      title: "Choose agents for this step",
      explanation: "Your saved team will be used for this step. You can change it before running.",
      allowedActions: ["run_agents", "change_agents"],
      payload: {
        ...card.payload,
        state: "ready", batchId: null, poolFingerprint: pool.fingerprint, candidates: this.candidates(pool),
        selectedAgentIds: pool.candidates.length === 1 ? [pool.candidates[0]!.agentId] : preference ?? [],
        staleSelectionNotices: pool.notices, items: [], selectedItemId: null, selectionMode: null,
        history: [...card.payload.history, { batchId: batch.id, state: batch.status === "completed" ? ("completed" as const) : ("results" as const), selectedAgentName: null }].slice(-12),
      },
    };
    const ready = { input, schemaVersion: batch.schemaVersion, workflowFingerprint: batch.workflowFingerprint, previousBatchId: batch.id };
    if (createNewCard) {
      await this.repositories.conversation.persistAssistantCard({ bookletId, messageId: randomUUID(), narration: "Choose agents to run this step again.", card: next, createdAtMs: Date.now(), readyInput: ready.input, readyInputSchemaVersion: ready.schemaVersion, readyWorkflowFingerprint: ready.workflowFingerprint, readyPreviousBatchId: ready.previousBatchId });
    } else {
      await this.repositories.conversation.updateAgentRunProjection({ bookletId, card: next, readyInput: ready.input, readyInputSchemaVersion: ready.schemaVersion, readyWorkflowFingerprint: ready.workflowFingerprint, readyPreviousBatchId: ready.previousBatchId, updatedAtMs: Date.now() });
    }
    return next;
  }

  public async changeAgents(bookletId: string, cardId: string, responseInput: unknown): Promise<CardResult> {
    const card = await this.requireCard(bookletId, cardId);
    const response = validateCardResponseValue(card, cardResponseSchema.parse(responseInput));
    if (response.action !== "change_agents" || card.payload.state !== "results" || !card.payload.batchId) throw new Error("execution_action_invalid");
    const batch = await this.repositories.execution.getBatch(card.payload.batchId);
    if (!batch || batch.status !== "results") throw new Error("execution_batch_not_terminal");
    await this.readyFromBatch(bookletId, card, batch, false);
    return this.result("Choose agents for the next execution.");
  }

  public async restart(bookletId: string, cardId: string, responseInput: unknown): Promise<CardResult> {
    const card = await this.requireCard(bookletId, cardId);
    const response = validateCardResponseValue(card, cardResponseSchema.parse(responseInput));
    if (response.action !== "restart_with_agents" || !card.payload.batchId) throw new Error("execution_action_invalid");
    const batch = await this.repositories.execution.getBatch(card.payload.batchId);
    if (!batch || batch.status !== "completed") throw new Error("execution_restart_unavailable");
    await this.readyFromBatch(bookletId, card, batch, true);
    return this.result("Choose agents to restart this step.");
  }
}
