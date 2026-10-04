import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository, ExperimentRepositoryError } from "@/db/experiment-repository";
import { createRepositories } from "@/db/repositories";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const ids = Array.from({ length: 10 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const fingerprint = "a".repeat(64);
const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

async function setup() {
  const database = await createTestDatabase({ seedAgents: false });
  databases.push(database);
  const repository = createExperimentRepository(database);
  const creation = { runId: ids[0], bookletId: ids[1], persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 };
  return { database, repository, creation };
}
function prepared(revision: number, overrides: Record<string, unknown> = {}) {
  return { operationId: ids[2], runId: ids[0], expectedRevision: revision, role: "specialist", taskId: "J01", subjectKind: "book", subjectId: ids[1], inputFingerprint: fingerprint, attempt: 1, providerKind: "text", nowMs: 2, ...overrides };
}
function claimed() { return { runId: ids[0], operationId: ids[2], workflowRunId: ids[3], parentWorkflowRunId: null, nowMs: 3 }; }
function completion(result: unknown) { return { envelope: { runId: ids[0], operationId: ids[2], workflowRunId: ids[3], inputFingerprint: fingerprint, result }, parentWorkflowRunId: null, nowMs: 4 }; }
const concept = { schemaVersion: "2", title: "Kite Rescue", sourceInput: "A child and robot rescue a kite.", audience: { ageBand: "6-8", readingNeeds: "Short text." }, premise: "A kite flies away.", theme: "Friendship", emotionalPromise: "Relief", tone: "Playful", storyScope: "Three pages", contentRequirements: [], knownConstraints: [], deferredDecisions: [], approvalQuestions: [] };
const proposal = { kind: "proposal", payload: { taskId: "J01", content: concept } };

describe("experiment repository", () => {
  it("creates a run and booklet atomically, reuses exact input and rejects collisions", async () => {
    const { database, repository, creation } = await setup();
    const run = await repository.createRun(creation);
    expect(run).toMatchObject({ status: "queued", revision: 0, limits: { text: 120, image: 12, steps: 300 } });
    expect(await repository.createRun({ ...creation, nowMs: 50 })).toEqual(run);
    const concurrent = await Promise.all([repository.createRun({ ...creation, nowMs: 51 }), repository.createRun({ ...creation, nowMs: 52 })]);
    expect(concurrent).toEqual([run, run]);
    expect(await database.collections.booklets.findOne({ _id: ids[1] })).toMatchObject({ schemaVersion: "2", currentStage: "J01", executionProfile: "dify_booklet_v1" });
    expect(await database.collections.agent_versions.countDocuments()).toBe(0);
    await expect(repository.createRun({ ...creation, mode: "real" })).rejects.toMatchObject({ code: "conflict" });
    await expect(repository.createRun({ ...creation, runId: ids[4], bookletId: ids[1] })).rejects.toMatchObject({ code: "conflict" });
    expect(await database.collections.experiment_runs.countDocuments()).toBe(1);
    await expect(repository.createRun({ ...creation, runId: ids[5], bookletId: ids[6], predecessorRunId: ids[4] })).rejects.toMatchObject({ code: "not_found" });
    expect(await database.collections.booklets.findOne({ _id: ids[6] })).toBeNull();
    const legacy = createRepositories(database).booklets;
    expect((await legacy.list()).some((booklet) => booklet.id === ids[1])).toBe(false);
  });

  it("uses revision CAS for controls and one active operation", async () => {
    const { repository, creation } = await setup();
    await repository.createRun(creation);
    const paused = await repository.pause({ runId: ids[0], expectedRevision: 0, nowMs: 2 });
    expect(paused).toMatchObject({ status: "paused", revision: 1, pauseRequested: true });
    expect(await repository.pause({ runId: ids[0], expectedRevision: 1, nowMs: 3 })).toEqual(paused);
    await expect(repository.resume({ runId: ids[0], expectedRevision: 0, nowMs: 4 })).rejects.toMatchObject({ code: "stale_revision" });
    const resumed = await repository.resume({ runId: ids[0], expectedRevision: 1, nowMs: 4 });
    expect(resumed).toMatchObject({ status: "queued", revision: 2 });
    const operation = await repository.prepareOperation(prepared(2));
    expect(operation.state).toBe("prepared");
    expect(await repository.prepareOperation(prepared(2))).toEqual(operation);
    await expect(repository.prepareOperation(prepared(2, { operationId: ids[4], attempt: 2 }))).rejects.toMatchObject({ code: "stale_revision" });
  });

  it("claims once under concurrency and never double-debits", async () => {
    const { repository, creation } = await setup();
    await repository.createRun(creation);
    await repository.prepareOperation(prepared(0));
    const attempts = await Promise.allSettled([repository.claimOperation(claimed()), repository.claimOperation(claimed())]);
    expect(attempts.filter((result) => result.status === "fulfilled" && result.value.started)).toHaveLength(1);
    expect((await repository.getRun(ids[0]))?.counters).toMatchObject({ logicalText: 1, payableText: 0, steps: 1 });
    expect((await repository.getOperation(ids[2]))?.reservationCount).toBe(1);
    expect(await repository.claimOperation(claimed())).toMatchObject({ started: false, reason: "already_started" });
    await expect(repository.claimOperation({ ...claimed(), workflowRunId: ids[4] })).rejects.toMatchObject({ code: "conflict" });
  });

  it("denies paused claims but accepts an authorized late completion", async () => {
    const { repository, creation } = await setup();
    await repository.createRun(creation);
    await repository.prepareOperation(prepared(0));
    await repository.pause({ runId: ids[0], expectedRevision: 1, nowMs: 3 });
    expect(await repository.claimOperation(claimed())).toMatchObject({ started: false, reason: "paused" });
    await repository.resume({ runId: ids[0], expectedRevision: 2, nowMs: 4 });
    await repository.claimOperation(claimed());
    await repository.pause({ runId: ids[0], expectedRevision: 4, nowMs: 5 });
    const saved = await repository.completeOperation(completion(proposal));
    expect(saved.operation.state).toBe("succeeded");
    expect(await repository.getRun(ids[0])).toMatchObject({ status: "paused", activeOperationId: null, pauseRequested: true });
  });

  it("retains unknown outcomes across repository restart and recovers the saved operation", async () => {
    const { database, repository, creation } = await setup();
    await repository.createRun(creation);
    await repository.prepareOperation(prepared(0));
    await repository.claimOperation(claimed());
    const unknown = await repository.failOperation({ ...claimed(), category: "unknown_outcome" });
    const revisionAfterFailure = (await repository.getRun(ids[0]))?.revision;
    expect(await repository.failOperation({ ...claimed(), category: "unknown_outcome", nowMs: 50 })).toEqual(unknown);
    expect((await repository.getRun(ids[0]))?.revision).toBe(revisionAfterFailure);
    const restarted = createExperimentRepository(database);
    expect(await restarted.getRun(ids[0])).toMatchObject({ status: "blocked", activeOperationId: ids[2], safeFailure: "unknown_outcome" });
    await expect(restarted.resume({ runId: ids[0], expectedRevision: 3, nowMs: 5 })).rejects.toMatchObject({ code: "invalid_state" });
    expect(await restarted.claimOperation(claimed())).toMatchObject({ started: false, reason: "already_started" });
    expect((await restarted.completeOperation(completion(proposal))).operation.state).toBe("succeeded");
    expect(await restarted.getRun(ids[0])).toMatchObject({ status: "queued", safeFailure: null, activeOperationId: null });
  });

  it("reuses a duplicate definite failure without advancing the run", async () => {
    const { repository, creation } = await setup();
    await repository.createRun(creation);
    await repository.prepareOperation(prepared(0));
    await repository.claimOperation(claimed());
    const failed = await repository.failOperation({ ...claimed(), category: "definite_failure" });
    const revisionAfterFailure = (await repository.getRun(ids[0]))?.revision;
    expect(await repository.failOperation({ ...claimed(), category: "definite_failure", nowMs: 50 })).toEqual(failed);
    expect((await repository.getRun(ids[0]))?.revision).toBe(revisionAfterFailure);
    expect(await repository.getRun(ids[0])).toMatchObject({ status: "blocked", activeOperationId: null, safeFailure: "definite_failure" });
    await expect(repository.failOperation({ ...claimed(), workflowRunId: ids[4], category: "definite_failure" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("enforces bounds and mode-specific payable counters without provider execution", async () => {
    const { database, repository, creation } = await setup();
    await repository.createRun(creation);
    await database.collections.experiment_runs.updateOne({ _id: ids[0] }, { $set: { "counters.steps": 300 } });
    await repository.prepareOperation(prepared(0));
    expect(await repository.claimOperation(claimed())).toMatchObject({ started: false, reason: "limit_exhausted" });
    expect(await repository.getRun(ids[0])).toMatchObject({ status: "blocked", safeFailure: "limit_exhausted" });
    const balanced = await repository.createRun({ ...creation, runId: ids[4], bookletId: ids[5], mode: "balanced" });
    await repository.prepareOperation(prepared(balanced.revision, { operationId: ids[6], runId: ids[4], subjectId: ids[5], role: "image", taskId: null, providerKind: "image" }));
    await repository.claimOperation({ runId: ids[4], operationId: ids[6], workflowRunId: ids[7], parentWorkflowRunId: null, nowMs: 3 });
    expect((await repository.getRun(ids[4]))?.counters).toMatchObject({ logicalImage: 1, payableImage: 0 });
    const real = await repository.createRun({ ...creation, runId: ids[8], bookletId: ids[9], mode: "real" });
    await repository.prepareOperation(prepared(real.revision, { operationId: ids[7], runId: ids[8], subjectId: ids[9] }));
    await repository.claimOperation({ runId: ids[8], operationId: ids[7], workflowRunId: ids[6], parentWorkflowRunId: null, nowMs: 3 });
    expect((await repository.getRun(ids[8]))?.counters).toMatchObject({ logicalText: 1, payableText: 1 });
  });

  it("rejects wrong identity, role, task and conflicting completion; reuses canonical duplicate", async () => {
    const { repository, creation } = await setup();
    await repository.createRun(creation);
    await repository.prepareOperation(prepared(0));
    await repository.claimOperation(claimed());
    await expect(repository.completeOperation(completion({ kind: "decision", payload: { decision: { action: "answer", questionId: ids[4], text: "Yes" } } }))).rejects.toMatchObject({ code: "invalid_result" });
    await expect(repository.completeOperation(completion({ kind: "proposal", payload: { taskId: "J02", content: concept } }))).rejects.toMatchObject({ code: "invalid_result" });
    await expect(repository.completeOperation({ ...completion(proposal), envelope: { ...completion(proposal).envelope, workflowRunId: ids[4] } })).rejects.toMatchObject({ code: "conflict" });
    expect((await repository.completeOperation(completion(proposal))).reused).toBe(false);
    expect((await repository.completeOperation(completion({ ...proposal, payload: { ...proposal.payload, content: { ...concept, extra: "ignored" } } }))).reused).toBe(true);
    await expect(repository.completeOperation(completion({ ...proposal, payload: { ...proposal.payload, content: { ...concept, tone: "Different" } } }))).rejects.toMatchObject({ code: "conflict" });
    await expect(repository.failOperation({ ...claimed(), category: "definite_failure" })).rejects.toMatchObject({ code: "conflict" });
    expect(ExperimentRepositoryError.name).toBe("ExperimentRepositoryError");
  });
});
