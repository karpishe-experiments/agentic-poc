import { operationBudgetRemainingMs } from "@/lib/operations/budget";

type Identity = { runId: string; operationId: string };
export type CleanupOutcome = "completed" | "unresolved";
export type CompletionStage = "completion_transaction" | "completion_readback" | "completion_progress";
const cleanup = new WeakMap<object, CleanupOutcome>();
const kinds = new Set(["CampaignAdmissionError", "ExperimentRepositoryError", "MongoOperationTimeoutError", "MongoNetworkError", "MongoServerError",
  "MongoServerSelectionError", "AbortError", "OperationBudgetExpired"]);
const codes = new Set(["invalid_input", "not_found", "conflict", "stale_revision", "invalid_state", "invalid_result"]);
export function safeFailure(error: unknown) {
  const value = error as { name?: unknown; code?: unknown } | null;
  return { errorKind: typeof value?.name === "string" && kinds.has(value.name) ? value.name : "Error",
    code: typeof value?.code === "string" && codes.has(value.code) ? `repository_${value.code}` : "completion_failed" };
}
export const budgetRemaining = operationBudgetRemainingMs;
export function reportCleanup(identity: Identity, outcome: CleanupOutcome, error?: unknown) {
  if (error && typeof error === "object") cleanup.set(error, outcome);
  console.info(JSON.stringify({ event: "booklet_claim_cleanup", runId: identity.runId, operationId: identity.operationId,
    cleanupOutcome: outcome, ...safeFailure(error) }));
}
export class CompletionReconciliationError extends Error {
  readonly diagnostic: ReturnType<typeof safeFailure> & { stage: CompletionStage; elapsedMs: number;
    remainingBudgetMs: number | null; cleanupOutcome?: CleanupOutcome; commitState: "unknown" | "uncommitted" | "committed" };
  constructor(error: unknown, stage: CompletionStage, startedAt: number, commitState: "unknown" | "uncommitted" | "committed") {
    super("Completion reconciliation requires inspection.", { cause: error });
    this.name = "CompletionReconciliationError";
    this.diagnostic = { ...safeFailure(error), stage, elapsedMs: Math.round(performance.now() - startedAt),
      remainingBudgetMs: budgetRemaining(), ...(error && typeof error === "object" && cleanup.has(error)
        ? { cleanupOutcome: cleanup.get(error)! } : {}), commitState };
  }
}
