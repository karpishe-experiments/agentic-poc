import type { safeFailure } from "@/lib/operations/completion-failure";

export type AdmissionReadPhase = "selection" | "proofs" | "plan";
export type AdmissionReadMetrics = { checkoutCount: number; checkoutFailed: number; checkoutMs: number;
  commands: { phase: AdmissionReadPhase | null; command: "find" | "getMore" | "explain";
    elapsedMs: number; outcome: "succeeded" | "failed"; batchRows: number | null }[]; droppedCommands: number };
export type AdmissionReadDiagnostic = { runId: string; persona: "playful_kid" | "enthusiast_parent"; part: "proofs" | "plan";
  compression: { state: "configured"; requested: "zlib"; negotiated: "unavailable" };
  value: { rows: number | null; decodedJsonBytes: number | null; queryElapsedMs: number | null;
    plan: { scan: "collection" | "index" | "unavailable"; returned: number | null; documentsExamined: number | null;
      keysExamined: number | null; executionMs: number | null } | null } | null;
  metrics: AdmissionReadMetrics; metricsStatus: "observed" | "unavailable";
  failure?: ReturnType<typeof safeFailure>; elapsedMs: number; totalElapsedMs: number };
