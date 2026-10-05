import { afterEach, describe, expect, it } from "vitest";
import type { Document } from "mongodb";
import type { MongoDatabaseContext } from "@/db/client";
import { verifyExperimentMaintenanceIdle, verifyStoppedStagingMaintenance } from "@/db/experiment-maintenance";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const databases: MongoDatabaseContext[] = [];
type LedgerFixture = Document & { _id: string };
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
async function database() {
  const context = await createTestDatabase({ seedAgents: false });
  databases.push(context);
  return context;
}

describe("persisted experiment maintenance readiness", () => {
  it.each([
    ["prepared", { state: "prepared" }],
    ["started", { state: "started" }],
    ["unknown", { state: "unknown" }],
    ["expired image claim", { state: "failed", imageCompletionClaim: { id: "lease", digest: "a", expiresAtMs: 0 } }],
    ["unverified dispatched success", { state: "succeeded", dispatchStartedAtMs: 1, verifiedWorkflowId: null }],
    ["missing publication field", { state: "succeeded", dispatchStartedAtMs: 1 }],
  ])("rejects orphaned %s without depending on run status", async (_name, record) => {
    const context = await database();
    await context.database.collection<LedgerFixture>("experiment_operations").insertOne({ _id: "orphan", ...record });
    await expect(verifyExperimentMaintenanceIdle(context)).rejects.toThrow("reconcile");
  });
  it.each([
    { status: "paused", activeOperationId: "saved-op", safeFailure: null },
    { status: "blocked", activeOperationId: null, safeFailure: "unknown_outcome" },
  ])("rejects a retained active/uncertain run %j", async (record) => {
    const context = await database();
    await context.database.collection<LedgerFixture>("experiment_runs").insertOne({ _id: "run", ...record });
    await expect(verifyExperimentMaintenanceIdle(context)).rejects.toThrow("reconcile");
  });
  it("permits idle paused/queued runs and resolved historical failures", async () => {
    const context = await database();
    await context.database.collection<LedgerFixture>("experiment_runs").insertMany([
      { _id: "queued", bookletId: "queued-book", status: "queued", activeOperationId: null, safeFailure: null },
      { _id: "paused", bookletId: "paused-book", status: "paused", activeOperationId: null, safeFailure: null },
      { _id: "failed", bookletId: "failed-book", status: "failed", activeOperationId: null, safeFailure: "definite_failure" },
    ]);
    await context.database.collection<LedgerFixture>("experiment_operations").insertMany([
      { _id: "failed", runId: "failed-run", idempotencyKey: "failed-op", state: "failed", imageCompletionClaim: null },
      { _id: "verified", runId: "verified-run", idempotencyKey: "verified-op", state: "succeeded", dispatchStartedAtMs: 1, verifiedWorkflowId: "publication" },
    ]);
    await verifyExperimentMaintenanceIdle(context);
  });
  it("catches work admitted between preflight and closure", async () => {
    const context = await database();
    await verifyExperimentMaintenanceIdle(context);
    await context.database.collection<LedgerFixture>("deployment_control").insertOne({ _id: "control", environment: "_staging", maintenance: true, activeMutations: 0 });
    await context.database.collection<LedgerFixture>("experiment_operations").insertOne({ _id: "racing", state: "started" });
    await expect(verifyStoppedStagingMaintenance(context)).rejects.toThrow("reconcile");
  });
});
