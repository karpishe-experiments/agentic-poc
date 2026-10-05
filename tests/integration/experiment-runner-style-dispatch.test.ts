import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import type { AssetStore } from "@/lib/assets/asset-store";
import type { Persona } from "@/lib/contracts/experiment-runner";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import { configurationSnapshot, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";
import { createExperimentImageStorage } from "@/lib/experiment-runner/image-storage";
import { BOOK_TASKS } from "@/lib/experiment-runner/narrative-tasks";
import type { RuntimeExecution, WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
class MemoryStore implements AssetStore {
  files = new Map<string, Uint8Array>();
  async put(uri: string, bytes: Uint8Array, mimeType: string) { this.files.set(uri, Uint8Array.from(bytes)); return { uri, mimeType, byteLength: bytes.byteLength }; }
  async get(uri: string) { const bytes = this.files.get(uri); if (!bytes) throw new Error("missing"); return Uint8Array.from(bytes); }
  async exists(uri: string) { return this.files.has(uri); }
}
async function setup(persona: Persona = "playful_kid", slots: 6 | 11 | 13 = 13) {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const store = new MemoryStore(), repository = createExperimentRepository(database, { store: () => store });
  const context = createExperimentContextService(database);
  const bindings: BookletRunnerConfig["bindings"] = [
    { role: "manager", taskId: null, persona: null },
    ...BOOK_TASKS.map((taskId) => ({ role: "specialist" as const, taskId, persona: null })),
    ...(["playful_kid", "enthusiast_parent", "professional_creator"] as const).map((persona) => ({ role: "tester" as const, taskId: null, persona })),
    { role: "image", taskId: null, persona: null },
  ].filter((item) => slots === 13 || (item.role !== "image" && item.taskId !== "J08" &&
    (slots === 11 || item.taskId === null || ["J01", "J02"].includes(item.taskId))))
    .map((item) => ({ ...item, appId: randomUUID(), publishedWorkflowId: randomUUID(), toolProviderId: null, apiKey: "test-key" })) as BookletRunnerConfig["bindings"];
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.test", publicOrigin: "https://booklet.test", callbackKey: "test-callback", bindings };
  const runId = randomUUID(), bookletId = randomUUID(); let clock = 1;
  await repository.createRun({ runId, bookletId, persona, mode: "simulated", configuration: configurationSnapshot(config, persona), nowMs: clock++ });
  const saved = new Map<string, RuntimeExecution>();
  let lostImageResponse = false, pauseImage = false, pauseBeforeClaim = false, omitImageUpload = false, wrongImageDigest = false;
  let acknowledgement: "normal" | "missing" | "nonstring" | "running" | "failed" = "normal";
  const runtime: WorkflowRuntime = {
    start: vi.fn<WorkflowRuntime["start"]>(async (binding, input) => {
      const workflowRunId = randomUUID(), identity = { runId, operationId: input.operationId, workflowRunId, parentWorkflowRunId: input.parentWorkflowRunId };
      if (binding.role === "image" && pauseBeforeClaim) {
        pauseBeforeClaim = false;
        await repository.pause({ runId, expectedRevision: (await repository.getRun(runId))!.revision, nowMs: clock++ });
        expect((await repository.claimOperation({ ...identity, nowMs: clock++ })).started).toBe(false);
        const execution: RuntimeExecution = { id: workflowRunId, workflow_id: binding.publishedWorkflowId, status: "succeeded", outputs: { authorization_reason: "paused" } };
        saved.set(workflowRunId, execution); return { kind: "execution", execution };
      }
      expect((await repository.claimOperation({ ...identity, nowMs: clock++ })).started).toBe(true);
      const operation = (await repository.getOperation(input.operationId))!;
      const operationContext = await context.getOperationContext(identity);
      let outputs: Record<string, unknown>;
      if (binding.role === "image") {
        expect(operationContext.role).toBe("image");
        if (pauseImage) await repository.pause({ runId, expectedRevision: (await repository.getRun(runId))!.revision, nowMs: clock++ });
        const bytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#74aadd" } }).png().toBuffer();
        const result = omitImageUpload ? null : await createExperimentImageStorage({ database, store, now: () => clock++ }).complete({
          identity: { ...identity, inputFingerprint: operation.inputFingerprint }, content: bytes,
        });
        outputs = { image_result: JSON.stringify({ ...identity, inputFingerprint: operation.inputFingerprint, assetId: operation._id,
          sha256: wrongImageDigest ? "b".repeat(64) : result?.operation.resultDigest ?? "a".repeat(64) }) };
      } else {
        const result = simulateNarrativeResult(operationContext, "simulated");
        const envelope = { ...identity, inputFingerprint: operation.inputFingerprint, result };
        await repository.completeOperation({ envelope: { runId, operationId: operation._id, workflowRunId, inputFingerprint: operation.inputFingerprint, result },
          parentWorkflowRunId: input.parentWorkflowRunId, nowMs: clock++ });
        outputs = { booklet_result: JSON.stringify(envelope) };
      }
      const execution: RuntimeExecution = { id: workflowRunId, workflow_id: binding.publishedWorkflowId, status: "succeeded", outputs };
      saved.set(workflowRunId, execution);
      if (binding.role === "image" && acknowledgement !== "normal") {
        return { kind: "execution", execution: { ...execution,
          status: acknowledgement === "running" ? "running" : acknowledgement === "failed" ? "failed" : "succeeded",
          outputs: acknowledgement === "nonstring" ? { image_result: {} } : {} } };
      }
      if (binding.role === "image" && lostImageResponse) { lostImageResponse = false; return { kind: "unknown" }; }
      return { kind: "execution", execution };
    }),
    retrieve: vi.fn<WorkflowRuntime["retrieve"]>(async (_binding, id) => saved.has(id) ? { kind: "execution", execution: saved.get(id)! } : { kind: "unknown" }),
  };
  const dispatcher = () => createExperimentDispatcher({ database, config, runtime, store: () => store, mutate: async (fn) => fn(), now: () => clock++ });
  async function reachSamples() {
    for (let step = 0; step < 60; step++) {
      if ((await context.getRunView(runId))?.nextNarrativeTask === "style_samples") return;
      expect(await dispatcher().advance(runId)).not.toBe("blocked");
    }
    throw new Error("No style draft");
  }
  return { database, repository, context, config, runId, store, runtime, dispatcher, reachSamples,
    faults: (value: { lost?: boolean; pause?: boolean; beforeClaim?: boolean; omitUpload?: boolean; wrongDigest?: boolean; acknowledgement?: typeof acknowledgement }) => {
      lostImageResponse = value.lost ?? false; pauseImage = value.pause ?? false;
      omitImageUpload = value.omitUpload ?? false; wrongImageDigest = value.wrongDigest ?? false;
      pauseBeforeClaim = value.beforeClaim ?? false; acknowledgement = value.acknowledgement ?? "normal";
    }, next: () => clock++ };
}
describe("automatic saved J08 sample dispatch", () => {
  it.each([6, 11] as const)("preserves the retained %s-slot no-progress hash at count two", async (slots) => {
    const env = await setup("professional_creator", slots);
    await env.dispatcher().advance(env.runId);
    const view = (await env.context.getRunView(env.runId))!;
    function ordered(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(ordered);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
      return value;
    }
    const legacyHash = createHash("sha256").update(JSON.stringify(ordered({
      artifacts: view.currentArtifacts.map(({ id, state, currentVersionId, versions }) => ({ id, state, currentVersionId, approvals: versions.map((version) => version.approval?.id ?? null) })),
      delegation: view.activeDelegation?.id ?? null, pending: view.pendingDecision, messages: view.creatorMessages.map((message) => message.id),
    }))).digest("hex");
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { progressFingerprint: legacyHash, noProgressCount: 2 } });
    const run = (await env.repository.getRun(env.runId))!;
    const operation = await env.repository.prepareOperation({ runId: env.runId, operationId: randomUUID(), expectedRevision: run.revision,
      role: "manager", taskId: null, subjectKind: "book", subjectId: run.bookletId, inputFingerprint: "f".repeat(64), attempt: 1, providerKind: "text", nowMs: env.next() });
    await env.repository.beginDispatch({ runId: env.runId, operationId: operation._id, parentWorkflowRunId: null, nowMs: env.next() });
    await env.runtime.start(env.config.bindings.find((item) => item.role === "manager")!, { runId: env.runId, operationId: operation._id, parentWorkflowRunId: null, mode: "simulated" });
    expect(await env.dispatcher().advance(env.runId)).toBe("blocked");
    expect((await env.repository.getRun(env.runId))).toMatchObject({ noProgressCount: 3, safeFailure: "definite_failure", progressFingerprint: legacyHash });
  });
  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("restarts through samples and approved style for %s", async (persona) => {
    const env = await setup(persona);
    for (let step = 0; step < 65; step++) if (await env.dispatcher().advance(env.runId) === "boundary") break;
    const view = (await env.context.getRunView(env.runId))!;
    expect(view.nextNarrativeTask).toBe("slice_complete");
    expect(view.currentArtifacts.find((item) => item.taskId === "J08")?.state).toBe("approved");
    expect(view.counters).toMatchObject({ logicalImage: 2, payableImage: 0, payableText: 0 });
    const images = (await env.repository.listOperations(env.runId)).filter((item) => item.role === "image");
    expect(images).toHaveLength(2);
    expect(images.every((item) => item.state === "succeeded" && item.verifiedWorkflowId && item.parentWorkflowRunId && item.reservationCount === 1)).toBe(true);
    expect(env.store.files.size).toBe(2);
    expect(env.runtime.retrieve).not.toHaveBeenCalled();
  });
  it("recovers a discarded image response using GET and never generates that sample twice", async () => {
    const env = await setup(); await env.reachSamples(); env.faults({ lost: true });
    await env.dispatcher().advance(env.runId);
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(1);
    for (let step = 0; step < 10; step++) if (await env.dispatcher().advance(env.runId) === "boundary") break;
    expect((await env.context.getRunView(env.runId))?.nextNarrativeTask).toBe("slice_complete");
    expect(vi.mocked(env.runtime.start).mock.calls.filter(([binding]) => binding.role === "image")).toHaveLength(2);
    expect((await env.repository.getRun(env.runId))?.counters.logicalImage).toBe(2);
  });
  it("saves an in-flight paused sample but admits no second sample until resume", async () => {
    const env = await setup(); await env.reachSamples(); env.faults({ pause: true });
    await env.dispatcher().advance(env.runId);
    expect((await env.repository.getRun(env.runId))?.status).toBe("paused");
    expect(await env.dispatcher().advance(env.runId)).toBe("waiting");
    expect(env.store.files.size).toBe(1);
    await env.repository.resume({ runId: env.runId, expectedRevision: (await env.repository.getRun(env.runId))!.revision, nowMs: env.next() });
    env.faults({});
    for (let step = 0; step < 10; step++) if (await env.dispatcher().advance(env.runId) === "boundary") break;
    expect((await env.repository.getRun(env.runId))?.counters.logicalImage).toBe(2);
  });
  it("admits only one concurrent dispatch for the same sample", async () => {
    const env = await setup(); await env.reachSamples();
    await Promise.allSettled([env.dispatcher().advance(env.runId), env.dispatcher().advance(env.runId)]);
    expect(vi.mocked(env.runtime.start).mock.calls.filter(([binding]) => binding.role === "image")).toHaveLength(1);
    expect((await env.repository.getRun(env.runId))?.counters.logicalImage).toBe(1);
    expect(await env.database.collections.experiment_operations.countDocuments({ runId: env.runId, role: "image" })).toBe(1);
  });
  it("resumes a verified unclaimed paused sample with a retained zero-reservation attempt", async () => {
    const env = await setup(); await env.reachSamples(); env.faults({ beforeClaim: true });
    await env.dispatcher().advance(env.runId);
    expect((await env.repository.getRun(env.runId))?.status).toBe("paused");
    expect(env.store.files.size).toBe(0);
    await env.repository.resume({ runId: env.runId, expectedRevision: (await env.repository.getRun(env.runId))!.revision, nowMs: env.next() });
    env.faults({});
    for (let step = 0; step < 10; step++) if (await env.dispatcher().advance(env.runId) === "boundary") break;
    expect((await env.context.getRunView(env.runId))?.nextNarrativeTask).toBe("slice_complete");
    expect((await env.repository.getRun(env.runId))?.counters.logicalImage).toBe(2);
    const images = (await env.repository.listOperations(env.runId)).filter((item) => item.role === "image");
    expect(images).toHaveLength(3);
    expect(images[0]).toMatchObject({ state: "failed", safeFailure: null, reservationCount: 0, attempt: 1 });
    expect(images[1]).toMatchObject({ state: "succeeded", reservationCount: 1, attempt: 2 });
  });
  it.each(["missing", "nonstring", "failed"] as const)("does not advance a saved upload with %s acknowledgement", async (acknowledgement) => {
    const env = await setup(); await env.reachSamples(); env.faults({ acknowledgement });
    await env.dispatcher().advance(env.runId);
    expect(env.store.files.size).toBe(1);
    expect((await env.repository.getRun(env.runId))?.status).toBe("blocked");
    const image = (await env.repository.listOperations(env.runId)).at(-1)!;
    expect(image.verifiedWorkflowId).toBeFalsy();
    const calls = vi.mocked(env.runtime.start).mock.calls.length;
    expect(await env.dispatcher().advance(env.runId)).toBe("blocked");
    expect(env.runtime.start).toHaveBeenCalledTimes(calls);
  });
  it("never verifies a missing acknowledgement before an unresolved late upload", async () => {
    const env = await setup(); await env.reachSamples(); env.faults({ omitUpload: true, acknowledgement: "missing" });
    await env.dispatcher().advance(env.runId);
    const operation = (await env.repository.listOperations(env.runId)).at(-1)!;
    expect(operation.verifiedWorkflowId).toBeFalsy();
    expect(env.store.files.size).toBe(0);
    const bytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#74aadd" } }).png().toBuffer();
    await expect(createExperimentImageStorage({ database: env.database, store: env.store, now: env.next }).complete({
      identity: { runId: env.runId, operationId: operation._id, workflowRunId: operation.workflowRunId!, parentWorkflowRunId: operation.parentWorkflowRunId, inputFingerprint: operation.inputFingerprint }, content: bytes,
    })).rejects.toThrow();
    expect((await env.repository.getOperation(operation._id))?.verifiedWorkflowId).toBeFalsy();
    expect(await env.dispatcher().advance(env.runId)).toBe("blocked");
    expect(vi.mocked(env.runtime.start).mock.calls.filter(([binding]) => binding.role === "image")).toHaveLength(1);
  });
  it("waits for a successful acknowledgement after upload and recovers it with GET", async () => {
    const env = await setup(); await env.reachSamples(); env.faults({ acknowledgement: "running" });
    await env.dispatcher().advance(env.runId);
    expect((await env.repository.listOperations(env.runId)).at(-1)?.verifiedWorkflowId).toBeFalsy();
    expect(env.store.files.size).toBe(1);
    const retrieve = env.runtime.retrieve;
    let pending = true;
    env.runtime.retrieve = vi.fn<WorkflowRuntime["retrieve"]>(async (binding, id) => {
      const result = await retrieve(binding, id);
      if (pending && result.kind === "execution") {
        pending = false; return { kind: "execution", execution: { ...result.execution, status: "running", outputs: {} } };
      }
      return result;
    });
    expect(await env.dispatcher().advance(env.runId)).toBe("waiting");
    expect((await env.repository.getRun(env.runId))?.status).not.toBe("blocked");
    env.faults({});
    for (let step = 0; step < 10; step++) if (await env.dispatcher().advance(env.runId) === "boundary") break;
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(2);
    expect((await env.context.getRunView(env.runId))?.nextNarrativeTask).toBe("slice_complete");
    expect((await env.repository.getRun(env.runId))?.counters.logicalImage).toBe(2);
  });
  it("bounds a nonterminal acknowledgement after upload without replay", async () => {
    const env = await setup(); await env.reachSamples(); env.faults({ acknowledgement: "running" });
    await env.dispatcher().advance(env.runId);
    const image = (await env.repository.listOperations(env.runId)).at(-1)!;
    await env.database.collections.experiment_operations.updateOne({ _id: image._id }, { $set: { deadlineAtMs: 0 } });
    const retrieve = env.runtime.retrieve;
    env.runtime.retrieve = vi.fn<WorkflowRuntime["retrieve"]>(async (binding, id) => {
      const result = await retrieve(binding, id);
      return result.kind === "execution" ? { kind: "execution", execution: { ...result.execution, status: "running", outputs: {} } } : result;
    });
    expect(await env.dispatcher().advance(env.runId)).toBe("blocked");
    expect((await env.repository.getRun(env.runId))?.safeFailure).toBe("unknown_outcome");
    expect(vi.mocked(env.runtime.start).mock.calls.filter(([binding]) => binding.role === "image")).toHaveLength(1);
  });
  it("blocks a no-ID image outcome without replaying its POST", async () => {
    const env = await setup(); await env.reachSamples();
    env.runtime.start = vi.fn<WorkflowRuntime["start"]>(async () => ({ kind: "unknown" }));
    await env.dispatcher().advance(env.runId); await env.dispatcher().advance(env.runId);
    expect(env.runtime.start).toHaveBeenCalledTimes(1);
    expect(env.runtime.retrieve).not.toHaveBeenCalled();
    expect((await env.repository.getRun(env.runId))?.safeFailure).toBe("unknown_outcome");
    expect((await env.repository.getRun(env.runId))?.counters.logicalImage).toBe(0);
  });
  it.each([{ omitUpload: true }, { wrongDigest: true }])("blocks an image acknowledgement inconsistent with saved bytes: %j", async (fault) => {
    const env = await setup(); await env.reachSamples(); env.faults(fault);
    await env.dispatcher().advance(env.runId);
    expect((await env.repository.getRun(env.runId))?.status).toBe("blocked");
    const calls = vi.mocked(env.runtime.start).mock.calls.length;
    expect(await env.dispatcher().advance(env.runId)).toBe("blocked");
    expect(env.runtime.start).toHaveBeenCalledTimes(calls);
    expect((await env.repository.getRun(env.runId))?.counters.logicalImage).toBe(1);
  });
  it("does not regenerate missing completed sample files during assembly", async () => {
    const env = await setup(); await env.reachSamples();
    await env.dispatcher().advance(env.runId); await env.dispatcher().advance(env.runId);
    env.store.files.clear();
    expect(await env.dispatcher().advance(env.runId)).toBe("blocked");
    expect((await env.repository.getRun(env.runId))?.counters.logicalImage).toBe(2);
    expect(vi.mocked(env.runtime.start).mock.calls.filter(([binding]) => binding.role === "image")).toHaveLength(2);
  });
});
