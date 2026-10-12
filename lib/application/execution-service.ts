import { randomUUID } from "node:crypto";
import type { Repositories } from "@/db/repositories";
import { startAgentRunBatch } from "@/db/agent-run-batch-start";
import { CandidatePoolService, type CandidatePool } from "@/lib/application/candidate-pool-service";
import type { AgentVersion } from "@/lib/contracts/agents";
import type { ExecutionTargetKey } from "@/lib/contracts/execution";
import type { GenUICard } from "@/lib/contracts/cards";
import { assertOperationBudget, OperationBudgetExpired, OPERATION_LIMIT_MS, withOperationBudget } from "@/lib/operations/budget";

export type CandidateExecutor = (input: { canonicalInput: unknown; agent: AgentVersion; executionBatchId: string; executionItemId: string }) => Promise<{ result: unknown; summary: unknown; candidateAssetId?: string | null }>;
type TerminalHandler = (batchId: string) => Promise<void>;
const active = new Map<string, Promise<void>>();
class FrozenCandidateUnavailable extends Error {}

function safeFailure(error: unknown): { kind: string; message: string } {
  if (error instanceof FrozenCandidateUnavailable) return { kind: "configuration", message: "The frozen candidate version is unavailable." };
  if (error instanceof OperationBudgetExpired) return { kind: "unknown", message: "The candidate timed out before its outcome could be confirmed. Inspect saved output before retrying." };
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError" || error.cause instanceof OperationBudgetExpired)) return { kind: "unknown", message: "The candidate timed out before its outcome could be confirmed. Inspect saved output before retrying." };
  return { kind: "execution", message: "The candidate failed before its outcome could be confirmed." };
}

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
      try {
        const startedAtMs = claimed.startedAt ? Date.parse(claimed.startedAt) : NaN;
        if (!Number.isFinite(startedAtMs)) throw new Error("The claimed candidate has no valid persisted start time.");
        await withOperationBudget(startedAtMs + OPERATION_LIMIT_MS, async () => {
          const agent = await this.repositories.agents.getVersion(claimed.agentVersionId);
          assertOperationBudget();
          if (!agent) throw new FrozenCandidateUnavailable();
          const output = await executor({ canonicalInput: batch.canonicalInput, agent, executionBatchId: batchId, executionItemId: claimed.id });
          assertOperationBudget();
          await this.repositories.execution.finishItem({ batchId, itemId: claimed.id, result: output.result, summary: output.summary, candidateAssetId: output.candidateAssetId ?? null, now: Date.now() });
        });
      } catch (error) {
        const saved = (await this.repositories.execution.getItems(batchId)).find((candidate) => candidate.id === claimed.id);
        if (saved?.status === "succeeded" && saved.canonicalResult !== null) return;
        const failure = safeFailure(error);
        await this.repositories.execution.failItem({ batchId, itemId: claimed.id, kind: failure.kind, message: failure.message, now: Date.now() });
      }
    }));
  }

  public async recoverInterrupted(executor: CandidateExecutor, onTerminal?: TerminalHandler, accepts?: (batch: Awaited<ReturnType<Repositories["execution"]["getBatch"]>>) => boolean, recoveredBatchIds?: readonly string[]): Promise<string[]> {
    // Bootstrap supplies one shared reconciliation result to text and image
    // handlers. A second repository sweep can reset work the first handler
    // already claimed.
    const batchIds = recoveredBatchIds ? [...recoveredBatchIds] : await this.repositories.execution.recoverInterrupted(Date.now());
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
