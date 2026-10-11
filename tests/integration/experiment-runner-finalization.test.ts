import { afterEach, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { materializeNarrativeResult } from "@/db/experiment-narrative";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

vi.mock("@/db/experiment-narrative", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/db/experiment-narrative")>();
  return { ...original, materializeNarrativeResult: vi.fn(original.materializeNarrativeResult) };
});

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const runId = id(900), bookletId = id(901), operationId = id(902), workflowRunId = id(903);
let database: Database | undefined;
afterEach(async () => {
  if (database) await closeTestDatabase(database);
  database = undefined;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function setup() {
  database = await createTestDatabase({ seedAgents: false });
  const repository = createExperimentRepository(database);
  await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 });
  await repository.prepareOperation({ runId, operationId, expectedRevision: 0, role: "manager", taskId: null,
    subjectKind: "book", subjectId: bookletId, inputFingerprint: "a".repeat(64), attempt: 1, providerKind: "text", nowMs: 2 });
  const claim = { runId, operationId, workflowRunId, parentWorkflowRunId: null, nowMs: 3 };
  await repository.beginDispatch(claimWithoutWorkflow(claim));
  await repository.recordDispatchIdentity(claim);
  await repository.claimOperation(claim);
  const completion = { envelope: { runId, operationId, workflowRunId,
    inputFingerprint: "a".repeat(64), result: { kind: "delegate", payload: { taskId: "J01", subjectKind: "book", subjectId: bookletId } } },
  parentWorkflowRunId: null, nowMs: 5 };
  return { repository, completion };
}

it("does not restart text finalization when polling overlaps its transaction", async () => {
  const { repository, completion } = await setup();
  const original = await vi.importActual<typeof import("@/db/experiment-narrative")>("@/db/experiment-narrative");
  vi.mocked(materializeNarrativeResult).mockImplementationOnce(async (...args) => {
    // The completion transaction has read its operation. A due observation used
    // to write that same document and force the entire materialization to retry.
    await repository.beginObservation(operationId, 6);
    await repository.requestObservation(operationId);
    return original.materializeNarrativeResult(...args);
  });
  const result = await repository.completeOperation(completion);
  expect(result.operation.state).toBe("succeeded");
  expect(materializeNarrativeResult).toHaveBeenCalledTimes(1);
  expect(result.operation).toMatchObject({ workflowRunId, reservationCount: 1, deadlineAtMs: 600_003 });
  expect((await repository.getRun(runId))?.counters.steps).toBe(1);
  expect(result.operation.resultFinalizationClaim).toBeNull();
  expect((await repository.completeOperation(completion)).reused).toBe(true);
});

it("suppresses both observer writes during a retained lease and recovers after expiry", async () => {
  const { repository, completion } = await setup();
  await database!.collections.experiment_operations.updateOne({ _id: operationId }, { $set: {
    resultFinalizationClaim: { id: id(909), expiresAtMs: 100 }, nextObservationAtMs: 4,
  } });
  const restarted = createExperimentRepository(database!);
  expect(await restarted.beginObservation(operationId, 99)).toBeNull();
  await restarted.requestObservation(operationId);
  expect((await restarted.getOperation(operationId))?.nextObservationAtMs).toBe(4);
  await expect(restarted.completeOperation({ ...completion, nowMs: 99 })).rejects.toMatchObject({ code: "conflict" });
  expect(materializeNarrativeResult).not.toHaveBeenCalled();
  expect((await restarted.getOperation(operationId))?.resultFinalizationClaim?.id).toBe(id(909));
  expect(await restarted.beginObservation(operationId, 100)).not.toBeNull();
  expect((await restarted.completeOperation({ ...completion, nowMs: 101 })).operation).toMatchObject({
    state: "succeeded", workflowRunId, reservationCount: 1, deadlineAtMs: 600_003, resultFinalizationClaim: null,
  });
  expect((await repository.getRun(runId))?.counters.steps).toBe(1);
});

it("rejects concurrent saves before materialization and releases the lease on validation failure", async () => {
  const { repository, completion } = await setup();
  const original = await vi.importActual<typeof import("@/db/experiment-narrative")>("@/db/experiment-narrative");
  vi.mocked(materializeNarrativeResult).mockImplementationOnce(async (...args) => {
    await expect(repository.completeOperation(completion)).rejects.toMatchObject({ code: "conflict" });
    return original.materializeNarrativeResult(...args);
  });
  await expect(repository.completeOperation({ ...completion, envelope: { ...completion.envelope,
    workflowRunId: id(999) } })).rejects.toMatchObject({ code: "conflict" });
  expect((await repository.getOperation(operationId))?.resultFinalizationClaim).toBeUndefined();
  await expect(repository.completeOperation({ ...completion, envelope: { ...completion.envelope,
    result: { kind: "proposal", payload: { taskId: "J01", content: {} } } } })).rejects.toMatchObject({ code: "invalid_result" });
  expect((await repository.getOperation(operationId))?.resultFinalizationClaim).toBeNull();
  expect((await repository.completeOperation(completion)).operation.state).toBe("succeeded");
  expect(materializeNarrativeResult).toHaveBeenCalledTimes(1);
});

it("does not commit a finalization whose lease expired during source work", async () => {
  const { repository, completion } = await setup();
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  const original = await vi.importActual<typeof import("@/db/experiment-narrative")>("@/db/experiment-narrative");
  vi.mocked(materializeNarrativeResult).mockImplementationOnce(async (...args) => {
    const result = await original.materializeNarrativeResult(...args);
    clock.mockReturnValue(60_000);
    return result;
  });
  await expect(repository.completeOperation(completion)).rejects.toMatchObject({ code: "conflict" });
  expect(await repository.getOperation(operationId)).toMatchObject({ state: "started", resultJson: null,
    resultFinalizationClaim: null, workflowRunId, reservationCount: 1, deadlineAtMs: 600_003 });
  expect((await repository.getRun(runId))?.activeDelegationId).toBeNull();
  expect(await database!.collections.experiment_delegations.countDocuments()).toBe(0);
});

function claimWithoutWorkflow(claim: { runId: string; operationId: string; nowMs: number; parentWorkflowRunId: null }) {
  return { runId: claim.runId, operationId: claim.operationId, parentWorkflowRunId: claim.parentWorkflowRunId, nowMs: claim.nowMs };
}
