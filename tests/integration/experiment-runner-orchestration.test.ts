import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import { configurationSnapshot, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import type { RuntimeExecution, WorkflowRuntime } from "@/lib/experiment-runner/transport";
import type { Persona } from "@/lib/contracts/experiment-runner";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
const config: BookletRunnerConfig = {
  enabled: true, baseUrl: "https://dify.test", publicOrigin: "https://booklet.test", callbackKey: "private-callback-key",
  bindings: [
    { role: "manager", taskId: null, persona: null },
    { role: "specialist", taskId: "J01", persona: null }, { role: "specialist", taskId: "J02", persona: null },
    ...(["playful_kid", "enthusiast_parent", "professional_creator"] as const).map((persona) => ({ role: "tester" as const, taskId: null, persona })),
  ].map((item) => ({ ...item, appId: randomUUID(), publishedWorkflowId: randomUUID(), toolProviderId: null, apiKey: "private-runtime-key" })) as BookletRunnerConfig["bindings"],
};

async function setup(persona: Persona = "playful_kid") {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const repository = createExperimentRepository(database), context = createExperimentContextService(database);
  const runId = randomUUID(), bookletId = randomUUID(); let clock = 1;
  await repository.createRun({ runId, bookletId, persona, mode: "simulated", configuration: configurationSnapshot(config, persona), nowMs: clock++ });
  const saved = new Map<string, RuntimeExecution>();
  const runtime: WorkflowRuntime = {
    start: vi.fn<WorkflowRuntime["start"]>(async (binding, input) => {
      const workflowRunId = randomUUID();
      const identity = { runId, operationId: input.operationId, workflowRunId, parentWorkflowRunId: input.parentWorkflowRunId };
      expect((await repository.claimOperation({ ...identity, nowMs: clock++ })).started).toBe(true);
      const result = simulateNarrativeResult(await context.getOperationContext(identity), "simulated");
      const operation = (await repository.getOperation(input.operationId))!;
      const envelope = { ...identity, inputFingerprint: operation.inputFingerprint, result };
      const execution: RuntimeExecution = { id: workflowRunId, workflow_id: binding.publishedWorkflowId, status: "succeeded", outputs: { booklet_result: JSON.stringify(envelope) } };
      saved.set(workflowRunId, execution);
      await repository.completeOperation({ envelope: { runId, operationId: input.operationId, workflowRunId, inputFingerprint: operation.inputFingerprint, result }, parentWorkflowRunId: input.parentWorkflowRunId, nowMs: clock++ });
      return { kind: "execution", execution };
    }),
    retrieve: vi.fn<WorkflowRuntime["retrieve"]>(async (_binding, id) => saved.has(id) ? { kind: "execution", execution: saved.get(id)! } : { kind: "unknown" }),
  };
  const dispatcher = () => createExperimentDispatcher({ database, config, runtime, mutate: async (fn) => fn(), now: () => clock++ });
  return { database, repository, context, runId, runtime, dispatcher, next: () => clock++, elapse: (milliseconds: number) => { clock += milliseconds; } };
}

describe("sequential simulated dispatch and read-only recovery", () => {
  it("batches idle operation heads without loading historical results per run", async () => {
    const env = await setup();
    await env.dispatcher().advance(env.runId);
    const run = (await env.repository.getRun(env.runId))!;
    const operation = (await env.repository.listOperations(env.runId))[0];
    await env.database.collections.experiment_runs.updateOne({ _id: run._id }, { $set: { status: "completed" } });
    for (let index = 0; index < 20; index++) {
      const runId = randomUUID();
      await env.database.collections.experiment_runs.insertOne({ ...run, _id: runId, bookletId: randomUUID(), status: "completed" });
      await env.database.collections.experiment_operations.insertOne({ ...operation, _id: randomUUID(), runId, idempotencyKey: randomUUID() });
    }
    const aggregate = vi.spyOn(env.database.collections.experiment_operations, "aggregate");
    const history = vi.spyOn(env.database.collections.experiment_operations, "find");
    const single = vi.spyOn(env.database.collections.experiment_operations, "findOne");
    expect(await env.dispatcher().cycle()).toBe("idle");
    expect(aggregate).toHaveBeenCalledTimes(1);
    expect(history).not.toHaveBeenCalled();
    expect(single).not.toHaveBeenCalled();
    expect(env.runtime.start).toHaveBeenCalledTimes(1);
  });

  it("selects exact run heads with the history tie-break and excludes result bodies", async () => {
    const env = await setup();
    await env.dispatcher().advance(env.runId);
    const operation = (await env.repository.listOperations(env.runId))[0];
    const laterId = "ffffffff-ffff-4fff-bfff-ffffffffffff";
    await env.database.collections.experiment_operations.insertOne({ ...operation, _id: laterId, attempt: operation.attempt + 1, idempotencyKey: randomUUID(),
      state: "succeeded", verifiedWorkflowId: null, resultJson: "private retained result" });
    const heads = await env.repository.listOperationHeads([env.runId, randomUUID()]);
    expect(heads).toEqual([{ _id: laterId, runId: env.runId, state: "succeeded",
      dispatchStartedAtMs: operation.dispatchStartedAtMs, verifiedWorkflowId: null }]);
    expect(await env.repository.listOperationHeads([])).toEqual([]);
    expect((await env.repository.listOperations(env.runId)).at(-1)?._id).toBe(laterId);
  });

  const expandedConfig = () => ({ ...config, bindings: [
    ...config.bindings.map((binding) => ({ ...binding, publishedWorkflowId: randomUUID() })),
    ...(["J03", "J04", "J05", "J06", "J07"] as const).map((taskId) => ({ role: "specialist" as const, taskId, persona: null, appId: randomUUID(), publishedWorkflowId: randomUUID(), toolProviderId: null, apiKey: "private-runtime-key" })),
  ] });
  it("preserves a verified saved M1 boundary after a new suite is bound", async () => {
    const env = await setup();
    for (let count = 0; count < 15; count++) if (await env.dispatcher().advance(env.runId) === "boundary") break;
    const before = (await env.repository.getRun(env.runId))!;
    const count = vi.mocked(env.runtime.start).mock.calls.length;
    const dispatcher = createExperimentDispatcher({ database: env.database, config: expandedConfig(), runtime: env.runtime, mutate: async (fn) => fn() });
    expect(await dispatcher.advance(env.runId)).toBe("boundary");
    expect(await env.repository.getRun(env.runId)).toEqual(before);
    expect(env.runtime.start).toHaveBeenCalledTimes(count);
    expect(env.runtime.retrieve).not.toHaveBeenCalled();
  });
  it("blocks an unfinished M1 run after publication changes without rewriting evidence", async () => {
    const env = await setup();
    await env.dispatcher().advance(env.runId);
    const before = (await env.repository.getRun(env.runId))!;
    const count = vi.mocked(env.runtime.start).mock.calls.length;
    const dispatcher = createExperimentDispatcher({ database: env.database, config: expandedConfig(), runtime: env.runtime, mutate: async (fn) => fn() });
    expect(await dispatcher.advance(env.runId)).toBe("blocked");
    expect(await env.repository.getRun(env.runId)).toMatchObject({ status: "blocked", safeFailure: "definite_failure", configurationJson: before.configurationJson, counters: before.counters });
    expect(env.runtime.start).toHaveBeenCalledTimes(count);
  });
  it("does not treat unverified final publication evidence as a retained boundary", async () => {
    const env = await setup();
    for (let count = 0; count < 15; count++) if (await env.dispatcher().advance(env.runId) === "boundary") break;
    const final = (await env.repository.listOperations(env.runId)).at(-1)!;
    await env.database.collections.experiment_operations.updateOne({ _id: final._id }, { $set: { verifiedWorkflowId: null } });
    const dispatcher = createExperimentDispatcher({ database: env.database, config: expandedConfig(), runtime: env.runtime, mutate: async (fn) => fn() });
    expect(await dispatcher.advance(env.runId)).toBe("blocked");
    expect((await env.repository.getRun(env.runId))?.status).toBe("blocked");
  });
  for (const persona of ["playful_kid", "enthusiast_parent", "professional_creator"] as const) {
    it(`restarts between steps and reaches only the J03 boundary for ${persona}`, async () => {
      const env = await setup(persona);
      for (let count = 0; count < 15; count++) if (await env.dispatcher().advance(env.runId) === "boundary") break;
      const view = (await env.context.getRunView(env.runId))!;
      expect(view.nextNarrativeTask).toBe("slice_complete");
      expect(view.status).toBe("queued");
      expect(view.counters.payableText).toBe(0);
      const operations = await env.repository.listOperations(env.runId);
      expect(operations.every((operation) => operation.dispatchStartedAtMs != null && operation.state === "succeeded")).toBe(true);
      expect(operations.filter((operation) => operation.role === "specialist").every((operation) => operation.parentWorkflowRunId != null)).toBe(true);
    });
  }
  it("recovers a lost POST response with saved callback identity using GET only", async () => {
    const env = await setup();
    const original = env.runtime.start;
    env.runtime.start = vi.fn<WorkflowRuntime["start"]>(async (binding, input) => {
      // Authorization saves the ID. Simulate completion callback loss, then POST loss.
      const id = randomUUID();
      await env.repository.claimOperation({ runId: env.runId, operationId: input.operationId, workflowRunId: id, parentWorkflowRunId: input.parentWorkflowRunId, nowMs: env.next() });
      const operation = (await env.repository.getOperation(input.operationId))!;
      const identity = { runId: env.runId, operationId: input.operationId, workflowRunId: id, parentWorkflowRunId: input.parentWorkflowRunId };
      const result = simulateNarrativeResult(await env.context.getOperationContext(identity), "simulated");
      env.runtime.retrieve = vi.fn<WorkflowRuntime["retrieve"]>(async () => ({ kind: "execution", execution: { id, workflow_id: binding.publishedWorkflowId, status: "succeeded", outputs: { booklet_result: JSON.stringify({ ...identity, inputFingerprint: operation.inputFingerprint, result }) } } }));
      return { kind: "unknown" };
    });
    await env.dispatcher().advance(env.runId);
    expect((await env.repository.getRun(env.runId))?.status).toBe("blocked");
    await env.dispatcher().advance(env.runId);
    expect(env.runtime.start).toHaveBeenCalledTimes(1);
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(1);
    expect((await env.repository.getRun(env.runId))?.status).toBe("queued");
    env.runtime.start = original;
  });
  it("blocks an unknown no-ID outcome and never retries its POST", async () => {
    const env = await setup(); env.runtime.start = vi.fn<WorkflowRuntime["start"]>(async () => ({ kind: "unknown" }));
    await env.dispatcher().advance(env.runId);
    await env.dispatcher().advance(env.runId);
    expect(env.runtime.start).toHaveBeenCalledTimes(1);
    expect(env.runtime.retrieve).not.toHaveBeenCalled();
    const run = (await env.repository.getRun(env.runId))!;
    expect(run).toMatchObject({ status: "blocked", safeFailure: "unknown_outcome", counters: { logicalText: 0, payableText: 0 } });
  });
  it("reconciles a paused retained workflow before dispatching another persona", async () => {
    const env = await setup();
    const secondRunId = randomUUID();
    await env.repository.createRun({ runId: secondRunId, bookletId: randomUUID(), persona: "enthusiast_parent", mode: "simulated", configuration: configurationSnapshot(config, "enthusiast_parent"), nowMs: env.next() });
    let firstExecution: RuntimeExecution;
    let firstEnvelope: { runId: string; operationId: string; workflowRunId: string; parentWorkflowRunId: string | null; inputFingerprint: string; result: ReturnType<typeof simulateNarrativeResult> };
    env.runtime.start = vi.fn<WorkflowRuntime["start"]>(async (binding, input) => {
      if (input.runId === secondRunId) return { kind: "unknown" };
      const workflowRunId = randomUUID();
      await env.repository.claimOperation({ runId: env.runId, operationId: input.operationId, workflowRunId, parentWorkflowRunId: input.parentWorkflowRunId, nowMs: env.next() });
      const operation = (await env.repository.getOperation(input.operationId))!;
      firstEnvelope = { runId: env.runId, operationId: input.operationId, workflowRunId, parentWorkflowRunId: input.parentWorkflowRunId, inputFingerprint: operation.inputFingerprint,
        result: simulateNarrativeResult(await env.context.getOperationContext({ runId: env.runId, operationId: input.operationId, workflowRunId, parentWorkflowRunId: input.parentWorkflowRunId }), "simulated") };
      firstExecution = { id: workflowRunId, workflow_id: binding.publishedWorkflowId, status: "running", outputs: {} };
      return { kind: "execution", execution: firstExecution };
    });
    env.runtime.retrieve = vi.fn<WorkflowRuntime["retrieve"]>(async () => ({ kind: "execution", execution: firstExecution }));
    await env.dispatcher().cycle();
    await env.dispatcher().cycle();
    expect(env.runtime.start).toHaveBeenCalledTimes(1);
    const active = (await env.repository.getRun(env.runId))!;
    await env.repository.pause({ runId: env.runId, expectedRevision: active.revision, nowMs: env.next() });
    await env.dispatcher().cycle();
    expect(env.runtime.retrieve).toHaveBeenCalled();
    expect(env.runtime.start).toHaveBeenCalledTimes(1);

    firstExecution = { ...firstExecution!, status: "succeeded", outputs: { booklet_result: JSON.stringify(firstEnvelope!) } };
    await env.dispatcher().cycle();
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(1);
    expect(env.runtime.start).toHaveBeenCalledTimes(1);
    env.elapse(5_000);
    await env.dispatcher().cycle();
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(2);
    expect(env.runtime.start).toHaveBeenCalledTimes(2);
    expect(vi.mocked(env.runtime.start).mock.calls[1][1].runId).toBe(secondRunId);
  });
  it("preserves callback success despite a lost outer response", async () => {
    const env = await setup(); const start = env.runtime.start;
    env.runtime.start = vi.fn<WorkflowRuntime["start"]>(async (binding, input) => { await start(binding, input); return { kind: "unknown" }; });
    await env.dispatcher().advance(env.runId);
    expect((await env.repository.getRun(env.runId))?.status).toBe("queued");
    expect((await env.repository.listOperations(env.runId))[0]).toMatchObject({ state: "succeeded", verifiedWorkflowId: config.bindings.find((item) => item.role === "tester" && item.persona === "playful_kid")!.publishedWorkflowId });
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(1);
  });
  it("blocks configuration drift before dispatch and wrong publication after callback", async () => {
    const env = await setup();
    const changed = { ...config, bindings: config.bindings.map((binding) => ({ ...binding, publishedWorkflowId: randomUUID() })) };
    await createExperimentDispatcher({ database: env.database, config: changed, runtime: env.runtime, mutate: async (fn) => fn() }).advance(env.runId);
    expect(env.runtime.start).not.toHaveBeenCalled();
    expect((await env.repository.getRun(env.runId))?.status).toBe("blocked");
    const second = await setup(); const start = second.runtime.start;
    second.runtime.start = vi.fn<WorkflowRuntime["start"]>(async (binding, input) => { const result = await start(binding, input); return result.kind === "execution" ? { ...result, execution: { ...result.execution, workflow_id: randomUUID() } } : result; });
    await second.dispatcher().advance(second.runId);
    expect((await second.repository.getRun(second.runId))?.status).toBe("blocked");
    expect((await second.repository.listOperations(second.runId))[0].state).toBe("succeeded");
  });
  it("does not poll a definite publication blocker or dispatch another persona", async () => {
    const env = await setup();
    env.runtime.start = vi.fn<WorkflowRuntime["start"]>(async (_binding, input) => {
      const workflowRunId = randomUUID();
      await env.repository.claimOperation({ runId: env.runId, operationId: input.operationId, workflowRunId, parentWorkflowRunId: input.parentWorkflowRunId, nowMs: env.next() });
      return { kind: "execution", execution: { id: workflowRunId, workflow_id: randomUUID(), status: "running", outputs: {} } };
    });
    await env.dispatcher().advance(env.runId);
    const run = (await env.repository.getRun(env.runId))!;
    const operation = (await env.repository.getOperation(run.activeOperationId!))!;
    expect(run).toMatchObject({ status: "blocked", safeFailure: "definite_failure" });
    expect(operation.state).toBe("started");
    await env.dispatcher().cycle();
    expect(env.runtime.retrieve).not.toHaveBeenCalled();

    expect(env.runtime.start).toHaveBeenCalledTimes(1);
  });
  it("observes an expired unknown workflow by its original ID without releasing the persona lane", async () => {
    const env = await setup();
    await env.repository.createRun({ runId: randomUUID(), bookletId: randomUUID(), persona: "enthusiast_parent", mode: "simulated",
      configuration: configurationSnapshot(config, "enthusiast_parent"), nowMs: env.next() });
    env.runtime.start = vi.fn<WorkflowRuntime["start"]>(async (_binding, input) => {
      await env.repository.claimOperation({ runId: env.runId, operationId: input.operationId, workflowRunId: randomUUID(),
        parentWorkflowRunId: input.parentWorkflowRunId, nowMs: env.next() });
      return { kind: "unknown" };
    });
    await env.dispatcher().advance(env.runId);
    const run = (await env.repository.getRun(env.runId))!;
    const operation = (await env.repository.getOperation(run.activeOperationId!))!;
    expect(run).toMatchObject({ status: "blocked", safeFailure: "unknown_outcome" });
    await env.database.collections.experiment_operations.updateOne({ _id: operation._id }, { $set: { deadlineAtMs: 0 } });
    await env.dispatcher().cycle();
    expect(env.runtime.retrieve).toHaveBeenCalledExactlyOnceWith(vi.mocked(env.runtime.start).mock.calls[0][0], operation.workflowRunId);
    expect(env.runtime.start).toHaveBeenCalledTimes(1);
    expect(await env.repository.getRun(env.runId)).toMatchObject({ status: "blocked", safeFailure: "unknown_outcome", activeOperationId: operation._id });
    expect(await env.repository.getOperation(operation._id)).toMatchObject({ deadlineAtMs: 0, workflowRunId: operation.workflowRunId });
  });
});
