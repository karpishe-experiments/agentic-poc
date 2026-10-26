import { OperationBudgetExpired, operationBudgetRemainingMs } from "@/lib/operations/budget";

export type RecoveryPhase = "reservation" | "database_dump" | "inventory" | "asset_copy" | "archive_upload" | "manifest" | "completion_marker" | "backup_verification" | "restore";
export type RecoveryObjectCategory = "reservation" | "asset" | "archive" | "manifest" | "completion_marker" | "unspecified";
export type RecoveryMeasurement = { phase: RecoveryPhase; action: "phase" | "read" | "write" | "verification_read"; category?: RecoveryObjectCategory; ordinal?: number; expectedBytes?: number };
type RecordValue = { version: "recovery_transfer_v1"; phase: RecoveryPhase; action: RecoveryMeasurement["action"]; category: RecoveryObjectCategory; ordinal: number | null; expectedBytes: number | null; completedBytes: number | null; elapsedMs: number; remainingBudgetMs: number | null; outcome: "started" | "success" | "failure"; failureCategory: "deadline_expired" | "aborted" | "storage_failure" | null };

/** Fixed metadata only. The sink must never receive object keys, content or errors. */
export class RecoveryDiagnostics {
  constructor(private readonly sink: (record: RecordValue) => void = (record) => console.error(JSON.stringify(record))) {}
  async measure<T>(metadata: RecoveryMeasurement, work: () => Promise<T>, bytes?: (result: T) => number): Promise<T> {
    const started = Date.now();
    const emit = (outcome: RecordValue["outcome"], completedBytes: number | null, error?: unknown) => {
      try {
        const remaining = operationBudgetRemainingMs();
        this.sink({ version: "recovery_transfer_v1", phase: metadata.phase, action: metadata.action,
          category: metadata.category ?? "unspecified", ordinal: metadata.ordinal ?? null,
          expectedBytes: metadata.expectedBytes ?? null, completedBytes, elapsedMs: Math.max(0, Date.now() - started),
          remainingBudgetMs: remaining, outcome, failureCategory: outcome !== "failure" ? null :
            error instanceof OperationBudgetExpired || remaining === 0 ? "deadline_expired" :
              error instanceof Error && error.name === "AbortError" ? "aborted" : "storage_failure" });
      } catch { /* Measurements cannot replace the original operation result. */ }
    };
    emit("started", null);
    try {
      const result = await work();
      let completedBytes: number | null = null;
      try { completedBytes = bytes?.(result) ?? null; } catch { /* Best effort. */ }
      emit("success", completedBytes);
      return result;
    } catch (error) { emit("failure", null, error); throw error; }
  }
}
