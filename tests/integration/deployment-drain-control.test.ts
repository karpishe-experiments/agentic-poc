import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { finishDraining, readDeploymentControl, resetActiveMutationsForSingleTaskStartup,
  runTrackedMutation, setDrainingMode, setMaintenanceMode } from "@/lib/application/deployment-control";
import { reconcileEndedMutations, reconcileInterruptedMutations } from "@/lib/application/deployment-control";

const holder = vi.hoisted(() => ({ database: null as Database | null }));
vi.mock("@/db/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/db/client")>(),
  getDatabase: () => { if (!holder.database) throw new Error("Fixture database missing"); return holder.database; },
}));
vi.mock("@/lib/config/env", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/config/env")>(),
  getServerEnv: () => ({ DEPLOYMENT_ENV: "_staging" }),
}));

beforeEach(async () => {
  vi.stubEnv("DEPLOYMENT_ENV", "_staging");
  holder.database = await createTestDatabase({ seedAgents: false });
  await setMaintenanceMode(false, null);
});
afterEach(async () => {
  if (holder.database) await closeTestDatabase(holder.database);
  holder.database = null;
  vi.unstubAllEnvs();
});

it("rejects new work during drain but admits and tracks an existing callback", async () => {
  await setDrainingMode("fixture drain");
  const newWork = vi.fn(async () => "unexpected");
  await expect(runTrackedMutation(newWork)).rejects.toMatchObject({ code: "deployment_maintenance" });
  expect(newWork).not.toHaveBeenCalled();
  expect(await runTrackedMutation(async () => {
    expect((await readDeploymentControl()).activeMutations).toBe(1);
    expect(await finishDraining()).toBe(false);
    return "callback saved";
  }, { admitted: true })).toBe("callback saved");
  expect(await readDeploymentControl()).toMatchObject({ draining: true, maintenance: false, activeMutations: 0 });
});

it.each([false, true])("rejects work in maintenance even with admitted=%s", async (admitted) => {
  await setMaintenanceMode(true, "fixture maintenance");
  const work = vi.fn(async () => undefined);
  await expect(runTrackedMutation(work, { admitted })).rejects.toMatchObject({ code: "deployment_maintenance" });
  expect(work).not.toHaveBeenCalled();
  expect((await readDeploymentControl()).activeMutations).toBe(0);
});

it("enters maintenance only after a draining zero-count CAS", async () => {
  expect(await finishDraining()).toBe(false);
  await setDrainingMode("fixture drain");
  await holder.database!.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { activeMutations: 1 } });
  expect(await finishDraining()).toBe(false);
  await holder.database!.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { activeMutations: 0, interruptedMutations: 1 } });
  expect(await finishDraining()).toBe(false);
  await holder.database!.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { interruptedMutations: 0 } });
  expect(await finishDraining()).toBe(true);
  expect(await readDeploymentControl()).toMatchObject({ maintenance: true, draining: false, activeMutations: 0, interruptedMutations: 0 });
  expect(await finishDraining()).toBe(false);
});

it("retains interrupted startup mutations visibly and does not accumulate them twice", async () => {
  await setDrainingMode("fixture drain");
  await holder.database!.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { activeMutations: 2, interruptedMutations: 1 } });
  await resetActiveMutationsForSingleTaskStartup();
  expect(await readDeploymentControl()).toMatchObject({ activeMutations: 0, interruptedMutations: 3, draining: true });
  await resetActiveMutationsForSingleTaskStartup();
  expect(await readDeploymentControl()).toMatchObject({ activeMutations: 0, interruptedMutations: 3 });
  expect(await finishDraining()).toBe(false);
});

it("releases a tracked callback count when its handler fails", async () => {
  await setDrainingMode("fixture drain");
  await expect(runTrackedMutation(async () => { throw new Error("fixture failure"); }, { admitted: true }))
    .rejects.toThrow("fixture failure");
  expect((await readDeploymentControl()).activeMutations).toBe(0);
  expect(await finishDraining()).toBe(true);
});

it("retains dead mutation identities and releases only proven exact output owners", async () => {
  const collection = holder.database!.collections.deployment_control;
  await collection.updateOne({ environment: "_staging" }, { $set: { activeMutations: 2, mutationOwners: [
    { id: "known", processId: "dead", startedAtMs: 1, runId: "run", operationId: "operation", state: "active" },
    { id: "unidentified", processId: "dead", startedAtMs: 1, state: "active" },
  ] } });
  await resetActiveMutationsForSingleTaskStartup();
  expect(await readDeploymentControl()).toMatchObject({ activeMutations: 0, interruptedMutations: 0,
    mutationOwners: [{ id: "known", state: "interrupted" }, { id: "unidentified", state: "interrupted" }] });
  await reconcileInterruptedMutations();
  expect((await readDeploymentControl()).mutationOwners).toHaveLength(2);
  // The saved operation fixture has only the fields read by this reconciler.
  await holder.database!.database.collection<{ _id: string; runId: string; state: string; verifiedWorkflowId: string; resultJson: string; materializationJson: string }>("experiment_operations").insertOne({ _id: "operation", runId: "run",
    state: "succeeded", verifiedWorkflowId: "publication", resultJson: "{}", materializationJson: "{}" });
  await reconcileInterruptedMutations();
  expect((await readDeploymentControl()).mutationOwners).toMatchObject([{ id: "unidentified", state: "interrupted" }]);
  await setDrainingMode("fixture drain");
  expect(await finishDraining()).toBe(false);
});

