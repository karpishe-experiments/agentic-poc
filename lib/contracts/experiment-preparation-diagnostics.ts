import type { AdmissionReadMetrics } from "@/lib/contracts/experiment-admission-diagnostics";
import type { safeFailure } from "@/lib/operations/completion-failure";

export type PreparationReadPart = "questions" | "manager";
export type PreparationReadComparison = { rows: number; returnedJsonBytes: number; elapsedMs: number };
export type PreparationReadDiagnostic = {
  runId: string; campaignId: string; failureOperationId: string; runRevision: number | null;
  part: PreparationReadPart;
  reads: Record<string, { original: PreparationReadComparison; projected: PreparationReadComparison; equivalent: boolean }>;
  metrics: AdmissionReadMetrics; metricsStatus: "observed" | "unavailable";
  failure?: ReturnType<typeof safeFailure>; elapsedMs: number; totalElapsedMs: number;
};
