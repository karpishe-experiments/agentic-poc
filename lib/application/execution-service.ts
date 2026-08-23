import { randomUUID } from "node:crypto";
import type { Repositories } from "@/db/repositories";
import { startAgentRunBatch } from "@/db/agent-run-batch-start";
import { CandidatePoolService, type CandidatePool } from "@/lib/application/candidate-pool-service";
import type { AgentVersion } from "@/lib/contracts/agents";
import type { ExecutionTargetKey } from "@/lib/contracts/execution";
import type { GenUICard } from "@/lib/contracts/cards";

export type CandidateExecutor = (input: { canonicalInput: unknown; agent: AgentVersion; executionBatchId: string; executionItemId: string }) => Promise<{ result: unknown; summary: unknown; candidateAssetId?: string | null }>;
type TerminalHandler = (batchId: string) => Promise<void>;
const active = new Map<string, Promise<void>>();

export class ExecutionService {
  public constructor(private readonly repositories: Repositories, private readonly pools: CandidatePoolService) {}

  private launch(batchId: string, executor: CandidateExecutor, onTerminal?: TerminalHandler): void {
    if (active.has(batchId)) return;
    const running = this.run(batchId, executor);
    active.set(batchId, running);
    void running.finally(async () => {
      active.delete(batchId);
      await onTerminal?.(batchId);
    }).catch(() => undefined);
  }

  public async start(input: { bookletId: string; cardId: string; targetKey: ExecutionTargetKey; subjectKind: string; subjectId: string; canonicalInput: unknown; workflowFingerprint: unknown; schemaVersion: string; selectedAgentIds: string[]; pool: CandidatePool; previousBatchId?: string | null; runningCard: Extract<GenUICard, { family: "agent_run" }>; expectedCardRevision: number; executor: CandidateExecutor; afterStart?: (batchId: string) => Promise<void>; onTerminal?: TerminalHandler }): Promise<string> {
    const pool = input.pool;
    if (!pool.candidates.length) throw new Error("execution_pool_unavailable");
    const selected = pool.candidates.filter((candidate) => input.selectedAgentIds.includes(candidate.agentId));
    if (!selected.length || selected.length !== new Set(input.selectedAgentIds).size) throw new Error("execution_pool_stale");
    const id = randomUUID();
    const runningCard = { ...input.runningCard, payload: { ...input.runningCard.payload, batchId: id } };
    const started = await startAgentRunBatch(this.repositories.database, {
        id, bookletId: input.bookletId, cardId: input.cardId, targetKey: input.targetKey, subjectKind: input.subjectKind, subjectId: input.subjectId,
        previousBatchId: input.previousBatchId ?? null, poolFingerprint: pool.fingerprint, canonicalInput: input.canonicalInput, workflowFingerprint: input.workflowFingerprint,
        schemaVersion: input.schemaVersion, resultChoicePolicy: pool.candidates.length === 1 ? "implicit_sole" : "explicit", selectedAgentIds: pool.candidates.length === 1 ? [] : selected.map((candidate) => candidate.agentId),
        agents: selected.map((candidate) => ({ agentId: candidate.agentId, agentVersionId: candidate.id, profileId: candidate.profileId!, profileVersion: candidate.profileVersion!, agentSnapshot: candidate, profileSnapshot: { profileId: candidate.profileId, profileVersion: candidate.profileVersion, provider: candidate.provider, modelId: candidate.modelId } })),
        runningCard, expectedCardRevision: input.expectedCardRevision, now: Date.now(),
    });
    if (!started) throw new Error("execution_action_conflict");
    try {
      await input.afterStart?.(id);
    } catch (error) {
      this.launch(id, input.executor, input.onTerminal);
      throw error;
    }
    this.launch(id, input.executor, input.onTerminal);
    return id;
  }
  public async run(batchId: string, executor: CandidateExecutor): Promise<void> {
    const batch = await this.repositories.execution.getBatch(batchId);
    if (!batch) return;
    const items = await this.repositories.execution.getItems(batchId);
    await Promise.allSettled(items.filter((item) => item.status === "queued").map(async (item) => {
      const claimed = await this.repositories.execution.claimQueued(batchId, item.id, Date.now());
      if (!claimed) return;
      const agent = await this.repositories.agents.getVersion(claimed.agentVersionId);
      if (!agent) return this.repositories.execution.failItem({ batchId, itemId: claimed.id, kind: "configuration", message: "The frozen candidate version is unavailable.", now: Date.now() });
      try {
        const output = await executor({ canonicalInput: batch.canonicalInput, agent, executionBatchId: batchId, executionItemId: claimed.id });
        await this.repositories.execution.finishItem({ batchId, itemId: claimed.id, result: output.result, summary: output.summary, candidateAssetId: output.candidateAssetId ?? null, now: Date.now() });
      } catch (error) {
        await this.repositories.execution.failItem({ batchId, itemId: claimed.id, kind: "execution", message: error instanceof Error ? error.message.slice(0, 500) : "Candidate execution failed.", now: Date.now() });
      }
    }));
  }

  public async recoverInterrupted(executor: CandidateExecutor, onTerminal?: TerminalHandler, accepts?: (batch: Awaited<ReturnType<Repositories["execution"]["getBatch"]>>) => boolean): Promise<string[]> {
    const batchIds = await this.repositories.execution.recoverInterrupted(Date.now());
    const accepted: string[] = [];
    for (const batchId of batchIds) {
      const batch = await this.repositories.execution.getBatch(batchId);
      if (!batch || (accepts && !accepts(batch))) continue;
      accepted.push(batchId);
      this.launch(batchId, executor, onTerminal);
    }
    return accepted;
  }
  public async retryFailed(batchId: string, executor: CandidateExecutor, onTerminal?: TerminalHandler): Promise<void> {
    await this.repositories.execution.retryFailed(batchId, Date.now());
    this.launch(batchId, executor, onTerminal);
  }

  public async status(batchId: string) {
    const [batch, items] = await Promise.all([this.repositories.execution.getBatch(batchId), this.repositories.execution.getItems(batchId)]);
    return batch ? { batch, items } : null;
  }
}
