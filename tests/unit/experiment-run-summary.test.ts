import { describe, expect, it } from "vitest";
import { runAttention, runTiming } from "@/lib/experiment-runner/run-summary";

describe("run summary presentation", () => {
  it("keeps completion timing stable after later updates and does not guess historical completion", () => {
    expect(runTiming({ status: "completed", createdAtMs: 1000, terminalAtMs: 31000 }, 90000)).toEqual({
      startedAtMs: 1000, terminalAtMs: 31000, elapsedMs: 30000, confidence: "recorded" });
    expect(runTiming({ status: "completed", createdAtMs: 1000 }, 90000).elapsedMs).toBeNull();
    expect(runTiming({ status: "failed", createdAtMs: 1000, terminalAtMs: 900 }, 90000).confidence).toBe("unavailable");
    expect(runTiming({ status: "running", createdAtMs: Number.NaN }, 90000).elapsedMs).toBeNull();
  });

  it("includes approval/manual pause time in elapsed wall time", () => {
    expect(runTiming({ status: "paused", createdAtMs: 1000 }, 61000)).toEqual({
      startedAtMs: 1000, terminalAtMs: null, elapsedMs: 60000, confidence: "live" });
  });

  it("never presents a historical stop as a current blocker", () => {
    const failureDiagnostics = { version: "failure_diagnostics_v1" as const, runRevision: 2,
      timestampMs: 1000, phase: "page_assembly" as const, operationId: null, reason: "invalid_assets" as const,
      errorCategory: "validation" as const, elapsedMs: null, remainingBudgetMs: null };
    expect(runAttention({ status: "completed", revision: 3, failureDiagnostics })).toBeNull();
    expect(runAttention({ status: "blocked", revision: 3, failureDiagnostics })?.explanation).toBe("Reason details unavailable.");
    expect(runAttention({ status: "blocked", revision: 2, failureDiagnostics })?.explanation).toMatch(/image evidence/i);
    expect(runAttention({ status: "blocked", safeFailure: "unknown_outcome" })?.kind).toBe("reconcile");
  });
  it("routes a pending allowance to operator review instead of ordinary resume", () => {
    expect(runAttention({ status: "paused", pendingApproval: { reason: "monetary" } })).toEqual({
      kind: "approval", explanation: "Operator allowance review required: monetary.", action: "open_run" });
  });
});
