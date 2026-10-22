import { z } from "zod";
import type { ExperimentRunDocument } from "@/db/documents";
import { opaqueIdSchema } from "@/lib/contracts/common";

// A control acknowledgement contains no artifact history or provider payloads.
export const controlStateSchema = z.object({
  runId: opaqueIdSchema,
  revision: z.number().int().nonnegative(),
  status: z.enum(["queued", "running", "paused", "blocked", "completed", "failed"]),
  pauseRequested: z.boolean(),
  generationStatus: z.enum(["in_progress", "complete"]),
  evaluationStatus: z.enum(["pending", "running", "complete", "failed"]),
  updatedAtMs: z.number().finite(),
  safeFailure: z.enum(["limit_exhausted", "unknown_outcome", "definite_failure"]).nullable(),
  activeOperationId: z.string().nullable(),
  preparation: z.object({ identity: z.string(), startedAtMs: z.number(), deadlineAtMs: z.number(), unresolved: z.boolean() }).nullable(),
});
export type ControlState = z.infer<typeof controlStateSchema>;

export const controlStateProjection = {
  _id: 1, revision: 1, status: 1, pauseRequested: 1, generationCompletedAtMs: 1,
  evaluationStatus: 1, updatedAtMs: 1, safeFailure: 1, activeOperationId: 1, preparation: 1,
} as const;

export function controlState(row: Pick<ExperimentRunDocument, keyof typeof controlStateProjection>): ControlState {
  return {
    runId: row._id, revision: row.revision, status: row.status, pauseRequested: row.pauseRequested,
    generationStatus: row.generationCompletedAtMs != null ? "complete" : "in_progress",
    evaluationStatus: row.evaluationStatus, updatedAtMs: row.updatedAtMs,
    safeFailure: row.safeFailure, activeOperationId: row.activeOperationId,
    preparation: row.preparation ? { identity: row.preparation.ownerId, startedAtMs: row.preparation.startedAtMs,
      deadlineAtMs: row.preparation.deadlineAtMs, unresolved: row.preparation.unresolved ?? false } : null,
  };
}
