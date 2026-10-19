import { afterEach, expect, it, vi } from "vitest";
import { withOperationBudget, OperationBudgetExpired } from "@/lib/operations/budget";
import { CompletionReconciliationError, reportCleanup } from "@/lib/operations/completion-failure";
afterEach(() => vi.restoreAllMocks());
it("retains sanitized original failure and cleanup outcome within the inspection budget", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const original = Object.assign(new Error("private prompt or credentials"), { name: "ExperimentRepositoryError", code: "invalid_result" });
  await withOperationBudget(Date.now() + 20_000, async () => {
    const identity = { runId: "run", operationId: "op", result: { content: "private result" }, apiKey: "private credential" };
    reportCleanup(identity, "unresolved", original);
    const error = new CompletionReconciliationError(original, "completion_transaction", performance.now(), "unknown");
    expect(error.cause).toBe(original);
    expect(error.diagnostic).toMatchObject({ code: "repository_invalid_result", errorKind: "ExperimentRepositoryError", cleanupOutcome: "unresolved" });
    expect(error.diagnostic.remainingBudgetMs).toBeGreaterThan(0);
    expect(error.diagnostic.remainingBudgetMs).toBeLessThanOrEqual(20_000);
    expect(JSON.stringify(error.diagnostic)).not.toContain("private");
  });
  expect(JSON.stringify(log.mock.calls)).not.toContain("private");
});
it("reports zero budget and a known expiry without exposing arbitrary error codes", async () => {
  const controller = new AbortController();
  await expect(withOperationBudget(Date.now() + 20_000, async () => {
    const original = Object.assign(new OperationBudgetExpired(), { code: "private-value" });
    controller.abort(original);
    expect(new CompletionReconciliationError(original, "completion_transaction", performance.now(), "unknown").diagnostic)
      .toMatchObject({ remainingBudgetMs: 0, errorKind: "OperationBudgetExpired", code: "completion_failed" });
  }, { signal: controller.signal })).rejects.toBeInstanceOf(OperationBudgetExpired);
});
