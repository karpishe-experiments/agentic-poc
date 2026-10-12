import { afterEach, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import type { BookletBinding } from "@/lib/experiment-runner/config";
import { createOperationCoordinator } from "@/lib/experiment-runner/lifecycle";
import type { WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const runId = id(950), bookletId = id(951), operationId = id(952), workflowRunId = id(953);
const binding: BookletBinding = { role: "manager", taskId: null, persona: null, appId: id(954),
  publishedWorkflowId: id(955), toolProviderId: null, apiKey: "fixture-only" };
const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

async function setup(taskId: string | null = id(956)) {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const repository = createExperimentRepository(database);
  const savedBinding = { role: binding.role, taskId: binding.taskId, appId: binding.appId,
    publishedWorkflowId: binding.publishedWorkflowId, toolProviderId: binding.toolProviderId };
  await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [savedBinding], nowMs: 1 });
  await repository.prepareOperation({ runId, operationId, expectedRevision: 0, role: "manager", taskId: null,
    subjectKind: "book", subjectId: bookletId, inputFingerprint: "a".repeat(64), attempt: 1, providerKind: "text", nowMs: 2 });
  const identity = { runId, operationId, workflowRunId, parentWorkflowRunId: null, nowMs: 4 };
  await repository.beginDispatch({ runId, operationId, parentWorkflowRunId: null, nowMs: 3 });
  await repository.recordDispatchIdentity({ ...identity, ...(taskId ? { workflowTaskId: taskId } : {}) });
  await repository.claimOperation(identity);
  const retrieve = vi.fn<WorkflowRuntime["retrieve"]>().mockResolvedValue({ kind: "unknown" });
  const stop = vi.fn<NonNullable<WorkflowRuntime["stop"]>>().mockResolvedValue({ kind: "unknown" });
  const runtime: WorkflowRuntime = { start: vi.fn().mockResolvedValue({ kind: "unknown" }), retrieve, stop };
  async function complete() {
    await repository.completeOperation({ envelope: { runId, operationId, workflowRunId,
      inputFingerprint: "a".repeat(64), result: { kind: "delegate", payload: { taskId: "J01", subjectKind: "book", subjectId: bookletId } } },
    parentWorkflowRunId: null, nowMs: 6 });
    await repository.verifyDispatchPublication({ ...identity, workflowId: binding.publishedWorkflowId, terminalSucceeded: true });
  }
  function coordinator(reconcile: Parameters<typeof createOperationCoordinator>[0]["reconcile"] = async () => undefined) {
    return createOperationCoordinator({ database, runtime, binding: () => binding, now: () => 10, reconcile });
  }
  return { database, repository, retrieve, stop, runtime, complete, coordinator };
}

it("reconciles saved successful output before considering stop", async () => {
  const fixture = await setup();
  const result = await fixture.coordinator(async () => fixture.complete()).inspect({ runId, operationId, stop: "manual" });
  expect(result).toMatchObject({ state: "succeeded", verifiedWorkflowId: binding.publishedWorkflowId });
  expect(fixture.stop).not.toHaveBeenCalled();
  expect((await fixture.repository.getRun(runId))?.pauseRequested).toBe(false);
});

it("does not treat local failure as evidence that a remote execution stopped", async () => {
  const fixture = await setup();
  await fixture.database.collections.experiment_operations.updateOne({ _id: operationId }, { $set: { state: "failed", safeFailure: "definite_failure" } });
  fixture.retrieve.mockResolvedValue({ kind: "execution", execution: { id: workflowRunId, workflow_id: binding.publishedWorkflowId, status: "running" } });
  const result = await fixture.coordinator().inspect({ runId, operationId, stop: "manual" });
  expect(fixture.stop).toHaveBeenCalledTimes(1);
  expect(result.lifecycle).toMatchObject({ unresolved: true, attemptOutcome: "failed" });
});

it("does not repeat a stop POST after unknown delivery, including a restarted coordinator", async () => {
  const fixture = await setup();
  const first = await fixture.coordinator().inspect({ runId, operationId, stop: "manual" });
  const second = await fixture.coordinator().inspect({ runId, operationId, stop: "manual" });
  expect(fixture.stop).toHaveBeenCalledTimes(1);
  expect(first.lifecycle).toMatchObject({ stop: { delivery: "unknown" }, unresolved: true, attemptOutcome: "failed" });
  expect(second.lifecycle?.stop).toEqual(first.lifecycle?.stop);
  expect(second).toMatchObject({ workflowRunId, reservationCount: 1, deadlineAtMs: 300_002 });
  expect((await fixture.repository.getRun(runId))?.pauseRequested).toBe(true);
});

it("retains ambiguous stop delivery when the stop request throws", async () => {
  const fixture = await setup();
  fixture.stop.mockRejectedValue(new Error("lost response"));
  await fixture.coordinator().inspect({ runId, operationId, stop: "deadline" });
  await fixture.coordinator().inspect({ runId, operationId, stop: "deadline" });
  expect(fixture.stop).toHaveBeenCalledTimes(1);
  expect((await fixture.repository.getOperation(operationId))?.lifecycle).toMatchObject({
    stop: { reason: "deadline", delivery: "unknown" }, unresolved: true,
  });
});

it("rejects a stale revision before lookup or stop", async () => {
  const fixture = await setup();
  await expect(fixture.coordinator().inspect({ runId, operationId, expectedRevision: -1, stop: "manual" }))
    .rejects.toMatchObject({ code: "stale_revision" });
  expect(fixture.retrieve).not.toHaveBeenCalled();
  expect(fixture.stop).not.toHaveBeenCalled();
});

