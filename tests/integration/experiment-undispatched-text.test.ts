import { afterEach, describe, expect, it, vi } from "vitest";
import * as deploymentControl from "@/lib/application/deployment-control";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { specialistTaskSchema } from "@/lib/contracts/experiment-runner";
import { withMongoTransaction, type Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createM4TextPreparation } from "@/db/experiment-text-preparation";
import * as textPreparation from "@/db/experiment-text-preparation";
import { m4OperationFingerprint } from "@/db/experiment-text-sources";
import { OperationBudgetExpired } from "@/lib/operations/budget";
import { undispatchedTextDigest, verifyUndispatchedText } from "@/db/experiment-undispatched-text";
import { verifyM4Accounting } from "@/db/experiment-m4-accounting";
import { m4RequestBundleHash } from "@/lib/experiment-runner/m4-request";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";

const databases: Database[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.splice(0).map(closeTestDatabase)); });
async function setup(prepared = false, continuation = true) {
  const db = await createTestDatabase({ seedAgents: false }); databases.push(db);
  const policy = { ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash() };
  const authority = { policy, grant: { campaignId: id(1), reference: "undispatched-local-fixture",
    ...(continuation ? { continuations: [{ runId: id(10), operationId: id(12), reference: "exact-inspected-fixture" }] } : {}) } };
  const repository = createExperimentRepository(db, { m4Authority: authority, m4ExecutionEnabled: true, elapsedNow: () => 0 });
  const configuration = policy.publications.filter(p => p.persona === null || p.persona === "playful_kid")
    .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({ role, taskId, appId, publishedWorkflowId,
      toolProviderId, ...(finalPageIllustration ? { finalPageIllustration } : {}) }));
  await repository.createRun({ runId: id(10), bookletId: id(11), persona: "playful_kid", mode: "balanced", campaignId: id(1), nowMs: 1, configuration });
  await repository.prepareOperation({ runId: id(10), operationId: id(12), expectedRevision: 0, role: "manager", taskId: null,
    subjectKind: "book", subjectId: id(11), inputFingerprint: "b".repeat(64), attempt: 1, providerKind: "text", nowMs: 2 });
  if (prepared) await createM4TextPreparation(db, authority, { elapsedNow: () => 0 }).prepare({ runId: id(10), operationId: id(12), nowMs: 3 });
  const run = () => repository.getRun(id(10)).then(value => value!);
  const op = () => repository.getOperation(id(12)).then(value => value!);
  const campaign = () => db.collections.experiment_campaigns.findOne({ _id: id(1) });
  const proof = async () => withMongoTransaction(db, async session => verifyUndispatchedText(db, session, authority, await run(), id(12)));
  return { db, authority, repository, run, op, campaign, proof };
}

function localDispatcher(env: Awaited<ReturnType<typeof setup>>) {
  const forbidden = vi.fn(async () => { throw new Error("No provider request allowed"); });
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid", callbackKey: "fixture",
    m4: { state: "granted", authority: env.authority },
    bindings: env.authority.policy.publications.map(p => ({ ...p, taskId: specialistTaskSchema.nullable().parse(p.taskId), apiKey: "fake-key" })) };
  return { forbidden, dispatcher: createExperimentDispatcher({ database: env.db, config, now: () => 10,
    runtime: { start: forbidden, retrieve: forbidden, stop: forbidden }, mutate: async action => action() }) };
}

