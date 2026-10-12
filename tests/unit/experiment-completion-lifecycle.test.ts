import { expect, it } from "vitest";
import type { ExperimentOperationDocument } from "@/db/documents";
import { completionLifecycle, isRecoveredAttempt } from "@/lib/experiment-runner/completion-lifecycle";

const operation = { deadlineAtMs: 300_000, lifecycle: {
  startedAtMs: 0, lastProgressAtMs: 10, ownerId: "fixture", phase: "running",
} } as ExperimentOperationDocument;

it("keeps a late saved output separate from uninterrupted success", () => {
  expect(isRecoveredAttempt(operation, 300_000)).toBe(true);
  expect(completionLifecycle(operation, 300_001).lifecycle).toMatchObject({
    attemptOutcome: "failed", unresolved: false, recoveredAtMs: 300_001, timeoutAtMs: 300_000,
  });
});

it("preserves earlier failed attempt history when output is recovered", () => {
  const failed = { ...operation, lifecycle: { ...operation.lifecycle!, attemptOutcome: "failed" as const, endedAtMs: 100 } };
  expect(isRecoveredAttempt(failed, 200)).toBe(true);
  expect(completionLifecycle(failed, 200).lifecycle).toMatchObject({ attemptOutcome: "failed", endedAtMs: 100, recoveredAtMs: 200 });
  expect(completionLifecycle(failed, 200).lifecycle).not.toHaveProperty("timeoutAtMs");
});
