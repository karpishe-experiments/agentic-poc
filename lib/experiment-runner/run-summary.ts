import { failureReasonLabels, type FailureDiagnostics } from "@/lib/contracts/experiment-failure";

export type RunTiming = {
  startedAtMs: number | null;
  terminalAtMs: number | null;
  elapsedMs: number | null;
  confidence: "recorded" | "live" | "unavailable";
};
export type RunAttention = {
  kind: "reconcile" | "inspect" | "paused";
  explanation: string;
  action: "open_run" | "resume";
} | null;
type TimingSource = { status?: string; createdAtMs?: number; terminalAtMs?: number | null };
const timestamp = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) &&
  Number.isFinite(new Date(value).getTime());

export function runTiming(run: TimingSource, nowMs = Date.now()): RunTiming {
  const startedAtMs = timestamp(run.createdAtMs) ? run.createdAtMs : null;
  const terminal = run.status === "completed" || run.status === "failed";
  const terminalAtMs = terminal && timestamp(run.terminalAtMs) && (startedAtMs == null || run.terminalAtMs >= startedAtMs)
    ? run.terminalAtMs : null;
  const end = terminal ? terminalAtMs : timestamp(nowMs) ? nowMs : null;
  const elapsedMs = startedAtMs != null && end != null && end >= startedAtMs ? end - startedAtMs : null;
  return { startedAtMs, terminalAtMs, elapsedMs,
    confidence: elapsedMs == null ? "unavailable" : terminal ? "recorded" : "live" };
}

export function runAttention(run: { status?: string; revision?: number; safeFailure?: string | null;
  failureDiagnostics?: FailureDiagnostics | null; activeOperationId?: string | null;
  preparation?: { unresolved?: boolean } | null }): RunAttention {
  if (run.safeFailure === "unknown_outcome" || run.preparation?.unresolved) return {
    kind: "reconcile", explanation: "A previous operation is unresolved. Inspect its saved result before continuing.", action: "open_run" };
  if (run.status === "blocked" || run.status === "failed") return {
    kind: "inspect", explanation: run.failureDiagnostics?.runRevision === run.revision && run.failureDiagnostics
      ? failureReasonLabels[run.failureDiagnostics.reason] : "Reason details unavailable.", action: "open_run" };
  if (run.status === "paused") return { kind: "paused", explanation: run.activeOperationId
    ? "The run is paused; current work may still be finishing." : "The run is paused and can be resumed.",
    action: run.activeOperationId ? "open_run" : "resume" };
  return null;
}
