import { failureDiagnosticsSchema, failureReasonSchema, type FailureDiagnostics, type FailureReason } from "@/lib/contracts/experiment-failure";
import { budgetRemaining, safeFailure } from "@/lib/operations/completion-failure";

// Attach a classification without changing exception identity or control flow.
const reasons = new WeakMap<object, FailureReason>();
export function tagFailureReason(error: unknown, reason: FailureReason): void {
  if (error && typeof error === "object" && !reasons.has(error)) reasons.set(error, reason);
}

export function buildFailureDiagnostics(error: unknown, input: {
  phase: FailureDiagnostics["phase"]; operationId?: string | null; startedAt: number; timestampMs: number;
}): Omit<FailureDiagnostics, "runRevision"> | undefined {
  try {
    const safe = safeFailure(error);
    const candidate = error as { failureReason?: unknown } | null;
    const origin = failureReasonSchema.safeParse(candidate?.failureReason);
    const reason: FailureReason = safe.errorKind === "OperationBudgetExpired" ? "budget_timeout" :
      ["MongoOperationTimeoutError", "MongoServerSelectionError"].includes(safe.errorKind) ? "database_timeout" :
      error && typeof error === "object" && reasons.has(error) ? reasons.get(error)! :
      origin.success ? origin.data : "unclassified_failure";
    const parsed = failureDiagnosticsSchema.safeParse({ version: "failure_diagnostics_v1", runRevision: 0,
      timestampMs: input.timestampMs, phase: input.phase, operationId: input.operationId ?? null, reason,
      errorCategory: reason === "budget_timeout" ? "budget" : reason === "database_timeout" ? "database" :
        reason === "unclassified_failure" ? "unknown" : "validation",
      elapsedMs: Math.max(0, Math.round(performance.now() - input.startedAt)), remainingBudgetMs: budgetRemaining(),
    });
    if (!parsed.success) return undefined;
    const { runRevision: _revision, ...diagnostic } = parsed.data;
    void _revision;
    return diagnostic;
  } catch { return undefined; }
}
