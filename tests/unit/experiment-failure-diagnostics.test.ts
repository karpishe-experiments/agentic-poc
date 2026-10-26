import { expect, it } from "vitest";
import { buildFailureDiagnostics, tagFailureReason } from "@/lib/experiment-runner/failure-diagnostics";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { OperationBudgetExpired } from "@/lib/operations/budget";

const input = { phase: "page_assembly" as const, startedAt: performance.now(), timestampMs: 1 };
it.each(["invalid_assets", "invalid_dependencies", "missing_approvals", "invalid_report_evidence", "unresolved_ownership", "invalid_accounting"] as const)(
  "records %s without copying exception text", reason => {
    const error = new ExperimentRepositoryError("invalid_state", "private prompt and credentials", reason);
    const result = buildFailureDiagnostics(error, input);
    expect(result).toMatchObject({ version: "failure_diagnostics_v1", reason, errorCategory: "validation" });
    expect(JSON.stringify(result)).not.toContain("private");
  });
it("preserves original error identity and classifies timeouts before tagged validation", () => {
  const error = new OperationBudgetExpired();
  tagFailureReason(error, "invalid_accounting");
  expect(buildFailureDiagnostics(error, input)).toMatchObject({ reason: "budget_timeout", errorCategory: "budget" });
  expect(buildFailureDiagnostics(Object.assign(new Error("private"), { name: "MongoOperationTimeoutError" }), input))
    .toMatchObject({ reason: "database_timeout", errorCategory: "database" });
  expect(buildFailureDiagnostics(new Error("invalid_assets"), input)).toMatchObject({ reason: "unclassified_failure" });
});
it("makes invalid optional diagnostic construction harmless", () => {
  expect(buildFailureDiagnostics(new Error(), { ...input, timestampMs: NaN })).toBeUndefined();
  expect(buildFailureDiagnostics({ get name() { throw new Error("private"); } }, input)).toBeUndefined();
});