describe("undispatched Balanced text controls", () => {
  it.each(["ordinary", "budget", "resumed", "successor"])("does not block a cancelled run when held preparation later fails: %s", async kind => {
    const env = await setup();
    let rejectHeld!: (reason: unknown) => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const held = new Promise<never>((_resolve, reject) => { rejectHeld = reject; });
    const original = textPreparation.createM4TextPreparation;
    vi.spyOn(textPreparation, "createM4TextPreparation").mockImplementation((...args) => ({ ...original(...args), prepare: async () => { entered(); return held; } }));
    const { dispatcher, forbidden } = localDispatcher(env);
    const advancing = dispatcher.advance(id(10));
    await started;
    const current = await env.run();
    const paused = await env.repository.pause({ runId: current._id, expectedRevision: current.revision, nowMs: 11 });
    let expected = paused;
    if (kind === "resumed" || kind === "successor") {
      expected = await env.repository.resume({ runId: paused._id, expectedRevision: paused.revision, nowMs: 12 });
      if (kind === "successor") {
        await env.repository.prepareOperation({ runId: expected._id, operationId: id(50), expectedRevision: expected.revision,
          role: "manager", taskId: null, subjectKind: "book", subjectId: id(11), inputFingerprint: "d".repeat(64),
          attempt: 2, providerKind: "text", nowMs: 13 });
        expected = await env.run();
      }
    }
    const successor = kind === "successor" ? await env.repository.getOperation(id(50)) : null;
    rejectHeld(kind === "budget" ? new OperationBudgetExpired() : new Error("Late preparation read failed"));
    expect(await advancing).toBe("waiting");
    expect(await env.run()).toEqual(expected);
    if (successor) expect(await env.repository.getOperation(id(50))).toEqual(successor);
    expect((await env.campaign())!.state).toBe("active");
    expect((await env.campaign())!.requests).toBe(0);
    expect(forbidden).not.toHaveBeenCalled();
    expect(await env.op()).toMatchObject({ state: "failed", safeFailure: null, reservationCount: 0 });
  });
  it("leaves a local cancellation unchanged when late Stop cannot read its proof", async () => {
    const env = await setup(), current = await env.run();
    const paused = await env.repository.pause({ runId: current._id, expectedRevision: current.revision, nowMs: 5 });
    const operation = await env.op(), campaign = await env.campaign();
    const { dispatcher, forbidden } = localDispatcher(env);
    // The proof's global output read fails after the coordinator loaded the operation.
    const read = vi.spyOn(env.db.collections.artifact_versions, "findOne").mockRejectedValue(new Error("Proof storage unavailable"));
    await expect(dispatcher.inspect({ runId: id(10), operationId: id(12), stop: "manual" })).rejects.toThrow();
    read.mockRestore();
    expect(await env.run()).toEqual(paused); expect(await env.op()).toEqual(operation); expect(await env.campaign()).toEqual(campaign);
    expect(forbidden).not.toHaveBeenCalled();
  });
  it("verifies a prepared specialist's saved manager parent and rejects invalid parent ownership", async () => {
    const env = await setup(true), original = await env.op();
    const specialist = { ...original, role: "specialist" as const, taskId: "J09" as const, subjectKind: "character" as const, subjectId: id(20) };
    const publication = env.authority.policy.publications.find(p => p.role === "specialist" && p.taskId === "J09")!;
    specialist.m4Preparation = { ...original.m4Preparation!, operationFingerprint: m4OperationFingerprint(specialist),
      parentWorkflowRunId: id(40), publishedWorkflowId: publication.publishedWorkflowId };
    await env.db.collections.experiment_operations.replaceOne({ _id: id(12) }, specialist);
    expect(await env.proof()).toBeNull();
    await env.db.collections.experiment_operations.insertOne({ ...original, _id: id(41), idempotencyKey: "saved-manager-parent",
      state: "succeeded", workflowRunId: id(40), lifecycle: { ...original.lifecycle!, phase: "finished", unresolved: false } });
    expect(await env.proof()).toMatch(/^[a-f0-9]{64}$/);
    await env.db.collections.experiment_operations.updateOne({ _id: id(41) }, { $set: { authorizationClaim: { id: id(42), expiresAtMs: 0 } } });
    expect(await env.proof()).toBeNull();
    await env.db.collections.experiment_operations.updateOne({ _id: id(41) }, { $unset: { authorizationClaim: "" }, $set: { runId: id(99) } });
    expect(await env.proof()).toBeNull();
  });
  it.each(["active", "interrupted"] as const)("blocks exact continuation while another %s mutation owner remains", async state => {
    const env = await setup(); await env.repository.failPreparation(id(10), id(12), 5);
    await env.db.collections.deployment_control.insertOne({ _id: "environment:_staging", schemaVersion: "1", environment: "_staging",
      maintenance: false, activeMutations: state === "active" ? 1 : 0, interruptedMutations: state === "interrupted" ? 1 : 0,
      mutationOwners: [{ id: id(31), processId: id(32), runId: id(10), operationId: id(12), startedAtMs: 0, state,
        ...(state === "interrupted" ? { interruptedAtMs: 1 } : {}) }], reason: null, updatedAtMs: 5 });
    const before = await env.run(), campaign = await env.campaign();
    await expect(env.repository.resume({ runId: before._id, expectedRevision: before.revision, nowMs: 6 })).rejects.toThrow();
    expect(await env.run()).toEqual(before); expect(await env.campaign()).toEqual(campaign);
    expect(await env.op()).not.toHaveProperty("m4Continuation");
  });
  it("permits only the current tracked Resume owner without removing its ownership record", async () => {
    const env = await setup(); await env.repository.failPreparation(id(10), id(12), 5);
    const owner = { id: id(31), processId: id(32), runId: id(10), startedAtMs: 5, state: "active" as const };
    await env.db.collections.deployment_control.insertOne({ _id: "environment:_staging", schemaVersion: "1", environment: "_staging",
      maintenance: false, activeMutations: 1, mutationOwners: [owner], reason: null, updatedAtMs: 5 });
    vi.spyOn(deploymentControl, "currentMutationOwnerId").mockReturnValue(owner.id);
    const before = await env.run();
    const resumed = await env.repository.resume({ runId: before._id, expectedRevision: before.revision, nowMs: 6 });
    expect(resumed.status).toBe("queued");
    expect((await env.db.collections.deployment_control.findOne({ environment: "_staging" }))?.mutationOwners).toEqual([owner]);
    await withMongoTransaction(env.db, session => verifyM4Accounting(env.db, session, resumed));
  });
  it.each(["pause", "continuation"])("late Inspect and Stop preserve a resolved local %s without provider calls", async kind => {
    const env = await setup(), initial = await env.run();
    if (kind === "pause") await env.repository.pause({ runId: initial._id, expectedRevision: initial.revision, nowMs: 5 });
    else {
      await env.repository.failPreparation(id(10), id(12), 5);
      const failed = await env.run();
      await env.repository.resume({ runId: failed._id, expectedRevision: failed.revision, nowMs: 6 });
    }
    const before = await env.run(), operation = await env.op(), campaign = await env.campaign();
    const forbidden = vi.fn(async () => { throw new Error("No provider request allowed"); });
    const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid", callbackKey: "fixture",
      m4: { state: "granted", authority: env.authority },
      bindings: env.authority.policy.publications.map(p => ({ ...p, taskId: specialistTaskSchema.nullable().parse(p.taskId), apiKey: "fake-key" })) };
    const dispatcher = createExperimentDispatcher({ database: env.db, config, now: () => 10,
      runtime: { start: forbidden, retrieve: forbidden, stop: forbidden }, mutate: async action => action() });
    await dispatcher.inspect({ runId: id(10), operationId: id(12) });
    await dispatcher.inspect({ runId: id(10), operationId: id(12), stop: "manual" });
    expect(forbidden).not.toHaveBeenCalled();
    expect(await env.run()).toEqual(before); expect(await env.op()).toEqual(operation); expect(await env.campaign()).toEqual(campaign);
  });
  it.each([false, true])("cancels Pause atomically with saved preparation=%s and preserves accounting", async prepared => {
    const env = await setup(prepared); const before = await env.run(), operation = await env.op(), campaign = await env.campaign();
    const digest = undispatchedTextDigest(env.authority, before, operation);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    const paused = await env.repository.pause({ runId: before._id, expectedRevision: before.revision, nowMs: 5 });
    expect(paused).toMatchObject({ status: "paused", pauseRequested: true, activeOperationId: null });
    expect(await env.op()).toMatchObject({ state: "failed", safeFailure: null, reservationCount: 0,
      localPreparationCancellation: { kind: "paused_text_v1", evidenceDigest: digest, cancelledAtMs: 5 } });
    expect((await env.op()).m4Preparation).toEqual(operation.m4Preparation);
    expect(await env.campaign()).toEqual(campaign);
    expect(paused.counters).toEqual(before.counters);
    await withMongoTransaction(env.db, session => verifyM4Accounting(env.db, session, paused));
    expect(await env.repository.pause({ runId: paused._id, expectedRevision: paused.revision, nowMs: 6 })).toEqual(paused);
    const resumed = await env.repository.resume({ runId: paused._id, expectedRevision: paused.revision, nowMs: 7 });
    expect(resumed).toMatchObject({ status: "queued", activeOperationId: null, pauseRequested: false });
    expect(await env.op()).not.toHaveProperty("dispatchStartedAtMs", expect.any(Number));
    await withMongoTransaction(env.db, session => verifyM4Accounting(env.db, session, resumed));
  });
  it.each([false, true])("continues the exact retained local failure with preparation=%s without charging or replay", async prepared => {
    const env = await setup(prepared); const before = await env.op();
    await env.db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: {
      noProgressCount: 2, progressFingerprint: "d".repeat(64), progressOperationId: id(9),
    } });
    await env.repository.failPreparation(id(10), id(12), 5);
    const blocked = await env.run(), campaign = (await env.campaign())!;
    const results = await Promise.allSettled([1, 2].map(() => env.repository.resume({ runId: blocked._id, expectedRevision: blocked.revision, nowMs: 6 })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const resumed = await env.run(), retained = await env.op();
    expect(resumed).toMatchObject({ status: "queued", safeFailure: null, activeOperationId: null,
      noProgressCount: 0, progressFingerprint: blocked.progressFingerprint, progressOperationId: blocked.progressOperationId });
    expect(retained).toMatchObject({ state: "failed", safeFailure: "definite_failure", reservationCount: 0,
      m4Continuation: { kind: "undispatched_text_v1", requestDigest: before.m4Preparation?.requestDigest ?? null, nextOperationId: null } });
    expect(retained.m4Preparation).toEqual(before.m4Preparation);
    expect(resumed.counters).toEqual(blocked.counters);
    const after = (await env.campaign())!;
    for (const key of ["requests", "requestCounts", "reservedMicrodollars", "settledMicrodollars"] as const) expect(after[key]).toEqual(campaign[key]);
    await withMongoTransaction(env.db, session => verifyM4Accounting(env.db, session, resumed));
    expect(await env.repository.resume({ runId: resumed._id, expectedRevision: resumed.revision, nowMs: 7 })).toEqual(resumed);
    const next = await env.repository.prepareOperation({ runId: resumed._id, operationId: id(14), expectedRevision: resumed.revision,
      role: "manager", taskId: null, subjectKind: "book", subjectId: id(11), inputFingerprint: "c".repeat(64), attempt: 2, providerKind: "text", nowMs: 8 });
    expect(next.m4ContinuedFromOperationId).toBe(id(12));
    expect((await env.op()).m4Continuation?.nextOperationId).toBe(id(14));
  });
  it("supports the exact J09 specialist failure without requiring an unsaved preparation", async () => {
    const env = await setup();
    // Seed the retained operation identity, not a complete J09 generation graph.
    // No preparation or dispatch is invented; normal source checks still own future J09 work.
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: {
      role: "specialist", taskId: "J09", subjectKind: "character", subjectId: id(20),
    } });
    expect(await env.proof()).toMatch(/^[a-f0-9]{64}$/);
    await env.repository.failPreparation(id(10), id(12), 5);
    const blocked = await env.run();
    const resumed = await env.repository.resume({ runId: blocked._id, expectedRevision: blocked.revision, nowMs: 6 });
    expect(resumed.status).toBe("queued");
    expect(await env.op()).toMatchObject({ role: "specialist", taskId: "J09", state: "failed",
      m4Continuation: { kind: "undispatched_text_v1", requestDigest: null } });
    await withMongoTransaction(env.db, session => verifyM4Accounting(env.db, session, resumed));
  });
  it("keeps the pure no-dispatch proof independent of persona", async () => {
    const env = await setup(), run = await env.run(), op = await env.op();
    for (const persona of ["playful_kid", "enthusiast_parent", "professional_creator"] as const) {
      expect(undispatchedTextDigest(env.authority, { ...run, persona }, op)).toMatch(/^[a-f0-9]{64}$/);
    }
  });
  it.each(["m4Preparation.requestJson", "m4Preparation.contextJson", "m4Preparation.requestDigest"])
    ("rejects tampered saved preparation %s", async field => {
      const env = await setup(true);
      await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { [field]: "tampered" } });
      expect(await env.proof()).toBeNull();
      await env.repository.failPreparation(id(10), id(12), 5);
      const blocked = await env.run();
      await expect(env.repository.resume({ runId: blocked._id, expectedRevision: blocked.revision, nowMs: 6 })).rejects.toThrow();
      expect(await env.op()).not.toHaveProperty("m4Continuation");
    });
  it.each(["authorizationClaim", "resultFinalizationClaim", "imageCompletionClaim"])
    ("rejects an expired but uncleared %s", async field => {
      const env = await setup();
      await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { [field]: { id: id(30), expiresAtMs: 0 } } });
      expect(await env.proof()).toBeNull();
    });
  it.each(["unknown", "missing-lifecycle"])("rejects %s evidence", async variant => {
    const env = await setup();
    if (variant === "unknown") await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { state: "unknown", safeFailure: "unknown_outcome" } });
    else await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $unset: { lifecycle: "" } });
    expect(await env.proof()).toBeNull();
  });
  it("rejects a tampered local cancellation receipt during accounting", async () => {
    const env = await setup(), run = await env.run();
    const paused = await env.repository.pause({ runId: run._id, expectedRevision: run.revision, nowMs: 5 });
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { "localPreparationCancellation.evidenceDigest": "0".repeat(64) } });
    await expect(withMongoTransaction(env.db, session => verifyM4Accounting(env.db, session, paused))).rejects.toThrow();
  });
  it("rejects retained failure continuation without the exact grant", async () => {
    const env = await setup(false, false); await env.repository.failPreparation(id(10), id(12), 5);
    const before = await env.run(), campaign = await env.campaign();
    await expect(env.repository.resume({ runId: before._id, expectedRevision: before.revision, nowMs: 6 })).rejects.toThrow("exact inspected continuation");
    expect(await env.run()).toEqual(before); expect(await env.campaign()).toEqual(campaign);
  });
  it.each(["artifact_versions", "messages", "assets"])("rejects globally discoverable wrong-owner output in %s", async collection => {
    const env = await setup(); expect(await env.proof()).not.toBeNull();
    // Deliberately wrong owner: a run-scoped output search must not miss this evidence.
    await env.db.database.collection<{ _id: string; sourceOperationId?: string; operationId?: string; experimentRunId: string }>(collection)
      .insertOne({ _id: collection === "assets" ? id(12) : id(99), experimentRunId: id(98),
        ...(collection === "artifact_versions" ? { sourceOperationId: id(12) } : collection === "messages" ? { operationId: id(12) } : {}) });
    expect(await env.proof()).toBeNull();
  });
  it.each(["dispatchStartedAtMs", "authorizationClaim", "resultFinalizationClaim", "imageCompletionClaim", "m4Reservation", "reservationCount"])
    ("rejects dispatch, ownership or liability evidence: %s", async field => {
      const env = await setup(true);
      await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { [field]: field.endsWith("Ms") || field === "reservationCount" ? 1 : { retained: true } } });
      expect(await env.proof()).toBeNull();
      const run = await env.run();
      await env.repository.pause({ runId: run._id, expectedRevision: run.revision, nowMs: 6 });
      expect(await env.op()).not.toHaveProperty("localPreparationCancellation");
      expect((await env.run()).activeOperationId).toBe(id(12));
    });
  it("fences concurrent Pause and dispatch without a cancelled dispatch", async () => {
    const env = await setup(true), before = await env.run();
    await Promise.allSettled([
      env.repository.pause({ runId: before._id, expectedRevision: before.revision, nowMs: 5 }),
      env.repository.beginDispatch({ runId: before._id, operationId: id(12), parentWorkflowRunId: null, nowMs: 5 }),
    ]);
    const operation = await env.op();
    if (operation.localPreparationCancellation) {
      expect(operation.dispatchStartedAtMs == null).toBe(true); expect((await env.run()).activeOperationId).toBeNull();
    } else {
      expect(operation.dispatchStartedAtMs).toBe(5); expect(operation.state).toBe("prepared");
    }
    expect(operation.reservationCount).toBe(0); expect((await env.campaign())!.requests).toBe(0);
  });
});
