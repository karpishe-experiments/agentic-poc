import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";

export const failureReasonSchema = z.enum(["invalid_assets", "invalid_dependencies", "missing_approvals",
  "invalid_report_evidence", "unresolved_ownership", "invalid_accounting", "database_timeout", "budget_timeout", "unclassified_failure"]);
export type FailureReason = z.infer<typeof failureReasonSchema>;
export const failureDiagnosticsSchema = z.strictObject({
  version: z.literal("failure_diagnostics_v1"), runRevision: z.number().int().nonnegative(), timestampMs: z.number().int().nonnegative(),
  phase: z.enum(["page_assembly", "generation_verification", "evaluation_completion"]), operationId: opaqueIdSchema.nullable(),
  reason: failureReasonSchema, errorCategory: z.enum(["validation", "database", "budget", "unknown"]),
  elapsedMs: z.number().nonnegative().nullable(), remainingBudgetMs: z.number().nonnegative().nullable(),
});
export type FailureDiagnostics = z.infer<typeof failureDiagnosticsSchema>;
export const failureReasonLabels: Record<FailureReason, string> = {
  invalid_assets: "Saved image evidence is missing or invalid.",
  invalid_dependencies: "Saved sources or dependencies are no longer valid.",
  missing_approvals: "Required current approvals are missing.",
  invalid_report_evidence: "Saved evaluation evidence is invalid.",
  unresolved_ownership: "Work ownership remains unresolved.",
  invalid_accounting: "Saved accounting could not be verified.",
  database_timeout: "A database operation exceeded its time budget.",
  budget_timeout: "The operation time budget expired.",
  unclassified_failure: "The operation failed without a classified reason.",
};