it.each(["pending", "unknown"])("releases a proven recovered output owner after %s stop delivery", async delivery => {
  await holder.database!.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: {
    mutationOwners: [{ id: "recovered", processId: "dead", startedAtMs: 1, state: "interrupted", runId: "run", operationId: "operation" },
      { id: "unrelated", processId: "dead", startedAtMs: 1, state: "interrupted" }],
  } });
  await holder.database!.database.collection<{ _id: string; runId: string; state: string; verifiedWorkflowId: string; resultJson: string; materializationJson: string; lifecycle: object }>("experiment_operations").insertOne({ _id: "operation", runId: "run",
    state: "succeeded", verifiedWorkflowId: "publication", resultJson: "{}", materializationJson: "{}",
    lifecycle: { unresolved: false, attemptOutcome: "failed", stop: { delivery } } });
  await reconcileInterruptedMutations();
  expect((await readDeploymentControl()).mutationOwners).toMatchObject([{ id: "unrelated" }]);
  expect(await holder.database!.collections.experiment_operations.findOne({ _id: "operation" }))
    .toMatchObject({ lifecycle: { attemptOutcome: "failed", stop: { delivery } } });
});

it("records mutation ownership and does not reset the live process during startup checks", async () => {
  await runTrackedMutation(async () => {
    const control = await readDeploymentControl();
    expect(control.mutationOwners).toMatchObject([{ runId: "run", operationId: "operation", state: "active" }]);
    await resetActiveMutationsForSingleTaskStartup();
    expect((await readDeploymentControl()).activeMutations).toBe(1);
  }, { admitted: true, runId: "run", operationId: "operation" });
  expect((await readDeploymentControl()).mutationOwners).toEqual([]);
});

it("retains local terminal failure while the remote execution is still running", async () => {
  await holder.database!.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: {
    mutationOwners: [{ id: "failed-owner", processId: "dead", startedAtMs: 1, state: "interrupted", runId: "run", operationId: "failed-op" }],
  } });
  await holder.database!.database.collection<{ _id: string; runId: string; state: string; safeFailure: string; dispatchStartedAtMs: number; remoteStatus: string }>("experiment_operations")
    .insertOne({ _id: "failed-op", runId: "run", state: "failed", safeFailure: "definite_failure", dispatchStartedAtMs: 2, remoteStatus: "running" });
  await reconcileInterruptedMutations();
  expect((await readDeploymentControl()).mutationOwners).toHaveLength(1);
  await holder.database!.collections.experiment_operations.updateOne({ _id: "failed-op" }, { $set: { remoteStatus: "stopped" } });
  await reconcileInterruptedMutations();
  expect((await readDeploymentControl()).mutationOwners).toHaveLength(0);
});

it("recovers a unique operation committed before the interrupted owner binding", async () => {
  await holder.database!.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: {
    mutationOwners: [{ id: "advance-owner", processId: "dead", startedAtMs: 10, interruptedAtMs: 20, state: "interrupted", runId: "run" }],
  } });
  await holder.database!.database.collection<{ _id: string; runId: string; createdAtMs: number; state: string; verifiedWorkflowId: string; resultJson: string; materializationJson: string }>("experiment_operations")
    .insertOne({ _id: "prepared-op", runId: "run", createdAtMs: 15, state: "succeeded", verifiedWorkflowId: "publication", resultJson: "{}", materializationJson: "{}" });
  await reconcileInterruptedMutations();
  expect((await readDeploymentControl()).mutationOwners).toHaveLength(0);
  await setDrainingMode("fixture drain");
  expect(await finishDraining()).toBe(true);
});

it("recovers an exact settled local mutation after a transient cleanup failure without restart", async () => {
  const collection = holder.database!.collections.deployment_control;
  const cleanup = vi.spyOn(collection, "updateOne").mockRejectedValueOnce(new Error("transient cleanup failure"));
  await expect(runTrackedMutation(async () => "saved", { admitted: true, runId: "run" })).rejects.toThrow("transient cleanup failure");
  cleanup.mockRestore();
  expect((await readDeploymentControl()).activeMutations).toBe(1);
  await reconcileEndedMutations();
  expect(await readDeploymentControl()).toMatchObject({ activeMutations: 0, mutationOwners: [] });
  await reconcileEndedMutations();
  expect((await readDeploymentControl()).activeMutations).toBe(0);
  await setDrainingMode("fixture drain");
  expect(await finishDraining()).toBe(true);
});
