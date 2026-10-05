import type { MongoDatabaseContext } from "@/db/client";

// Check before closing admission and again after stop. Maintenance rejects
// callbacks, so waiting for these records only after closure can prevent recovery.
export async function verifyExperimentMaintenanceIdle(context: MongoDatabaseContext): Promise<void> {
  const [runs, operations] = await Promise.all([
    context.collections.experiment_runs.countDocuments({ $or: [
      { activeOperationId: { $exists: true, $ne: null } },
      { safeFailure: "unknown_outcome" },
    ] }),
    context.collections.experiment_operations.countDocuments({ $or: [
      { state: { $in: ["prepared", "started", "unknown"] } },
      { imageCompletionClaim: { $exists: true, $ne: null } },
      { state: "succeeded", dispatchStartedAtMs: { $exists: true, $ne: null }, verifiedWorkflowId: null },
    ] }),
  ]);
  if (runs || operations) throw new Error("Experiment work is unresolved; reconcile saved operations before index maintenance.");
}

export async function verifyStoppedStagingMaintenance(context: MongoDatabaseContext): Promise<void> {
  const control = await context.collections.deployment_control.findOne({ environment: "_staging" });
  if (!control || control.maintenance !== true || control.activeMutations !== 0) {
    throw new Error("Index retirement requires recorded staging maintenance and exactly zero active mutations.");
  }
  await verifyExperimentMaintenanceIdle(context);
}
