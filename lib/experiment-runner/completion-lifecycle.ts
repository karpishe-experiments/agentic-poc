import type { ExperimentOperationDocument } from "@/db/documents";

export function isRecoveredAttempt(operation: ExperimentOperationDocument, nowMs: number) {
  return operation.lifecycle?.attemptOutcome === "failed" ||
    operation.deadlineAtMs != null && nowMs >= operation.deadlineAtMs;
}

/** Saved output can recover an expired attempt, but cannot erase its history. */
export function completionLifecycle(operation: ExperimentOperationDocument, nowMs: number) {
  if (!operation.lifecycle) return {};
  const late = isRecoveredAttempt(operation, nowMs);
  return { lifecycle: {
    ...operation.lifecycle, phase: "finished" as const, lastProgressAtMs: nowMs,
    attemptOutcome: late ? "failed" as const : "succeeded" as const,
    unresolved: false, endedAtMs: operation.lifecycle.endedAtMs ?? nowMs,
    ...(late ? { recoveredAtMs: nowMs } : {}),
    ...(operation.deadlineAtMs !== null && nowMs >= operation.deadlineAtMs ? { timeoutAtMs: operation.lifecycle.timeoutAtMs ?? operation.deadlineAtMs } : {}),
  } };
}