it("rejects a different active operation before lookup or stop", async () => {
  const fixture = await setup();
  await fixture.database.collections.experiment_runs.updateOne({ _id: runId }, { $set: { activeOperationId: id(957) } });
  await expect(fixture.coordinator().inspect({ runId, operationId, stop: "manual" })).rejects.toMatchObject({ code: "conflict" });
  expect(fixture.retrieve).not.toHaveBeenCalled();
  expect(fixture.stop).not.toHaveBeenCalled();
});

it("records unsupported cancellation without inventing a task ID or definite outcome", async () => {
  const fixture = await setup(null);
  const result = await fixture.coordinator().inspect({ runId, operationId, stop: "manual" });
  expect(fixture.stop).not.toHaveBeenCalled();
  expect(result.lifecycle).toMatchObject({ stop: { delivery: "unsupported" }, unresolved: true });
  expect(result.state).toBe("started");
});

it("does not report success when the final reconciliation discovers a late callback conflict", async () => {
  const fixture = await setup();
  let observations = 0;
  const result = await fixture.coordinator(async () => {
    if (++observations !== 2) return;
    await fixture.complete();
    await fixture.repository.blockRun({ runId, category: "definite_failure", nowMs: 8 });
  }).inspect({ runId, operationId, stop: "manual" });
  expect(result.state).toBe("succeeded"); // Keep the saved callback output.
  expect(result.lifecycle).toMatchObject({ attemptOutcome: "failed", unresolved: true });
  expect((await fixture.repository.getRun(runId))?.safeFailure).toBe("definite_failure");
});

it("retains unknown lookup failures as blocked paused work without replaying stop", async () => {
  const fixture = await setup();
  fixture.retrieve.mockRejectedValue(new Error("lookup unavailable"));
  const result = await fixture.coordinator().inspect({ runId, operationId, stop: "manual" });
  expect(result.lifecycle).toMatchObject({ attemptOutcome: "failed", unresolved: true });
  expect(await fixture.repository.getRun(runId)).toMatchObject({ status: "blocked", pauseRequested: true,
    activeOperationId: operationId, safeFailure: "unknown_outcome" });
  await fixture.coordinator().inspect({ runId, operationId, stop: "manual" });
  expect(fixture.stop).toHaveBeenCalledTimes(1);
});

it("keeps a completion that arrives while cancellation loses its response", async () => {
  const fixture = await setup();
  fixture.stop.mockImplementationOnce(async () => {
    await fixture.complete();
    throw new Error("stop response lost");
  });
  const result = await fixture.coordinator().inspect({ runId, operationId, stop: "manual" });
  expect(result).toMatchObject({ state: "succeeded", verifiedWorkflowId: binding.publishedWorkflowId,
    lifecycle: { attemptOutcome: "succeeded", unresolved: false, stop: { delivery: "unknown" } } });
  expect((await fixture.repository.getRun(runId))?.safeFailure).toBeNull();
});

it("rechecks concurrent completion within the final outcome transaction", async () => {
  const fixture = await setup();
  const collection = fixture.database.collections.experiment_operations;
  const read = collection.findOne.bind(collection);
  let injected = false;
  vi.spyOn(collection, "findOne").mockImplementation(async (...args) => {
    const result = await read(...args);
    if (!injected && args[1]?.session && result?.lifecycle?.stop && result.lifecycle.phase === "reconciling") {
      injected = true;
      await fixture.complete();
    }
    return result;
  });
  try {
    const result = await fixture.coordinator().inspect({ runId, operationId, stop: "manual" });
    expect(injected).toBe(true);
    expect(result).toMatchObject({ state: "succeeded", lifecycle: { attemptOutcome: "succeeded", unresolved: false } });
    expect((await fixture.repository.getRun(runId))?.safeFailure).toBeNull();
  } finally { vi.restoreAllMocks(); }
});

it("rejects a manual stop when the observed revision changes during its claim", async () => {
  const fixture = await setup();
  const revision = (await fixture.repository.getRun(runId))!.revision;
  const collection = fixture.database.collections.experiment_operations;
  const read = collection.findOne.bind(collection);
  let injected = false;
  vi.spyOn(collection, "findOne").mockImplementation(async (...args) => {
    const result = await read(...args);
    if (!injected && args[1]?.session) {
      injected = true;
      await fixture.repository.pause({ runId, expectedRevision: revision, nowMs: 7 });
    }
    return result;
  });
  try {
    await expect(fixture.coordinator().inspect({ runId, operationId, expectedRevision: revision, stop: "manual" }))
      .rejects.toMatchObject({ code: "stale_revision" });
    expect(fixture.stop).not.toHaveBeenCalled();
    expect((await fixture.repository.getOperation(operationId))?.lifecycle?.stop).toBeUndefined();
  } finally { vi.restoreAllMocks(); }
});

it("initializes legacy lifecycle fully and preserves failed attempt history after late recovery", async () => {
  const fixture = await setup(null);
  await fixture.database.collections.experiment_operations.updateOne({ _id: operationId }, { $unset: { lifecycle: "" } });
  const failed = await fixture.coordinator().inspect({ runId, operationId, stop: "deadline" });
  expect(failed.lifecycle).toMatchObject({ startedAtMs: 3, lastProgressAtMs: 4, phase: "finished",
    attemptOutcome: "failed", unresolved: true, endedAtMs: 10 });
  expect(failed.lifecycle?.ownerId).toBeTruthy();
  await fixture.complete();
  const recovered = await fixture.coordinator().inspect({ runId, operationId, stop: "deadline" });
  expect(recovered.lifecycle).toMatchObject({ attemptOutcome: "failed", unresolved: false, endedAtMs: 10 });
  expect(recovered.lifecycle?.recoveredAtMs).toBeGreaterThanOrEqual(6);
  expect(recovered.lifecycle?.ownerId).toBe(failed.lifecycle?.ownerId);
});
