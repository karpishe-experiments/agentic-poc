import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const runId = id(700), bookletId = id(701), operationId = id(702), workflowRunId = id(703);
const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
async function setup() {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const repository = createExperimentRepository(database);
  await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 });
  await repository.prepareOperation({ runId, operationId, expectedRevision: 0, role: "manager", taskId: null, subjectKind: "book", subjectId: bookletId, inputFingerprint: "a".repeat(64), attempt: 1, providerKind: "text", nowMs: 2 });
  const dispatch = { runId, operationId, parentWorkflowRunId: null, nowMs: 3 };
  const claim = { ...dispatch, workflowRunId };
  return { database, repository, dispatch, claim };
}

describe("experiment dispatch persistence", () => {
  it("does not write observation timestamps during an active image completion lease", async () => {
    const { database, repository, dispatch, claim } = await setup();
    await repository.beginDispatch(dispatch);
    await repository.recordDispatchIdentity(claim);
    await database.collections.experiment_operations.updateOne({ _id: operationId }, { $set: {
      imageCompletionClaim: { id: id(799), digest: "b".repeat(64), expiresAtMs: 100 }, nextObservationAtMs: 7,
    } });
    expect(await repository.beginObservation(operationId, 99)).toBeNull();
    await repository.requestObservation(operationId);
    expect((await repository.getOperation(operationId))?.nextObservationAtMs).toBe(7);
    expect(await repository.beginObservation(operationId, 100)).not.toBeNull();
    expect((await repository.getOperation(operationId))?.deadlineAtMs).toBe(600_003);
  });
  it("does not authorize a new claim at or after the original operation deadline", async () => {
    const { repository, dispatch, claim } = await setup();
    const sent = await repository.beginDispatch(dispatch);
    await repository.recordDispatchIdentity(claim);
    for (const nowMs of [sent.operation.deadlineAtMs!, sent.operation.deadlineAtMs! + 1]) {
      expect(await repository.claimOperation({ ...claim, nowMs })).toMatchObject({ started: false, reason: "blocked" });
    }
    expect((await repository.getRun(runId))?.counters.steps).toBe(0);
    expect((await repository.getRun(runId))?.activeOperationId).toBe(operationId);
    expect((await repository.beginDispatch(dispatch)).dispatched).toBe(false);
  });
  it("retains the original dispatch deadline and five-second observation slot across restart", async () => {
    const { repository, dispatch, claim } = await setup();
    const sent = await repository.beginDispatch(dispatch);
    expect(sent.operation.deadlineAtMs).toBe(dispatch.nowMs + 600_000);
    await repository.recordDispatchIdentity(claim);
    expect(await repository.beginObservation(operationId, 10)).not.toBeNull();
    expect(await repository.beginObservation(operationId, 11)).toBeNull();
    expect(await repository.beginObservation(operationId, 5009)).toBeNull();
    expect(await repository.beginObservation(operationId, 5010)).not.toBeNull();
    const started = await repository.claimOperation({ ...claim, nowMs: 6000 });
    expect(started.operation.deadlineAtMs).toBe(dispatch.nowMs + 600_000);
    expect((await repository.getRun(runId))?.counters.steps).toBe(1);
  });

  it("admits one concurrent dispatch and saves returned identity before claim", async () => {
    const { repository, dispatch, claim } = await setup();
    const attempts = await Promise.allSettled([repository.beginDispatch(dispatch), repository.beginDispatch(dispatch)]);
    expect(attempts.filter((a) => a.status === "fulfilled" && a.value.dispatched)).toHaveLength(1);
    expect((await repository.recordDispatchIdentity(claim)).workflowRunId).toBe(workflowRunId);
    expect((await repository.recordDispatchIdentity(claim)).workflowRunId).toBe(workflowRunId);
    await expect(repository.recordDispatchIdentity({ ...claim, workflowRunId: id(704) })).rejects.toMatchObject({ code: "conflict" });
    expect((await repository.claimOperation(claim)).started).toBe(true);
    expect((await repository.getRun(runId))?.counters.steps).toBe(1);
  });

  it("blocks unknown prepared work without an ID and prevents completion or redispatch", async () => {
    const { repository, dispatch } = await setup();
    await repository.beginDispatch(dispatch);
    expect(await repository.recordDispatchOutcome({ ...dispatch, category: "unknown_outcome" })).toMatchObject({ state: "unknown", workflowRunId: null, reservationCount: 0 });
    expect(await repository.getRun(runId)).toMatchObject({ status: "blocked", activeOperationId: operationId, safeFailure: "unknown_outcome" });
    expect((await repository.beginDispatch(dispatch)).dispatched).toBe(false);
    expect((await repository.getRun(runId))?.counters.steps).toBe(0);
    await expect(repository.completeOperation({ envelope: { runId, operationId, workflowRunId, inputFingerprint: "a".repeat(64), result: { kind: "delegate", payload: { taskId: "J01", subjectKind: "book", subjectId: bookletId } } }, parentWorkflowRunId: null, nowMs: 5 })).rejects.toMatchObject({ code: "conflict" });
  });

  it("allows a matching late claimed completion after unknown and protects success", async () => {
    const { repository, dispatch, claim } = await setup();
    await repository.beginDispatch(dispatch);
    await repository.recordDispatchIdentity(claim);
    await repository.claimOperation(claim);
    await repository.recordDispatchOutcome({ ...dispatch, category: "unknown_outcome" });
    const result = { kind: "delegate", payload: { taskId: "J01", subjectKind: "book", subjectId: bookletId } };
    expect((await repository.completeOperation({ envelope: { runId, operationId, workflowRunId, inputFingerprint: "a".repeat(64), result }, parentWorkflowRunId: null, nowMs: 6 })).operation.state).toBe("succeeded");
    expect((await repository.recordDispatchOutcome({ ...dispatch, category: "definite_failure" })).state).toBe("succeeded");
  });

  it("resolves an observed failure from the persisted claim and accepts a late callback", async () => {
    const { repository, dispatch, claim } = await setup();
    await repository.beginDispatch(dispatch);
    await repository.recordDispatchIdentity(claim);
    // The dispatcher may have read the earlier unclaimed state. Outcome
    // classification must observe this claim inside its own transaction.
    expect((await repository.claimOperation(claim)).started).toBe(true);
    expect(await repository.recordDispatchOutcome({ ...dispatch, category: "observed_failure" })).toMatchObject({
      state: "unknown", safeFailure: "unknown_outcome", reservationCount: 1, workflowRunId,
    });
    expect(await repository.getRun(runId)).toMatchObject({ status: "blocked", safeFailure: "unknown_outcome", activeOperationId: operationId });
    const result = { kind: "delegate", payload: { taskId: "J01", subjectKind: "book", subjectId: bookletId } };
    expect((await repository.completeOperation({ envelope: { runId, operationId, workflowRunId,
      inputFingerprint: "a".repeat(64), result }, parentWorkflowRunId: null, nowMs: 6 })).operation.state).toBe("succeeded");
    expect((await repository.recordDispatchOutcome({ ...dispatch, category: "observed_failure" })).state).toBe("succeeded");
    expect((await repository.getRun(runId))?.safeFailure).toBeNull();
  });

  it("closes an observed failure only when the persisted operation is unclaimed", async () => {
    const { repository, dispatch, claim } = await setup();
    await repository.beginDispatch(dispatch);
    await repository.recordDispatchIdentity(claim);
    expect(await repository.recordDispatchOutcome({ ...dispatch, category: "observed_failure" })).toMatchObject({
      state: "failed", safeFailure: "definite_failure", reservationCount: 0,
    });
    expect(await repository.recordDispatchOutcome({ ...dispatch, category: "observed_failure" })).toMatchObject({
      state: "failed", safeFailure: "definite_failure", reservationCount: 0,
    });
    expect(await repository.getRun(runId)).toMatchObject({ status: "blocked", safeFailure: "definite_failure", activeOperationId: null });
    expect(await repository.claimOperation(claim)).toMatchObject({ started: false, reason: "already_started" });
  });

  it("closes a verified paused unclaimed operation without reservation", async () => {
    const { repository, dispatch, claim } = await setup();
    await repository.beginDispatch(dispatch);
    const revision = (await repository.getRun(runId))!.revision;
    await repository.pause({ runId, expectedRevision: revision, nowMs: 4 });
    expect((await repository.claimOperation(claim)).reason).toBe("paused");
    expect(await repository.recordDispatchOutcome({ ...dispatch, category: "paused" })).toMatchObject({ state: "failed", reservationCount: 0, safeFailure: null });
    expect(await repository.getRun(runId)).toMatchObject({ status: "paused", activeOperationId: null, safeFailure: null });
  });

  it("closes a denied claim after the operator resumes", async () => {
    const { repository, dispatch, claim } = await setup();
    await repository.beginDispatch(dispatch);
    await repository.pause({ runId, expectedRevision: (await repository.getRun(runId))!.revision, nowMs: 4 });
    expect((await repository.claimOperation(claim)).reason).toBe("paused");
    await repository.resume({ runId, expectedRevision: (await repository.getRun(runId))!.revision, nowMs: 5 });
    await repository.recordDispatchOutcome({ ...dispatch, category: "paused", nowMs: 6 });
    expect(await repository.getRun(runId)).toMatchObject({ status: "queued", activeOperationId: null, safeFailure: null });
  });

  it("blocks a run idempotently while retaining its active operation", async () => {
    const { repository } = await setup();
    const blocked = await repository.blockRun({ runId, category: "definite_failure", nowMs: 5 });
    expect(blocked).toMatchObject({ status: "blocked", activeOperationId: operationId, safeFailure: "definite_failure" });
    expect(await repository.blockRun({ runId, category: "definite_failure", nowMs: 6 })).toEqual(blocked);
    await expect(repository.blockRun({ runId, category: "unknown_outcome", nowMs: 7 })).rejects.toMatchObject({ code: "conflict" });
    expect((await repository.getOperation(operationId))?.state).toBe("prepared");
  });

  it("does not let a late callback clear a definite configuration blocker", async () => {
    const { repository, dispatch, claim } = await setup();
    await repository.beginDispatch(dispatch);
    await repository.claimOperation(claim);
    await repository.blockRun({ runId, category: "definite_failure", nowMs: 5 });
    await expect(repository.completeOperation({ envelope: { runId, operationId, workflowRunId, inputFingerprint: "a".repeat(64), result: { kind: "delegate", payload: { taskId: "J01", subjectKind: "book", subjectId: bookletId } } }, parentWorkflowRunId: null, nowMs: 6 })).rejects.toMatchObject({ code: "invalid_state" });
    expect((await repository.getRun(runId))?.status).toBe("blocked");
  });

  it("counts durable repeated progress once per successful operation and blocks at three repeats", async () => {
    const { repository } = await setup();
    const result = { kind: "delegate", payload: { taskId: "J01", subjectKind: "book", subjectId: bookletId } };
    for (let index = 0; index < 4; index++) {
      const currentOperationId = index === 0 ? operationId : id(710 + index);
      const currentWorkflowRunId = id(720 + index);
      if (index > 0) await repository.prepareOperation({ runId, operationId: currentOperationId, expectedRevision: (await repository.getRun(runId))!.revision, role: "manager", taskId: null, subjectKind: "book", subjectId: bookletId, inputFingerprint: "a".repeat(64), attempt: index + 1, providerKind: "text", nowMs: 10 + index * 10 });
      await repository.claimOperation({ runId, operationId: currentOperationId, workflowRunId: currentWorkflowRunId, parentWorkflowRunId: null, nowMs: 11 + index * 10 });
      await repository.completeOperation({ envelope: { runId, operationId: currentOperationId, workflowRunId: currentWorkflowRunId, inputFingerprint: "a".repeat(64), result }, parentWorkflowRunId: null, nowMs: 12 + index * 10 });
      const progress = { runId, operationId: currentOperationId, fingerprint64: "b".repeat(64), nowMs: 13 + index * 10 };
      const saved = await repository.recordProgress(progress);
      expect(saved.noProgressCount).toBe(index);
      expect(await repository.recordProgress(progress)).toEqual(saved);
    }
    expect(await repository.getRun(runId)).toMatchObject({ status: "blocked", safeFailure: "definite_failure", noProgressCount: 3 });
  });
});
