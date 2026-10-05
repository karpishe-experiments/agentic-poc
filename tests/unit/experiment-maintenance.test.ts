import { describe, expect, it, vi } from "vitest";
import type { MongoDatabaseContext } from "@/db/client";
import { verifyExperimentMaintenanceIdle, verifyStoppedStagingMaintenance } from "@/db/experiment-maintenance";

function fixture(runs = 0, operations = 0, control: unknown = { maintenance: true, activeMutations: 0 }) {
  const runCount = vi.fn().mockResolvedValue(runs);
  const operationCount = vi.fn().mockResolvedValue(operations);
  const findControl = vi.fn().mockResolvedValue(control);
  const context = { collections: {
    experiment_runs: { countDocuments: runCount }, experiment_operations: { countDocuments: operationCount },
    deployment_control: { findOne: findControl },
  } } as unknown as MongoDatabaseContext;
  return { context, runCount, operationCount, findControl };
}

describe("experiment maintenance admission", () => {
  it("checks orphan operations, unknown outcomes, claims and publication evidence", async () => {
    const { context, runCount, operationCount } = fixture();
    await verifyExperimentMaintenanceIdle(context);
    expect(runCount).toHaveBeenCalledWith({ $or: [
      { activeOperationId: { $exists: true, $ne: null } }, { safeFailure: "unknown_outcome" },
    ] });
    expect(operationCount).toHaveBeenCalledWith({ $or: [
      { state: { $in: ["prepared", "started", "unknown"] } },
      { imageCompletionClaim: { $exists: true, $ne: null } },
      { state: "succeeded", dispatchStartedAtMs: { $exists: true, $ne: null }, verifiedWorkflowId: null },
    ] });
  });
  it.each([[1, 0], [0, 1]])("rejects unresolved runs=%s operations=%s", async (runs, operations) => {
    await expect(verifyExperimentMaintenanceIdle(fixture(runs, operations).context)).rejects.toThrow("reconcile");
  });
  it.each([null, { maintenance: false, activeMutations: 0 }, { maintenance: true, activeMutations: -1 }, { maintenance: true, activeMutations: 1 }])("does not infer stopped maintenance from %j", async (control) => {
    await expect(verifyStoppedStagingMaintenance(fixture(0, 0, control).context)).rejects.toThrow("exactly zero");
  });
  it("rechecks the ledger after recorded admission closure", async () => {
    const { context, findControl } = fixture(0, 1);
    await expect(verifyStoppedStagingMaintenance(context)).rejects.toThrow("reconcile");
    expect(findControl).toHaveBeenCalledWith({ environment: "_staging" });
  });
});
