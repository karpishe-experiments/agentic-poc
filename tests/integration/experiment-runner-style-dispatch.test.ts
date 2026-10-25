import { createHash, randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { MongoServerError, type Collection, type Document } from "mongodb";
import { withMongoTransaction, type Database } from "@/db/client";
import { verifyCurrentPageBibleSources, verifyCurrentPaginationSources, verifyCurrentPageIllustrationSources } from "@/db/experiment-pages";
import * as pageVerification from "@/db/experiment-pages";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExperimentPageBatchRepository } from "@/db/experiment-page-batches";
import { materializeNarrativeResult, approveAssembledDelegation } from "@/db/experiment-narrative";
import { verifyExperimentGeneration, createExperimentCompletionService } from "@/db/experiment-completion";
import type { AssetStore } from "@/lib/assets/asset-store";
import type { Persona, RoleResult } from "@/lib/contracts/experiment-runner";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import { configurationSnapshot, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";
import { simulatedExperimentReport } from "@/lib/experiment-runner/report-fixtures";
import { createExperimentImageStorage } from "@/lib/experiment-runner/image-storage";
import { BOOK_TASKS } from "@/lib/experiment-runner/narrative-tasks";
import { parseStoredPageLayout } from "@/lib/contracts/experiment-pages";
import type { RuntimeExecution, WorkflowRuntime } from "@/lib/experiment-runner/transport";
import type { ReferenceUploadResult } from "@/lib/experiment-runner/reference-transport";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestPolicy } from "@/tests/helpers/m4-policy";
import { m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { createExperimentPageIllustrationAssembly } from "@/db/experiment-page-illustrations";
import { retainM4ImageTestPolicy } from "@/tests/helpers/m4-image-state";

const databases: Database[] = [];
async function profileHandoff(env: Awaited<ReturnType<typeof setup>>, name: string, throughApproval = false) {
  const queries = (Object.values(env.database.collections) as unknown as Collection<Document>[]).flatMap((collection) => [
    vi.spyOn(collection, "find"), vi.spyOn(collection, "findOne"), vi.spyOn(collection, "aggregate"),
  ]);
  const reads = vi.spyOn(env.store, "get");
  const before = vi.mocked(env.runtime.start).mock.calls.length;
  const start = performance.now();
  expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
  let calls = 1;
  if (throughApproval) {
    const image = (await env.repository.listOperations(env.runId)).at(-1)!;
    const target = () => env.database.collections.artifacts.findOne({ experimentRunId: env.runId,
      taskId: "J13", subjectId: image.subjectId });
    if ((await target())?.state === "draft") {
      expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
      calls++;
    }
    expect(await target()).toMatchObject({ state: "approved" });
  }
  const elapsedMs = Math.round(performance.now() - start);
  const queryCount = queries.reduce((count, spy) => count + spy.mock.calls.length, 0);
  const storageReads = reads.mock.calls.length;
  const profile = JSON.stringify({ event: "handoff_profile", name, elapsedMs, queryCount, storageReads });
  if (process.env.EXPERIMENT_PROFILE_PATH) appendFileSync(process.env.EXPERIMENT_PROFILE_PATH, `${profile}\n`);
  expect(env.runtime.start).toHaveBeenCalledTimes(before + calls);
  queries.forEach((spy) => spy.mockRestore());
  reads.mockRestore();
  return { queryCount, elapsedMs, storageReads };
}
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.splice(0).map(closeTestDatabase)); });
class MemoryStore implements AssetStore {
  files = new Map<string, Uint8Array>();
  async put(uri: string, bytes: Uint8Array, mimeType: string) { this.files.set(uri, Uint8Array.from(bytes)); return { uri, mimeType, byteLength: bytes.byteLength }; }
  async get(uri: string) { const bytes = this.files.get(uri); if (!bytes) throw new Error("missing"); return Uint8Array.from(bytes); }
  async exists(uri: string) { return this.files.has(uri); }
}
async function setup(persona: Persona = "playful_kid", slots: 6 | 11 | 13 | 15 | 16 | 17 | 18 = 13, finalPages = false,
  failedReport?: "tester" | "judge") {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const store = new MemoryStore(), repository = createExperimentRepository(database, { store: () => store });
  const context = createExperimentContextService(database, { store: () => store });
  const bindings: BookletRunnerConfig["bindings"] = [
    { role: "manager", taskId: null, persona: null },
    ...BOOK_TASKS.map((taskId) => ({ role: "specialist" as const, taskId, persona: null })),
    ...(["J09", "J10"] as const).map((taskId) => ({ role: "specialist" as const, taskId, persona: null })),
    ...(slots >= 16 ? [{ role: "specialist" as const, taskId: "J11" as const, persona: null }] : []),
    ...(slots >= 17 ? [{ role: "specialist" as const, taskId: "J12" as const, persona: null }] : []),
    ...(slots === 18 ? [{ role: "judge" as const, taskId: null, persona: null }] : []),
    ...(["playful_kid", "enthusiast_parent", "professional_creator"] as const).map((persona) => ({ role: "tester" as const, taskId: null, persona })),
    { role: "image", taskId: null, persona: null },
  ].filter((item) => slots >= 15 || (item.taskId !== "J09" && item.taskId !== "J10" && (slots === 13 || (item.role !== "image" && item.taskId !== "J08" &&
    (slots === 11 || item.taskId === null || ["J01", "J02"].includes(item.taskId))))))
    .map((item) => ({ ...item, appId: randomUUID(), publishedWorkflowId: randomUUID(), toolProviderId: null, apiKey: "test-key" })) as BookletRunnerConfig["bindings"];
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.test", publicOrigin: "https://booklet.test", callbackKey: "test-callback", bindings };
  if (finalPages) {
    if (slots < 17) throw new Error("Final page fixture requires at least seventeen bindings.");
    bindings.find((item) => item.role === "image")!.finalPageIllustration = true;
  }
  const runId = randomUUID(), bookletId = randomUUID(); let clock = 1;
  await repository.createRun({ runId, bookletId, persona, mode: "simulated", configuration: configurationSnapshot(config, persona), nowMs: clock++ });
  const saved = new Map<string, RuntimeExecution>();
  let lostImageResponse = false, pauseImage = false, pauseBeforeClaim = false, omitImageUpload = false, wrongImageDigest = false, corruptSavedPage = false;
  let lostPaginationResponse = false, lostManagerPaginationResponse = false, lostPageBibleResponse = false, pageClarification = false;
  let paginationTerminal: "failed" | "stopped" | null = null;
  let reverseReferenceReadback = false;
  let nullReferenceReadback = false;
  let lostJudgeResponse = false;
  let lostBeforeUpload = false;
  let lateImage: { identity: { runId: string; operationId: string; workflowRunId: string; parentWorkflowRunId: string | null; inputFingerprint: string }; binding: BookletRunnerConfig["bindings"][number]; referenceFileIds: string[] | undefined } | null = null;
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
      if (binding.role === failedReport && "reportEvidence" in operationContext) {
        const execution: RuntimeExecution = { id: workflowRunId, workflow_id: binding.publishedWorkflowId, status: "failed", outputs: {} };
        saved.set(workflowRunId, execution);
        return { kind: "execution", execution };
      }
      let outputs: Record<string, unknown>;
      if (binding.role === "image") {
        expect(operationContext.role).toBe("image");
        if (lostBeforeUpload && operation.taskId === "J13") {
          lostBeforeUpload = false;
          lateImage = { identity: { ...identity, inputFingerprint: operation.inputFingerprint }, binding, referenceFileIds: input.referenceFileIds };
          saved.set(workflowRunId, { id: workflowRunId, workflow_id: binding.publishedWorkflowId, status: "running", outputs: {} });
          return { kind: "unknown" };
        }
        if (pageClarification && operation.taskId === "J13") {
          pageClarification = false;
          const result: RoleResult = { kind: "clarification", payload: { question: "Should the robot look pleased in this approved scene?" } };
          const envelope = { ...identity, inputFingerprint: operation.inputFingerprint, result };
          await repository.completeOperation({ envelope: { runId, operationId: input.operationId, workflowRunId,
            inputFingerprint: operation.inputFingerprint, result }, parentWorkflowRunId: input.parentWorkflowRunId, nowMs: clock++ });
          const lateBytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#74aadd" } }).png().toBuffer();
          await expect(createExperimentImageStorage({ database, store, now: () => clock++ }).complete({
            identity: { ...identity, inputFingerprint: operation.inputFingerprint }, content: lateBytes,
          })).rejects.toThrow();
          const execution: RuntimeExecution = { id: workflowRunId, workflow_id: binding.publishedWorkflowId, status: "succeeded", outputs: { booklet_result: JSON.stringify(envelope) } };
          saved.set(workflowRunId, execution);
          return { kind: "execution", execution };
        }
        if (pauseImage) await repository.pause({ runId, expectedRevision: (await repository.getRun(runId))!.revision, nowMs: clock++ });
        if (operation.taskId === "J13" && "answers" in operationContext && operationContext.answers?.length) {
          expect(operationContext.answers.some((answer) => answer.question === "Should the robot look pleased in this approved scene?" && answer.answer)).toBe(true);
        }
        const bytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#74aadd" } }).png().toBuffer();
        const result = omitImageUpload ? null : await createExperimentImageStorage({ database, store, now: () => clock++ }).complete({
          identity: { ...identity, inputFingerprint: operation.inputFingerprint }, content: bytes,
        });
        if (corruptSavedPage && operation.taskId === "J13" && result?.asset) store.files.set(result.asset.uri, new Uint8Array([1]));
        outputs = { image_result: JSON.stringify({ ...identity, inputFingerprint: operation.inputFingerprint, assetId: operation._id,
          sha256: wrongImageDigest ? "b".repeat(64) : result?.operation.resultDigest ?? "a".repeat(64) }) };
        if (operation.taskId === "J13" && input.referenceFileIds !== undefined) {
          const referenceIds = [...(input.referenceFileIds ?? [])];
          if (reverseReferenceReadback) referenceIds.reverse();
          outputs.reference_files = referenceIds.map((record_id) => ({ type: "image", transfer_method: "local_file",
            reference: `dify-file-ref:${Buffer.from(JSON.stringify({ record_id })).toString("base64url")}` }));
        }
        if (operation.taskId === "J13" && nullReferenceReadback) outputs.reference_files = null;
      } else {
        const result = simulateNarrativeResult(operationContext, "simulated");
        const envelope = { ...identity, inputFingerprint: operation.inputFingerprint, result };
        const lostManager = binding.role === "manager" && lostManagerPaginationResponse &&
          result.kind === "delegate" && result.payload.taskId === "J11";
        if (!(binding.taskId === "J11" && (lostPaginationResponse || paginationTerminal)) &&
            !(binding.taskId === "J12" && lostPageBibleResponse) && !lostManager && result.kind !== "feedback" && result.kind !== "assessment") {
          await repository.completeOperation({ envelope: { runId, operationId: operation._id, workflowRunId, inputFingerprint: operation.inputFingerprint, result },
            parentWorkflowRunId: input.parentWorkflowRunId, nowMs: clock++ });
        }
        outputs = binding.taskId === "J11" && paginationTerminal ? {} : { booklet_result: JSON.stringify(envelope) };
      }
      const execution: RuntimeExecution = { id: workflowRunId, workflow_id: binding.publishedWorkflowId,
        status: binding.taskId === "J11" && paginationTerminal ? paginationTerminal : "succeeded", outputs };
      saved.set(workflowRunId, execution);
      if (binding.role === "judge" && lostJudgeResponse) { lostJudgeResponse = false; return { kind: "unknown" }; }
      if (binding.taskId === "J11" && lostPaginationResponse) { lostPaginationResponse = false; return { kind: "unknown" }; }
      if (binding.taskId === "J12" && lostPageBibleResponse) { lostPageBibleResponse = false; return { kind: "unknown" }; }
      if (binding.role === "manager" && lostManagerPaginationResponse && outputs.booklet_result &&
          JSON.parse(outputs.booklet_result as string).result?.payload?.taskId === "J11") {
        lostManagerPaginationResponse = false; return { kind: "unknown" };
      }
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
  const uploadReference = vi.fn(async (_binding: BookletRunnerConfig["bindings"][number], _runId: string, bytes: Uint8Array): Promise<ReferenceUploadResult> => ({
    kind: "uploaded" as const, id: randomUUID(), byteLength: bytes.byteLength, mimeType: "image/png" as const,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }));
  const dispatcher = () => createExperimentDispatcher({ database, config, runtime, uploadReference, store: () => store, mutate: async (fn) => fn(), now: () => clock++ });
  async function reachSamples() {
    for (let step = 0; step < 60; step++) {
      if ((await context.getRunView(runId))?.nextNarrativeTask === "style_samples") return;
      expect(await dispatcher().advance(runId)).not.toBe("blocked");
    }
    throw new Error("No style draft");
  }
  async function reachSheet(kind: "image" | "review") {
    for (let step = 0; step < 100; step++) {
      const view = await context.getRunView(runId);
      if (view?.nextSheetWork?.kind === kind) return view;
      expect(await dispatcher().advance(runId)).not.toBe("blocked");
    }
    throw new Error("No pending sheet work");
  }
  async function reachPagination() {
    for (let step = 0; step < 100; step++) {
      if ((await context.getRunView(runId))?.nextNarrativeTask === "J11") return;
      expect(await dispatcher().advance(runId)).not.toBe("blocked");
    }
    throw new Error("No pagination work");
  }
  async function reachPageImageWithReferences() {
    for (let step = 0; step < 160; step++) {
      const view = await context.getRunView(runId);
      const last = (await repository.listOperations(runId)).at(-1);
      if (view?.nextNarrativeTask === "J13" && view.nextPageIllustrationWork &&
          "pageIndex" in view.nextPageIllustrationWork && view.nextPageIllustrationWork.pageIndex > 0 &&
          last?.role === "manager" && last.state === "succeeded" &&
          JSON.parse(last.resultJson ?? "null")?.payload?.taskId === "J13") return;
      expect(await dispatcher().advance(runId)).not.toBe("blocked");
    }
    throw new Error("No manager-selected story page image.");
  }
  async function testerDecision(result: RoleResult, recover = false, dispatched = false, unverified = false, role: "tester" | "judge" = "tester") {
    const run = (await repository.getRun(runId))!, operationId = randomUUID(), workflowRunId = randomUUID();
    const operation = await repository.prepareOperation({ runId, operationId, expectedRevision: run.revision, role, taskId: null,
      subjectKind: "book", subjectId: run.bookletId, providerKind: "text", attempt: 1, inputFingerprint: randomUUID().replaceAll("-", "").repeat(2), nowMs: clock++ });
    if (recover || dispatched) await repository.beginDispatch({ runId, operationId, parentWorkflowRunId: null, nowMs: clock++ });
    await repository.claimOperation({ runId, operationId, workflowRunId, parentWorkflowRunId: null, nowMs: clock++ });
    if (dispatched && unverified) {
      const reportContext = await context.getOperationContext({ runId, operationId, workflowRunId, parentWorkflowRunId: null });
      expect(simulateNarrativeResult(reportContext, "simulated")).toMatchObject({ kind: role === "tester" ? "feedback" : "assessment",
        payload: { intent: { status: "not_assessed" }, evidence: { inspectedAssetIds: [] } } });
    }
    if (recover) await repository.recordDispatchOutcome({ runId, operationId, parentWorkflowRunId: null, category: "unknown_outcome", nowMs: clock++ });
    if (dispatched && !unverified) await repository.verifyDispatchPublication({ runId, operationId, workflowRunId, parentWorkflowRunId: null,
      workflowId: bindings.find((binding) => binding.role === role && binding.persona === (role === "tester" ? persona : null))!.publishedWorkflowId, nowMs: clock++ });
    const completed = await repository.completeOperation({ envelope: { runId, operationId, workflowRunId, inputFingerprint: operation.inputFingerprint, result }, parentWorkflowRunId: null, nowMs: clock++ });
    return completed;
  }
  return { database, repository, context, config, runId, store, runtime, uploadReference, dispatcher, reachSamples, reachSheet, reachPagination, reachPageImageWithReferences, testerDecision,
    async finishLateImage(invalidIdentity = false) {
      if (!lateImage) throw new Error("No retained late image callback.");
      const bytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#74aadd" } }).png().toBuffer();
      const result = await createExperimentImageStorage({ database, store, now: () => clock++ }).complete({
        identity: { ...lateImage.identity, ...(invalidIdentity ? { workflowRunId: randomUUID() } : {}) }, content: bytes,
      });
      saved.set(lateImage.identity.workflowRunId, { id: lateImage.identity.workflowRunId,
        workflow_id: lateImage.binding.publishedWorkflowId, status: "succeeded", outputs: {
          image_result: JSON.stringify({ ...lateImage.identity, assetId: lateImage.identity.operationId, sha256: result.operation.resultDigest }),
          ...(lateImage.referenceFileIds ? { reference_files: lateImage.referenceFileIds.map((record_id) => ({ type: "image", transfer_method: "local_file",
            reference: `dify-file-ref:${Buffer.from(JSON.stringify({ record_id })).toString("base64url")}` })) } : {}),
        } });
      return result;
    },
    faults: (value: { lostBeforeUpload?: boolean; lostJudge?: boolean; nullReferences?: boolean; reverseReferences?: boolean; pageClarification?: boolean; lost?: boolean; corruptSavedPage?: boolean; lostPagination?: boolean; lostManagerPagination?: boolean; lostPageBible?: boolean; paginationTerminal?: "failed" | "stopped"; pause?: boolean; beforeClaim?: boolean; omitUpload?: boolean; wrongDigest?: boolean; acknowledgement?: typeof acknowledgement }) => {
      lostBeforeUpload = value.lostBeforeUpload ?? false;
      lostJudgeResponse = value.lostJudge ?? false;
      reverseReferenceReadback = value.reverseReferences ?? false;
      nullReferenceReadback = value.nullReferences ?? false;
      pageClarification = value.pageClarification ?? false;
      lostImageResponse = value.lost ?? false; pauseImage = value.pause ?? false;
      corruptSavedPage = value.corruptSavedPage ?? false;
      lostPaginationResponse = value.lostPagination ?? false;
      lostManagerPaginationResponse = value.lostManagerPagination ?? false;
      lostPageBibleResponse = value.lostPageBible ?? false;
      paginationTerminal = value.paginationTerminal ?? null;
      omitImageUpload = value.omitUpload ?? false; wrongImageDigest = value.wrongDigest ?? false;
      pauseBeforeClaim = value.beforeClaim ?? false; acknowledgement = value.acknowledgement ?? "normal";
    }, next: () => clock++, elapse: (ms: number) => { clock += ms; } };
}
describe("automatic saved J08 sample dispatch", () => {
  it("approves a retained Balanced J13 assembly through the saved grant only after original-byte verification", async () => {
    const env = await setup("playful_kid", 18, true);
    for (let step = 0; step < 120; step++) {
      if ((await env.context.getRunView(env.runId))?.nextNarrativeTask === "slice_complete") break;
      expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
    }
    const retained = await retainM4ImageTestPolicy(env.database, env.runId, { ...m4TestPolicy(),
      publications: env.config.bindings.map(({ role, taskId, persona, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({
        role, taskId, persona, appId, publishedWorkflowId, toolProviderId, ...(finalPageIllustration ? { finalPageIllustration } : {}),
      })),
    });
    const artifact = (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J13" }))!;
    const version = (await env.database.collections.artifact_versions.findOne({ _id: artifact.currentVersionId! }))!;
    const content = JSON.parse(version.contentJson) as { assetId: string };
    const asset = (await env.database.collections.assets.findOne({ _id: content.assetId }))!;
    const original = env.store.files.get(asset.uri)!;
    // A retained assembled draft with the original valid delegation, not a new
    // tester decision. All surrounding approved evidence remains intact.
    await env.database.collections.artifacts.updateOne({ _id: artifact._id }, { $set: { state: "draft" } });
    await env.database.collections.approvals.deleteMany({ experimentRunId: env.runId, artifactVersionId: version._id });
    env.store.files.set(asset.uri, new Uint8Array([1]));
    await expect(approveAssembledDelegation(env.database, env.runId, version._id, env.next(), () => env.store)).rejects.toThrow();
    expect(await env.database.collections.approvals.countDocuments({ artifactVersionId: version._id })).toBe(0);
    env.store.files.set(asset.uri, original);
    expect(await approveAssembledDelegation(env.database, env.runId, version._id, env.next(), () => env.store)).toBe(true);
    expect(await env.database.collections.approvals.findOne({ artifactVersionId: version._id })).toMatchObject({
      origin: "delegated", delegationId: retained.activeDelegationId,
    });
    expect((await env.repository.getRun(env.runId))!.counters).toEqual(retained.counters);
    expect(await env.database.collections.artifacts.findOne({ _id: artifact._id })).toMatchObject({ state: "approved" });
  }, 120_000);
  it("prepares Balanced reports from independently verified generation without claiming or changing records", async () => {
    const env = await setup("playful_kid", 18, true);
    for (let step = 0; step < 120; step++) {
      if ((await env.context.getRunView(env.runId))?.nextNarrativeTask === "slice_complete") break;
      expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
    }
    const complete = await createExperimentCompletionService(env.database, env.store).markGenerationComplete({ runId: env.runId,
      expectedRevision: (await env.repository.getRun(env.runId))!.revision, nowMs: env.next() });
    const operationId = randomUUID();
    await env.repository.prepareOperation({ runId: env.runId, operationId, expectedRevision: complete.revision,
      role: "tester", taskId: null, subjectKind: "book", subjectId: complete.bookletId,
      providerKind: "text", attempt: 1, inputFingerprint: "b".repeat(64), nowMs: env.next() });
    // Construct synthetic retained Balanced evidence in this isolated test DB.
    // The runtime does not relabel records or enable Balanced generation/claims.
    const policy = m4PolicySnapshot({ ...m4TestPolicy(), publications: env.config.bindings.map((binding) => ({
      role: binding.role, taskId: binding.taskId, persona: binding.persona, appId: binding.appId,
      publishedWorkflowId: binding.publishedWorkflowId, toolProviderId: binding.toolProviderId,
      ...(binding.finalPageIllustration === true ? { finalPageIllustration: true } : {}),
    })) });
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: {
      mode: "balanced", m4: { campaignId: randomUUID(), policyHash: policy.hash, policyJson: policy.json },
    } });
    await env.database.collections.experiment_operations.updateMany({ runId: env.runId }, { $set: { mode: "balanced" } });
    const identity = { runId: env.runId, operationId, nowMs: env.next() };
    const records = async () => ({ run: await env.repository.getRun(env.runId), operations: await env.repository.listOperations(env.runId),
      artifacts: await env.database.collections.artifacts.find({ experimentRunId: env.runId }).toArray(),
      versions: await env.database.collections.artifact_versions.find({}).toArray(),
      approvals: await env.database.collections.approvals.find({ experimentRunId: env.runId }).toArray(),
      campaigns: await env.database.collections.experiment_campaigns.find({}).toArray() });
    const before = await records(), posts = vi.mocked(env.runtime.start).mock.calls.length;
    const reads = vi.spyOn(env.store, "get");
    const prepared = await env.context.getPreparationContext(identity);
    expect(prepared).toMatchObject({ role: "tester", reportEvidence: { mode: "balanced", versionIds: complete.generationVersionIds } });
    expect(prepared.imageEvidence?.finalPages).toHaveLength(4);
    expect(prepared.imageEvidence?.referenceAssetIds).toHaveLength(5);
    expect(reads).toHaveBeenCalledTimes(9);
    await env.context.getPreparationContext(identity);
    expect(reads).toHaveBeenCalledTimes(18); // A new projection rereads every original.
    await expect(env.context.getOperationContext({ runId: env.runId, operationId, workflowRunId: randomUUID(), parentWorkflowRunId: null }))
      .rejects.toThrow("Operation claim identity is not current");
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { activeOperationId: null } });
    await expect(withMongoTransaction(env.database, async (session) => verifyExperimentGeneration(env.database, session,
      (await env.repository.getRun(env.runId))!, env.store))).rejects.toThrow("complete attributable accounting");
    const page = before.operations.find((item) => item.role === "image" && item.taskId === "J13")!;
    expect((await createExperimentPageIllustrationAssembly({ database: env.database, store: env.store }).assemble({
      runId: env.runId, pageId: page.subjectId, imageOperationId: page._id })).reused).toBe(true);
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { activeOperationId: operationId } });
    expect(await records()).toEqual(before);

    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { "m4.policyHash": "0".repeat(64) } });
    await expect(env.context.getPreparationContext(identity)).rejects.toThrow("active Balanced work");
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { "m4.policyHash": policy.hash } });
    for (const taskId of ["J08", "J09", "J13"] as const) {
      const image = before.operations.find((item) => item.role === "image" && item.taskId === taskId)!;
      await env.database.collections.experiment_operations.updateOne({ _id: image._id }, { $set: { mode: "simulated" } });
      await expect(env.context.getPreparationContext(identity)).rejects.toThrow();
      await env.database.collections.experiment_operations.updateOne({ _id: image._id }, { $set: { mode: "balanced" } });
    }
    const manager = before.operations.find((item) => item.workflowRunId === page.parentWorkflowRunId)!;
    await env.database.collections.experiment_operations.updateOne({ _id: manager._id }, { $set: { mode: "simulated" } });
    await expect(env.context.getPreparationContext(identity)).rejects.toThrow("verified manager parent");
    await env.database.collections.experiment_operations.updateOne({ _id: manager._id }, { $set: { mode: "balanced" } });
    const approval = before.approvals.find((item) => item.artifactVersionId === prepared.imageEvidence!.finalPages[0].versionId)!;
    await env.database.collections.approvals.updateOne({ _id: approval._id }, { $set: { action: "reject" } });
    await expect(env.context.getPreparationContext(identity)).rejects.toThrow();
    await env.database.collections.approvals.replaceOne({ _id: approval._id }, approval);
    const edge = (await env.database.collections.artifact_dependencies.findOne({ downstreamVersionId: approval.artifactVersionId }))!;
    await env.database.collections.artifact_dependencies.deleteOne({ _id: edge._id });
    await expect(env.context.getPreparationContext(identity)).rejects.toThrow("dependency edges");
    await env.database.collections.artifact_dependencies.insertOne(edge);
    for (const assetId of [prepared.imageEvidence!.referenceAssetIds[0], prepared.imageEvidence!.finalPages[0].assetId]) {
      const asset = (await env.database.collections.assets.findOne({ _id: assetId }))!;
      const original = env.store.files.get(asset.uri)!;
      env.store.files.set(asset.uri, new Uint8Array([1]));
      await expect(env.context.getPreparationContext(identity)).rejects.toThrow();
      env.store.files.set(asset.uri, original);
    }
    expect(await records()).toEqual(before);
    await env.database.collections.experiment_operations.updateOne({ _id: operationId }, { $set: { role: "judge" } });
    await expect(env.context.getPreparationContext(identity)).rejects.toThrow("one tester report");
    const prior = before.operations.find((item) => item._id === operationId)!;
    const report = { ...simulatedExperimentReport({ ...prepared.reportEvidence!, mode: "simulated" }), mode: "balanced" };
    const testerReportId = randomUUID();
    await env.database.collections.experiment_operations.insertOne({ ...prior, _id: testerReportId, idempotencyKey: "c".repeat(64), state: "succeeded", reservationCount: 1,
      workflowRunId: randomUUID(), dispatchStartedAtMs: identity.nowMs,
      verifiedWorkflowId: env.config.bindings.find((item) => item.role === "tester" && item.persona === "playful_kid")!.publishedWorkflowId,
      resultJson: JSON.stringify({ kind: "feedback", payload: report }) });
    const judgeBefore = await records();
    expect(await env.context.getPreparationContext(identity)).toMatchObject({ role: "judge", reportEvidence: { mode: "balanced" } });
    expect(await records()).toEqual(judgeBefore);
    await env.database.collections.experiment_operations.updateOne({ _id: testerReportId }, { $set: { mode: "simulated" } });
    await expect(env.context.getPreparationContext(identity)).rejects.toThrow("report evidence is invalid");
    expect(env.runtime.start).toHaveBeenCalledTimes(posts);
  }, 120_000);

  it.each(["revoked", "narrowed"] as const)("does not auto-approve assembled style under a %s grant", async (kind) => {
    const env = await setup("playful_kid", 13);
    await env.reachSamples();
    await env.dispatcher().advance(env.runId);
    await env.dispatcher().advance(env.runId);
    const run = (await env.repository.getRun(env.runId))!;
    await env.database.collections.experiment_delegations.updateOne({ _id: run.activeDelegationId! },
      { $set: kind === "revoked" ? { revokedAtMs: env.next() } : { taskIds: ["J01"] } });
    expect(await env.dispatcher().advance(env.runId)).toBe("advanced");
    const view = (await env.context.getRunView(env.runId))!;
    const style = view.currentArtifacts.find((artifact) => artifact.taskId === "J08")!;
    expect(style.state).toBe("draft");
    expect(style.versions.find((version) => version.id === style.currentVersionId)?.approval).toBeNull();
    expect(view.nextNarrativeTask).toBe("tester");
    expect(view.counters.logicalText).toBe(run.counters.logicalText);
  });
  it("profiles the manager to specialist handoff with real persistence", async () => {
    const env = await setup("playful_kid", 18, true);
    await env.dispatcher().advance(env.runId); // Initial delegation.
    await env.dispatcher().advance(env.runId); // Manager selects J01.
    const profile = await profileHandoff(env, "manager_specialist");
    if (!process.env.EXPERIMENT_PROFILE_BASELINE) expect(profile.queryCount).toBeLessThan(125);
    expect((await env.repository.listOperations(env.runId)).at(-1)).toMatchObject({ role: "specialist", taskId: "J01", reservationCount: 1 });
  });

  it("profiles the manager to image handoff with three real reference assets", async () => {
    const env = await setup("playful_kid", 18, true);
    await env.reachPageImageWithReferences();
    env.uploadReference.mockClear();
    const profile = await profileHandoff(env, "manager_image_three_references_through_approval", true);
    if (!process.env.EXPERIMENT_PROFILE_BASELINE) expect(profile.storageReads).toBeLessThan(75);
    expect(env.uploadReference).toHaveBeenCalledTimes(3);
    expect((await env.repository.listOperations(env.runId)).findLast((operation) => operation.role === "image"))
      .toMatchObject({ taskId: "J13", reservationCount: 1 });
  }, 90_000);
  it.each((["failed", "stopped"] as const).flatMap((status) =>
    [false, true].flatMap((unknown) => (["image", "tester"] as const).map((role) => ({ status, unknown, role })))))
  ("retains callback-completed $role output after runtime $status with unknown=$unknown", async ({ status, unknown, role }) => {
    const env = await setup("playful_kid", 13);
    await env.dispatcher().advance(env.runId);
    const operation = (await env.repository.listOperations(env.runId)).at(-1)!;
    await env.database.collections.experiment_operations.updateOne({ _id: operation._id }, {
      $set: { role, verifiedWorkflowId: null, nextObservationAtMs: null },
    });
    if (unknown) await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, {
      $set: { status: "blocked", safeFailure: "unknown_outcome" },
    });
    const binding = env.config.bindings.find((item) => item.role === role &&
      (role === "image" || item.persona === "playful_kid"))!;
    await expect(env.repository.recordTerminalConflict({ runId: env.runId, operationId: operation._id,
      workflowRunId: operation.workflowRunId!, parentWorkflowRunId: operation.parentWorkflowRunId,
      workflowId: randomUUID(), status, nowMs: env.next() })).rejects.toThrow("Terminal conflict differs");
    vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "execution", execution: {
      id: operation.workflowRunId!, workflow_id: binding.publishedWorkflowId, status, outputs: {},
    } });
    const starts = vi.mocked(env.runtime.start).mock.calls.length;
    expect(await env.dispatcher().cycle()).toBe("waiting");
    expect(await env.repository.getRun(env.runId)).toMatchObject({ status: "blocked", safeFailure: "definite_failure" });
    expect(await env.repository.getOperation(operation._id)).toMatchObject({ state: "succeeded", resultJson: operation.resultJson });
    await env.dispatcher().cycle();
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(1);
    expect(env.runtime.start).toHaveBeenCalledTimes(starts);
  });
  it("recovers callback-completed unknown work through its saved ID and preserves Pause", async () => {
    const env = await setup("playful_kid", 13);
    await env.dispatcher().advance(env.runId);
    const operation = (await env.repository.listOperations(env.runId)).at(-1)!;
    await env.database.collections.experiment_operations.updateOne({ _id: operation._id }, {
      $set: { verifiedWorkflowId: null, nextObservationAtMs: null, deadlineAtMs: 1 },
    });
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, {
      $set: { status: "blocked", safeFailure: "unknown_outcome", activeOperationId: null, pauseRequested: true },
    });
    const starts = vi.mocked(env.runtime.start).mock.calls.length;
    const retrieve = vi.mocked(env.runtime.retrieve).getMockImplementation()!;
    vi.mocked(env.runtime.retrieve).mockImplementationOnce(async (binding, id) => {
      const result = await retrieve(binding, id);
      return result.kind === "execution" ? { kind: "execution", execution: {
        ...result.execution, status: "running", outputs: {} } } : result;
    });
    await env.dispatcher().cycle();
    expect((await env.repository.getRun(env.runId))?.safeFailure).toBe("unknown_outcome");
    expect((await env.repository.getOperation(operation._id))?.verifiedWorkflowId).toBeNull();
    env.elapse(5_000);
    await env.dispatcher().cycle();
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(2);
    expect(env.runtime.start).toHaveBeenCalledTimes(starts);
    expect((await env.repository.getOperation(operation._id))?.verifiedWorkflowId).toBeTruthy();
    expect(await env.repository.getRun(env.runId)).toMatchObject({ status: "paused", safeFailure: null,
      pauseRequested: true, activeOperationId: null });
  });
  it.each([false, true].flatMap((paused) => (["image", "tester"] as const).map((role) => ({ paused, role }))))("retains the callback-first lane and one GET per slot for $role when paused=$paused", async ({ paused, role }) => {
    const env = await setup("playful_kid", 13);
    await env.dispatcher().advance(env.runId);
    const operation = (await env.repository.listOperations(env.runId)).at(-1)!;
    // Recreate the persisted callback-first window without another submission.
    await env.database.collections.experiment_operations.updateOne({ _id: operation._id }, {
      $set: { role, verifiedWorkflowId: null, nextObservationAtMs: null },
    });
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, {
      $set: { activeOperationId: null, status: paused ? "paused" : "queued", pauseRequested: paused },
    });
    const secondRunId = randomUUID();
    await env.repository.createRun({ runId: secondRunId, bookletId: randomUUID(), persona: "enthusiast_parent",
      mode: "simulated", configuration: configurationSnapshot(env.config, "enthusiast_parent"), nowMs: env.next() });
    vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "unknown" });
    const starts = vi.mocked(env.runtime.start).mock.calls.length;
    expect(await env.dispatcher().cycle()).toBe("waiting");
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(1);
    expect(await env.dispatcher().cycle()).toBe("waiting");
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(1);
    env.elapse(5_000);
    expect(await env.dispatcher().cycle()).toBe("waiting");
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(2);
    expect(env.runtime.start).toHaveBeenCalledTimes(starts);
    expect((await env.repository.getOperation(operation._id))?.verifiedWorkflowId).toBeNull();
  });
  it("persists async identity before returning and observes it after restart without another POST", async () => {
    const env = await setup("playful_kid", 6);
    const workflowRunId = randomUUID();
    let operationId = "", workflowId = "";
    vi.mocked(env.runtime.start).mockImplementationOnce(async (binding, input, options) => {
      operationId = input.operationId; workflowId = binding.publishedWorkflowId;
      const execution: RuntimeExecution = { id: workflowRunId, workflow_id: workflowId, status: "running" };
      await options?.onStarted?.(execution);
      expect((await env.repository.getOperation(operationId))?.workflowRunId).toBe(workflowRunId);
      return { kind: "accepted", execution };
    });
    vi.mocked(env.runtime.retrieve).mockImplementation(async () => ({ kind: "execution", execution: {
      id: workflowRunId, workflow_id: workflowId, status: "running" } }));
    expect(await env.dispatcher().advance(env.runId)).toBe("advanced");
    expect((await env.repository.getOperation(operationId))?.reservationCount).toBe(0);
    const deadline = (await env.repository.getOperation(operationId))?.deadlineAtMs;
    await env.dispatcher().cycle();
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(1);
    await env.dispatcher().cycle();
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(1);
    env.elapse(5_000);
    await env.dispatcher().cycle();
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(2);
    expect(env.runtime.start).toHaveBeenCalledTimes(1);
    expect((await env.repository.getOperation(operationId))?.deadlineAtMs).toBe(deadline);
    env.elapse(600_000);
    await env.dispatcher().cycle();
    expect((await env.repository.getRun(env.runId))?.safeFailure).toBe("unknown_outcome");
    expect(env.runtime.start).toHaveBeenCalledTimes(1);
  });
  it.each((["playful_kid", "enthusiast_parent", "professional_creator"] as const)
    .flatMap(persona => (["tester", "judge"] as const).map(role => [persona, role] as const)))("retains %s completed generation after terminal advisory %s failure", async (persona, failedRole) => {
    const env = await setup(persona, 18, true, failedRole);
    for (let step = 0; step < 240; step++) {
      await env.dispatcher().advance(env.runId);
      const run = (await env.repository.getRun(env.runId))!;
      if (run.status === "completed" || run.status === "blocked" && !run.activeOperationId) break;
      if (run.status === "blocked" && run.activeOperationId) env.elapse(6_000);
    }
    const run = (await env.repository.getRun(env.runId))!;
    expect(run).toMatchObject({ status: "completed", evaluationStatus: "failed", activeOperationId: null });
    expect(run.generationCompletedAtMs).toBeTypeOf("number");
    const view = (await env.context.getRunView(env.runId))!;
    expect(view.currentArtifacts.every(artifact => artifact.state === "approved")).toBe(true);
    expect(view.reports).toHaveLength(failedRole === "judge" ? 1 : 0);
    const operations = await env.repository.listOperations(env.runId);
    expect(operations.filter(op => op.role === "judge")).toHaveLength(failedRole === "judge" ? 1 : 0);
    expect(operations.filter(op => op.state === "failed")).toEqual([expect.objectContaining({ role: failedRole,
      remoteStatus: "failed", lifecycle: expect.objectContaining({ phase: "finished", unresolved: false }) })]);
    const count = vi.mocked(env.runtime.start).mock.calls.length;
    await env.dispatcher().advance(env.runId);
    await createExperimentCompletionService(env.database, env.store).completeAdvisoryFailure({ runId: env.runId,
      expectedRevision: run.revision, nowMs: env.next() });
    expect(env.runtime.start).toHaveBeenCalledTimes(count);
  }, 120_000);

  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("automatically completes %s generation and separate reports, recovering a lost judge response without replay", async persona => {
    const env = await setup(persona, 18, true);
    env.faults({ lostJudge: true });
    let recovered = false, finished = false, checkedPendingEvaluation = false;
    for (let step = 0; step < 210; step++) {
      const outcome = await env.dispatcher().advance(env.runId);
      const run = (await env.repository.getRun(env.runId))!;
      if (run.generationCompletedAtMs != null && run.status === "queued" && !checkedPendingEvaluation) {
        checkedPendingEvaluation = true;
        const completion = createExperimentCompletionService(env.database, env.store);
        await expect(completion.completeEvaluation({ runId: env.runId, expectedRevision: run.revision, nowMs: env.next() }))
          .rejects.toThrow("Exactly one saved tester report and independent judge report");
        await expect(env.repository.prepareOperation({ runId: env.runId, operationId: randomUUID(), expectedRevision: run.revision,
          role: "manager", taskId: null, subjectKind: "book", subjectId: run.bookletId, providerKind: "text", attempt: 1,
          inputFingerprint: "a".repeat(64), nowMs: env.next() })).rejects.toThrow("Completed generation permits evaluation only");
        await env.repository.pause({ runId: env.runId, expectedRevision: run.revision, nowMs: env.next() });
        const calls = vi.mocked(env.runtime.start).mock.calls.length;
        expect(await env.dispatcher().advance(env.runId)).toBe("waiting");
        expect(env.runtime.start).toHaveBeenCalledTimes(calls);
        const paused = (await env.repository.getRun(env.runId))!;
        await env.repository.resume({ runId: env.runId, expectedRevision: paused.revision, nowMs: env.next() });
      }
      if (run.status === "blocked") {
        expect(run.safeFailure).toBe("unknown_outcome");
        expect(run.generationCompletedAtMs).toBeTypeOf("number");
        expect(await env.database.collections.booklets.findOne({ _id: run.bookletId })).toMatchObject({ lifecycle: "completed" });
        recovered = true;
      }
      if (outcome === "boundary") { finished = true; break; }
    }
    expect(finished).toBe(true); expect(recovered).toBe(true); expect(checkedPendingEvaluation).toBe(true);
    const run = (await env.repository.getRun(env.runId))!;
    expect(run).toMatchObject({ status: "completed", evaluationStatus: "complete", activeOperationId: null,
      counters: { payableText: 0, payableImage: 0 } });
    const operations = await env.repository.listOperations(env.runId);
    expect(run.counters).toMatchObject({ logicalText: operations.filter(op => op.providerKind === "text").length,
      logicalImage: operations.filter(op => op.providerKind === "image").length, steps: operations.length });
    const decisions = await env.database.collections.messages.find({ experimentRunId: env.runId, role: "user" }).toArray();
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    if (persona === "playful_kid") expect(decisions).toHaveLength(1);
    expect((await env.context.getRunView(env.runId))!.reports).toHaveLength(2);
    expect(vi.mocked(env.runtime.start).mock.calls.filter(([binding]) => binding.role === "judge")).toHaveLength(1);
    expect(env.runtime.retrieve).toHaveBeenCalled();
    const completion = createExperimentCompletionService(env.database, env.store);
    expect((await completion.completeEvaluation({ runId: env.runId, expectedRevision: run.revision, nowMs: env.next() })).revision).toBe(run.revision);
    const before = vi.mocked(env.runtime.start).mock.calls.length;
    await env.dispatcher().advance(env.runId);
    expect(env.runtime.start).toHaveBeenCalledTimes(before);
  }, 120_000);
  it("rejects evaluator reports and judge admission before saved generation completion", async () => {
    const env = await setup("playful_kid", 18, true);
    const run = (await env.repository.getRun(env.runId))!, operationId = randomUUID(), workflowRunId = randomUUID();
    await expect(env.repository.prepareOperation({ runId: env.runId, operationId, expectedRevision: run.revision,
      role: "judge", taskId: null, subjectKind: "book", subjectId: run.bookletId, providerKind: "text",
      attempt: 1, inputFingerprint: "a".repeat(64), nowMs: env.next() })).rejects.toThrow("Evaluation requires saved generation completion");
    const report = simulatedExperimentReport({ role: "tester", mode: "simulated", runId: env.runId,
      configurationHash: run.configurationHash, versionIds: [workflowRunId], warningCount: 0 });
    await expect(env.testerDecision({ kind: "feedback", payload: report }, false, true)).rejects.toThrow("Evaluation requires saved generation completion");
  });
  it.each([false, true])("recovers a reference-free cover without replay (null file output: %s)", async (nullReferences) => {
    const env = await setup("playful_kid", 17, true);
    let ready = false;
    for (let step = 0; step < 160; step++) {
      const view = await env.context.getRunView(env.runId);
      const last = (await env.repository.listOperations(env.runId)).at(-1);
      if (view?.nextNarrativeTask === "J13" && view.nextPageIllustrationWork?.kind === "image" &&
          view.nextPageIllustrationWork.pageIndex === 0 && last?.role === "manager" && last.state === "succeeded") { ready = true; break; }
      expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
    }
    expect(ready).toBe(true);
    env.faults({ lost: true, nullReferences });
    const imageCalls = () => vi.mocked(env.runtime.start).mock.calls.filter(([binding]) => binding.role === "image").length;
    const before = imageCalls();
    await env.dispatcher().advance(env.runId);
    const operation = (await env.repository.listOperations(env.runId)).at(-1)!;
    expect(JSON.parse(operation.referenceUploadsJson!)).toEqual([]);
    expect(vi.mocked(env.runtime.start).mock.calls.at(-1)![1].referenceFileIds).toBeUndefined();
    await env.dispatcher().advance(env.runId);
    expect((await env.repository.getRun(env.runId))!.status).not.toBe("blocked");
    expect((await env.repository.getOperation(operation._id))!.verifiedWorkflowId).toBeTruthy();
    expect(imageCalls()).toBe(before + 1);
  }, 120_000);
  it.each(["reversed", "null"] as const)("blocks %s final-page reference read-back without another image dispatch", async (readback) => {
    const env = await setup("playful_kid", 17, true);
    await env.reachPageImageWithReferences();
    env.faults({ reverseReferences: readback === "reversed", nullReferences: readback === "null" });
    const before = vi.mocked(env.runtime.start).mock.calls.length;
    await env.dispatcher().advance(env.runId);
    expect((await env.repository.getRun(env.runId))!.status).toBe("blocked");
    expect((await env.repository.getRun(env.runId))!.safeFailure).toBe("definite_failure");
    const batchItems = await env.database.collections.generation_items.find({ status: "running" }).toArray();
    expect(batchItems).toHaveLength(0);
    const failedItems = await env.database.collections.generation_items.find({ status: "failed" }).toArray();
    expect(failedItems).toHaveLength(1);
    expect(JSON.parse(failedItems[0].errorJson!)).toMatchObject({ code: "experiment_run_blocked", runId: env.runId });
    expect((await env.database.collections.generation_jobs.findOne({ _id: failedItems[0].jobId }))!.status).toBe("failed");
    expect(await env.dispatcher().advance(env.runId)).toBe("blocked");
    expect(vi.mocked(env.runtime.start).mock.calls.length).toBe(before + 1);
  }, 120_000);
  it("dispatches a retained two-page selection in order with separate saved results and approvals", async () => {
    const env = await setup("enthusiast_parent", 17, true);
    await env.reachPageImageWithReferences();
    const readyRun = (await env.repository.getRun(env.runId))!;
    expect((await env.context.getRunView(env.runId))!.pageSelection).toBeNull();
    await env.repository.pause({ runId: env.runId, expectedRevision: readyRun.revision, nowMs: env.next() });
    const run = (await env.repository.getRun(env.runId))!, view = (await env.context.getRunView(env.runId))!;
    const layoutArtifact = view.currentArtifacts.find((artifact) => artifact.taskId === "J11")!;
    const layout = parseStoredPageLayout(run.persona, layoutArtifact.versions.find((version) => version.id === layoutArtifact.currentVersionId)!.content);
    const selected = [layout.pages[3]!, layout.pages[1]!].map((page) => ({ pageId: page.pageId,
      pageBibleVersionId: view.currentArtifacts.find((artifact) => artifact.taskId === "J12" && artifact.subjectId === page.pageId)!.currentVersionId!,
      previousPageVersionId: null }));
    expect(view.pageSelection).toMatchObject({ runId: run._id, layoutVersionId: layoutArtifact.currentVersionId });
    expect(selected.every((page) => view.pageSelection?.pages.some((available) => available.pageId === page.pageId &&
      available.pageBibleVersionId === page.pageBibleVersionId))).toBe(true);
    const batches = createExperimentPageBatchRepository({ database: env.database, store: env.store, now: env.next });
    const jobId = randomUUID();
    await batches.select({ jobId, expectedRevision: run.revision, batch: { schemaVersion: "2", runId: run._id,
      configurationHash: run.configurationHash, layoutVersionId: layoutArtifact.currentVersionId!, selection: "selected_batch", pages: selected } });
    expect((await env.context.getRunView(env.runId))!.pageSelection).toBeNull();
    const calls = vi.mocked(env.runtime.start).mock.calls.length;
    await env.dispatcher().advance(env.runId);
    expect(vi.mocked(env.runtime.start).mock.calls.length).toBe(calls);
    const pausedRun = (await env.repository.getRun(env.runId))!;
    await env.repository.resume({ runId: env.runId, expectedRevision: pausedRun.revision, nowMs: env.next() });
    let approved = false;
    for (let step = 0; step < 12; step++) {
      expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
      const artifacts = await env.database.collections.artifacts.find({ experimentRunId: env.runId, taskId: "J13",
        subjectId: { $in: selected.map((page) => page.pageId) }, state: "approved" }).toArray();
      if (artifacts.length === 2) { approved = true; break; }
    }
    expect(approved).toBe(true);
    const saved = await batches.get({ runId: env.runId, jobId });
    expect(saved.next).toEqual({ kind: "complete" });
    expect(saved.items.map((item) => item.pageId)).toEqual(selected.map((page) => page.pageId));
    expect(saved.items.every((item) => item.status === "succeeded")).toBe(true);
    expect(new Set(saved.items.map((item) => item.assetId)).size).toBe(2);
    for (const item of saved.items) {
      expect(await env.database.collections.approvals.findOne({ experimentRunId: env.runId, artifactVersionId: item.pageVersionId! })).toBeTruthy();
      expect((await env.repository.getOperation(item.operationId!))!.subjectId).toBe(item.pageId);
    }
    expect((await env.repository.getRun(env.runId))!.status).not.toBe("completed");
  }, 120_000);

  it.each(["single", "selected_batch"] as const)("resumes a %s J13 image paused before claim without spending or replacing the batch", async (selection) => {
    const env = await setup("playful_kid", 17, true);
    await env.reachPageImageWithReferences();
    if (selection === "selected_batch") {
      const run = (await env.repository.getRun(env.runId))!, view = (await env.context.getRunView(env.runId))!;
      const artifact = view.currentArtifacts.find((item) => item.taskId === "J11")!;
      const layout = parseStoredPageLayout(run.persona, artifact.versions.find((item) => item.id === artifact.currentVersionId)!.content);
      await createExperimentPageBatchRepository({ database: env.database, store: env.store }).select({
        jobId: randomUUID(), expectedRevision: run.revision, batch: { schemaVersion: "2", runId: run._id,
          configurationHash: run.configurationHash, layoutVersionId: artifact.currentVersionId!, selection,
          pages: layout.pages.filter((page) => page.pageIndex > 0).slice(0, 2).map((page) => ({ pageId: page.pageId,
            pageBibleVersionId: view.currentArtifacts.find((item) => item.taskId === "J12" && item.subjectId === page.pageId)!.currentVersionId!,
            previousPageVersionId: null })) },
      });
    }
    const before = (await env.repository.getRun(env.runId))!;
    const earlierPages = await env.database.collections.artifacts.find({ experimentRunId: env.runId, taskId: "J13", state: "approved" }).toArray();
    env.faults({ beforeClaim: true });
    await env.dispatcher().advance(env.runId);
    const paused = (await env.repository.getRun(env.runId))!;
    expect(paused.status).toBe("paused");
    expect(paused.counters.logicalImage).toBe(before.counters.logicalImage);
    const attempt = (await env.repository.listOperations(env.runId)).at(-1)!;
    expect(attempt).toMatchObject({ role: "image", taskId: "J13", state: "failed", safeFailure: null, reservationCount: 0 });
    const batches = createExperimentPageBatchRepository({ database: env.database, store: env.store });
    const jobs = await batches.listActive(env.runId);
    expect(jobs).toHaveLength(1);
    await env.repository.resume({ runId: env.runId, expectedRevision: paused.revision, nowMs: env.next() });
    env.faults({});
    for (let step = 0; step < 6; step++) {
      expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
      if (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J13", subjectId: attempt.subjectId })) break;
    }
    const attempts = (await env.repository.listOperations(env.runId)).filter((item) => item.role === "image" && item.taskId === "J13" && item.subjectId === attempt.subjectId);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toMatchObject({ state: "succeeded", reservationCount: 1, attempt: 2 });
    expect((await env.repository.getRun(env.runId))!.counters.logicalImage).toBe(before.counters.logicalImage + 1);
    const batch = await batches.get({ runId: env.runId, jobId: jobs[0].jobId });
    expect(batch.items[0]).toMatchObject({ status: "succeeded", operationId: attempts[1]._id });
    expect(batch.next).toMatchObject({ kind: selection === "single" ? "complete" : "ready" });
    for (const earlier of earlierPages) expect(await env.database.collections.artifacts.findOne({ _id: earlier._id })).toEqual(earlier);
  }, 120_000);
  it("routes J13 image clarification through a saved tester answer before a fresh image operation", async () => {
    const env = await setup("playful_kid", 17, true);
    await env.reachPageImageWithReferences();
    const before = (await env.repository.getRun(env.runId))!;
    const assetsBefore = await env.database.collections.assets.countDocuments({ bookletId: before.bookletId });
    env.faults({ pageClarification: true });
    expect(await env.dispatcher().advance(env.runId)).toBe("advanced");
    const questionOperation = (await env.repository.listOperations(env.runId)).at(-1)!;
    const asked = (await env.repository.getRun(env.runId))!;
    expect(JSON.parse(asked.pendingDecisionJson!)).toMatchObject({ kind: "question", taskId: "J13", questionId: questionOperation._id });
    expect(asked.imageRevisions).toBe(before.imageRevisions);
    expect(asked.counters.logicalImage).toBe(before.counters.logicalImage + 1);
    expect(asked.counters.payableImage).toBe(0);
    expect(asked.counters.payableText).toBe(0);
    expect(questionOperation.reservationCount).toBe(1);
    expect(await env.database.collections.assets.countDocuments({ bookletId: before.bookletId })).toBe(assetsBefore);
    expect(await env.dispatcher().advance(env.runId)).toBe("advanced");
    expect((await env.repository.getRun(env.runId))!.pendingDecisionJson).toBeNull();
    expect(await env.dispatcher().advance(env.runId)).toBe("advanced");
    expect(await env.dispatcher().advance(env.runId)).toBe("advanced");
    const image = (await env.repository.listOperations(env.runId)).at(-1)!;
    expect(image.role).toBe("image");
    expect(image._id).not.toBe(questionOperation._id);
    expect(await env.database.collections.assets.countDocuments({ bookletId: before.bookletId })).toBe(assetsBefore + 1);
    expect((await env.repository.getRun(env.runId))!.counters.logicalImage).toBe(before.counters.logicalImage + 2);
    expect((await env.repository.getOperation(questionOperation._id))!.state).toBe("succeeded");
    const batchItems = await env.database.collections.generation_items.find({ itemKey: image.subjectId }).toArray();
    expect(batchItems).toHaveLength(1);
    expect(JSON.parse(batchItems[0].resultJson!)).toMatchObject({ operationId: image._id, assetId: image._id,
      clarificationOperationIds: [questionOperation._id] });
    expect(batchItems[0]).toMatchObject({ status: "succeeded", attemptCount: 2 });
  }, 120_000);
  it("recovers the persisted post-callback pre-assembly boundary without another image POST", async () => {
    const env = await setup("playful_kid", 17, true);
    await env.reachPageImageWithReferences();
    expect(await env.dispatcher().advance(env.runId)).toBe("advanced");
    const operation = (await env.repository.listOperations(env.runId)).at(-1)!;
    const artifact = (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J13", subjectId: operation.subjectId }))!;
    const item = (await env.database.collections.generation_items.findOne({ itemKey: operation.subjectId }))!;
    // Restore only this isolated fixture to the durable state left by a process
    // interruption after the callback committed but before assembly began.
    await env.database.collections.artifact_dependencies.deleteMany({ downstreamVersionId: artifact.currentVersionId! });
    await env.database.collections.artifact_versions.deleteOne({ _id: artifact.currentVersionId! });
    await env.database.collections.artifacts.deleteOne({ _id: artifact._id });
    await env.database.collections.generation_items.updateOne({ _id: item._id }, { $set: { status: "running", assetId: null, finishedAtMs: null,
      resultJson: JSON.stringify({ operationId: operation._id, assetId: null, pageVersionId: null }) } });
    await env.database.collections.generation_jobs.updateOne({ _id: item.jobId }, { $set: { status: "running", finishedAtMs: null } });
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { progressOperationId: null } });
    const starts = vi.mocked(env.runtime.start).mock.calls.length;
    expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
    const imageStarts = vi.mocked(env.runtime.start).mock.calls.slice(starts).filter(([binding]) => binding.role === "image");
    expect(imageStarts).toHaveLength(0);
    expect((await env.database.collections.generation_items.findOne({ _id: item._id }))!).toMatchObject({ status: "succeeded", assetId: operation._id });
    expect(await env.database.collections.artifacts.countDocuments({ experimentRunId: env.runId, taskId: "J13", subjectId: operation.subjectId })).toBe(1);
    expect((await env.repository.getOperation(operation._id))!.state).toBe("succeeded");
  }, 120_000);
  it("regenerates only the affected J13 after a J12 revision without reviving its completed batch", async () => {
    const env = await setup("playful_kid", 18, true);
    await env.reachPageImageWithReferences();
    await env.dispatcher().advance(env.runId);
    const image = (await env.repository.listOperations(env.runId)).at(-1)!;
    await env.dispatcher().advance(env.runId);
    const original = (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J13", subjectId: image.subjectId }))!;
    const bible = (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J12", subjectId: image.subjectId }))!;
    const siblings = await env.database.collections.artifacts.find({ experimentRunId: env.runId, taskId: "J13", subjectId: { $ne: image.subjectId } }).toArray();
    const jobs = await env.database.collections.generation_jobs.find({ bookletId: original.bookletId, jobType: "dify_pages" }).toArray();
    await env.testerDecision({ kind: "decision", payload: { decision: { action: "revise", taskId: "J12",
      artifactVersionId: bible.currentVersionId!, instruction: "Keep the exact lettering but clarify the camera composition." } } }, false, true);
    let regenerated = false;
    for (let step = 0; step < 16; step++) {
      expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
      const current = (await env.database.collections.artifacts.findOne({ _id: original._id }))!;
      if (current.currentVersionId !== original.currentVersionId && current.state === "approved") { regenerated = true; break; }
    }
    expect(regenerated).toBe(true);
    const changed = (await env.database.collections.artifacts.findOne({ _id: original._id }))!;
    const version = (await env.database.collections.artifact_versions.findOne({ _id: changed.currentVersionId! }))!;
    expect(JSON.parse(version.contentJson).pageBibleVersionId).not.toBe(bible.currentVersionId);
    expect(version.sourceVersionId).toBe(original.currentVersionId);
    expect(await env.database.collections.approvals.findOne({ artifactVersionId: original.currentVersionId! })).toBeTruthy();
    for (const job of jobs) expect(await env.database.collections.generation_jobs.findOne({ _id: job._id })).toEqual(job);
    for (const sibling of siblings) expect(await env.database.collections.artifacts.findOne({ _id: sibling._id })).toEqual(sibling);
    expect((await env.repository.listOperations(env.runId)).filter((item) => item.role === "image" && item.taskId === "J13" && item.subjectId === image.subjectId)).toHaveLength(2);
  }, 120_000);
  it("preserves the pending tail when revising the first image of an active selected batch", async () => {
    const env = await setup("playful_kid", 18, true);
    await env.reachPageImageWithReferences();
    const run = (await env.repository.getRun(env.runId))!, view = (await env.context.getRunView(env.runId))!;
    const layoutArtifact = view.currentArtifacts.find((item) => item.taskId === "J11")!;
    const layout = parseStoredPageLayout(run.persona, layoutArtifact.versions.find((item) => item.id === layoutArtifact.currentVersionId)!.content);
    const storyPages = layout.pages.filter((page) => page.pageIndex > 0);
    const pages = [storyPages[2], storyPages[0], storyPages[1]].map((page) => ({ pageId: page.pageId,
      pageBibleVersionId: view.currentArtifacts.find((item) => item.taskId === "J12" && item.subjectId === page.pageId)!.currentVersionId!, previousPageVersionId: null }));
    const batches = createExperimentPageBatchRepository({ database: env.database, store: env.store, now: env.next }), jobId = randomUUID();
    await batches.select({ jobId, expectedRevision: run.revision, batch: { schemaVersion: "2", runId: env.runId,
      configurationHash: run.configurationHash, layoutVersionId: layoutArtifact.currentVersionId!, selection: "selected_batch", pages } });
    for (let step = 0; step < 4; step++) {
      expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
      if (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J13", subjectId: pages[0].pageId })) break;
    }
    const original = (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J13", subjectId: pages[0].pageId }))!;
    expect(original.state).toBe("draft");
    const retainedItems = await env.database.collections.generation_items.find({ jobId }).sort({ position: 1 }).toArray();
    await env.testerDecision({ kind: "decision", payload: { decision: { action: "revise", taskId: "J13",
      artifactVersionId: original.currentVersionId!, instruction: "Make the kite visible without changing the lettering." } } }, false, true);
    let finished = false;
    for (let step = 0; step < 18; step++) {
      expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
      if (await env.database.collections.artifacts.countDocuments({ experimentRunId: env.runId, taskId: "J13", subjectId: { $in: pages.map((page) => page.pageId) }, state: "approved" }) === pages.length) { finished = true; break; }
    }
    expect(finished).toBe(true);
    const oldJob = (await env.database.collections.generation_jobs.findOne({ _id: jobId }))!;
    expect(oldJob.status).toBe("superseded");
    expect(await env.database.collections.generation_items.find({ jobId }).sort({ position: 1 }).toArray()).toEqual(retainedItems);
    const successor = await batches.get({ runId: env.runId, jobId: oldJob.supersededByJobId! });
    expect(successor.batch.pages.map((page) => page.pageId)).toEqual(pages.map((page) => page.pageId));
    expect(successor.batch.pages[0].previousPageVersionId).toBe(original.currentVersionId);
    expect(successor.next).toEqual({ kind: "complete" });
  }, 120_000);
  it("revises only the selected J13 page, retains feedback after assembly and enforces image allowance", async () => {
    const env = await setup("playful_kid", 17, true);
    await env.reachPageImageWithReferences();
    await env.dispatcher().advance(env.runId);
    const image = (await env.repository.listOperations(env.runId)).at(-1)!;
    await env.dispatcher().advance(env.runId);
    const artifact = (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J13", subjectId: image.subjectId }))!;
    const originalVersionId = artifact.currentVersionId!;
    expect(artifact.state).toBe("approved");
    const siblings = await env.database.collections.artifacts.find({ experimentRunId: env.runId, taskId: "J13", subjectId: { $ne: image.subjectId } }).toArray();
    const before = (await env.repository.getRun(env.runId))!;
    const tester = (await env.repository.listOperations(env.runId)).at(-1)!;
    await expect(withMongoTransaction(env.database, (session) => materializeNarrativeResult(env.database, session, before,
      { ...tester, _id: randomUUID() }, { kind: "decision", payload: { decision: { action: "revise", taskId: "J13",
        artifactVersionId: originalVersionId, instruction: "x".repeat(16_000) } } }, [], env.next(), () => env.store)))
      .rejects.toMatchObject({ code: "invalid_result" });
    expect(await env.repository.getRun(env.runId)).toMatchObject({ imageRevisions: before.imageRevisions, pendingDecisionJson: null });
    expect((await env.database.collections.artifacts.findOne({ _id: artifact._id }))!.state).toBe("approved");
    const instruction = "Make the kite easier to see. Keep the exact approved lettering.";
    const decision = await env.testerDecision({ kind: "decision", payload: { decision: { action: "revise", taskId: "J13",
      artifactVersionId: originalVersionId, instruction } } }, false, true);
    const pending = (await env.repository.getRun(env.runId))!;
    expect(pending).toMatchObject({ imageRevisions: 1, textRevisions: before.textRevisions });
    expect(JSON.parse(pending.pendingDecisionJson!)).toMatchObject({ taskId: "J13", subjectKind: "page", subjectId: image.subjectId,
      artifactVersionId: originalVersionId, decisionId: decision.operation._id });
    await env.repository.completeOperation({ envelope: { runId: env.runId, operationId: decision.operation._id, workflowRunId: decision.operation.workflowRunId!,
      inputFingerprint: decision.operation.inputFingerprint, result: JSON.parse(decision.operation.resultJson!) }, parentWorkflowRunId: null, nowMs: env.next() });
    expect((await env.repository.getRun(env.runId))!.imageRevisions).toBe(1);
    await env.dispatcher().advance(env.runId); // Fresh manager selects the revision.
    await env.dispatcher().advance(env.runId); // New image and immutable assembly.
    expect((await env.repository.getRun(env.runId))!.pendingDecisionJson).toBeNull();
    const revised = (await env.database.collections.artifacts.findOne({ _id: artifact._id }))!;
    const version = (await env.database.collections.artifact_versions.findOne({ _id: revised.currentVersionId! }))!;
    const content = JSON.parse(version.contentJson);
    expect(version.sourceVersionId).toBe(originalVersionId);
    expect(content.request.revisions).toEqual([{ decisionId: decision.operation._id, previousPageVersionId: originalVersionId, instruction }]);
    expect(content.request.prompt).toContain(instruction);
    expect(await env.database.collections.artifact_versions.countDocuments({ _id: originalVersionId })).toBe(1);
    await env.dispatcher().advance(env.runId); // Approval still verifies retained feedback with no pending revision.
    expect((await env.database.collections.artifacts.findOne({ _id: artifact._id }))!.state).toBe("approved");
    for (const sibling of siblings) expect((await env.database.collections.artifacts.findOne({ _id: sibling._id }))!.currentVersionId).toBe(sibling.currentVersionId);
    await expect(env.testerDecision({ kind: "decision", payload: { decision: { action: "revise", taskId: "J13",
      artifactVersionId: revised.currentVersionId!, instruction: "Another revision" } } })).rejects.toMatchObject({ code: "invalid_result" });
    expect((await env.repository.getRun(env.runId))!.imageRevisions).toBe(1);
    const verifySavedRevision = () => withMongoTransaction(env.database, async (session) =>
      verifyCurrentPageIllustrationSources(env.database, session, (await env.repository.getRun(env.runId))!, image.subjectId, env.store));
    expect((await verifySavedRevision()).request.request.revisions).toEqual(content.request.revisions);
    const savedDecision = JSON.parse(decision.operation.resultJson!);
    for (const changed of [{ instruction: "Unrecorded feedback" }, { artifactVersionId: randomUUID() }, { taskId: "J12" }]) {
      await env.database.collections.experiment_operations.updateOne({ _id: decision.operation._id }, { $set: { resultJson: JSON.stringify({
        ...savedDecision, payload: { decision: { ...savedDecision.payload.decision, ...changed } },
      }) } });
      await expect(verifySavedRevision()).rejects.toMatchObject({ code: "invalid_result" });
    }
    await env.database.collections.experiment_operations.updateOne({ _id: decision.operation._id }, { $set: { resultJson: decision.operation.resultJson } });
    const testerPublication = env.config.bindings.find((binding) => binding.role === "tester" && binding.persona === "playful_kid")!.publishedWorkflowId;
    await env.database.collections.experiment_operations.updateOne({ _id: decision.operation._id }, { $set: { verifiedWorkflowId: randomUUID() } });
    await expect(verifySavedRevision()).rejects.toMatchObject({ code: "invalid_result" });
    await env.database.collections.experiment_operations.updateOne({ _id: decision.operation._id }, { $set: { verifiedWorkflowId: testerPublication } });
    expect((await verifySavedRevision()).request.request.revisions).toEqual(content.request.revisions);
  }, 120_000);

  it("uses the refreshed manager publication after callback-first J13 recovery", async () => {
    const env = await setup("playful_kid", 17, true);
    await env.reachPageImageWithReferences();
    const manager = (await env.repository.listOperations(env.runId)).at(-1)!;
    expect(manager).toMatchObject({ role: "manager", state: "succeeded" });
    expect(JSON.parse(manager.resultJson!).payload.taskId).toBe("J13");
    await env.database.collections.experiment_operations.updateOne({ _id: manager._id }, {
      $set: { verifiedWorkflowId: null, nextObservationAtMs: null },
    });
    const posts = vi.mocked(env.runtime.start).mock.calls.length;
    const sourceChecks = vi.spyOn(pageVerification, "verifyCurrentPageIllustrationSources");
    expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
    const transactionChecks = new Map<unknown, typeof sourceChecks.mock.calls>();
    for (const call of sourceChecks.mock.calls) {
      const calls = transactionChecks.get(call[1]) ?? [];
      calls.push(call);
      transactionChecks.set(call[1], calls);
    }
    const preparation = [...transactionChecks.values()].find((calls) => calls.length === 4);
    expect(preparation).toBeDefined();
    const attempt = preparation![0][5]?.attempt;
    expect(attempt).toBeDefined();
    expect(preparation!.every((call) => call[5]?.attempt === attempt)).toBe(true);
    expect(await env.repository.getOperation(manager._id)).toMatchObject({
      verifiedWorkflowId: env.config.bindings.find((binding) => binding.role === "manager")!.publishedWorkflowId,
    });
    expect(env.runtime.retrieve).toHaveBeenCalledWith(expect.objectContaining({ role: "manager" }), manager.workflowRunId,
      expect.objectContaining({ signal: expect.any(AbortSignal), deadlineAtMs: expect.any(Number) }));
    expect(env.runtime.start).toHaveBeenCalledTimes(posts + 1);
    const image = (await env.repository.listOperations(env.runId)).at(-1)!;
    expect(image).toMatchObject({ role: "image", taskId: "J13", parentWorkflowRunId: manager.workflowRunId });
    expect(await env.repository.getRun(env.runId)).not.toMatchObject({ status: "blocked" });
  }, 120_000);

  it("blocks failed J13 assembly after a saved result instead of creating a replacement POST", async () => {
    const env = await setup("playful_kid", 17, true);
    await env.reachPageImageWithReferences();
    const posts = vi.mocked(env.runtime.start).mock.calls.length;
    env.faults({ corruptSavedPage: true });
    await env.dispatcher().advance(env.runId);
    expect(env.runtime.start).toHaveBeenCalledTimes(posts + 1);
    expect(await env.repository.getRun(env.runId)).toMatchObject({ status: "blocked", safeFailure: "definite_failure", activeOperationId: null });
    const operation = (await env.repository.listOperations(env.runId)).at(-1)!;
    expect(operation).toMatchObject({ role: "image", taskId: "J13", state: "succeeded" });
    expect(operation.verifiedWorkflowId).toBeTruthy();
    const uploads = env.uploadReference.mock.calls.length;
    expect(await env.dispatcher().advance(env.runId)).toBe("blocked");
    expect(env.runtime.start).toHaveBeenCalledTimes(posts + 1);
    expect(env.uploadReference).toHaveBeenCalledTimes(uploads);
  }, 120_000);

  it("blocks an unknown J13 reference upload before workflow dispatch and never repeats its POST", async () => {
    const env = await setup("playful_kid", 17, true);
    await env.reachPageImageWithReferences();
    const posts = vi.mocked(env.runtime.start).mock.calls.length;
    env.uploadReference.mockResolvedValueOnce({ kind: "unknown" });
    expect(await env.dispatcher().advance(env.runId)).toBe("blocked");
    const uploads = env.uploadReference.mock.calls.length;
    expect(env.runtime.start).toHaveBeenCalledTimes(posts);
    const run = (await env.repository.getRun(env.runId))!;
    expect(run).toMatchObject({ status: "blocked", safeFailure: "unknown_outcome" });
    const operation = (await env.repository.getOperation(run.activeOperationId!))!;
    expect(operation).toMatchObject({ role: "image", taskId: "J13", state: "unknown", workflowRunId: null });
    expect(JSON.parse(operation.referenceUploadJournalJson!)[0].state).toBe("unknown");
    expect(await env.dispatcher().advance(env.runId)).toBe("blocked");
    expect(env.uploadReference).toHaveBeenCalledTimes(uploads);
    expect(env.runtime.start).toHaveBeenCalledTimes(posts);
  }, 120_000);

  it("recovers the original J13 upload after a claimed timeout without replay or another reservation", async () => {
    const env = await setup("playful_kid", 17, true);
    await env.reachPageImageWithReferences();
    const before = (await env.repository.getRun(env.runId))!;
    env.faults({ lostBeforeUpload: true });
    await env.dispatcher().advance(env.runId);
    const operation = (await env.repository.listOperations(env.runId)).at(-1)!;
    expect(operation).toMatchObject({ role: "image", taskId: "J13", state: "unknown", safeFailure: "unknown_outcome", reservationCount: 1 });
    expect(operation.verifiedWorkflowId).toBeFalsy();
    const blocked = (await env.repository.getRun(env.runId))!;
    expect(blocked).toMatchObject({ status: "blocked", safeFailure: "unknown_outcome", activeOperationId: operation._id });
    expect(blocked.counters.logicalImage).toBe(before.counters.logicalImage + 1);
    const imagePosts = () => vi.mocked(env.runtime.start).mock.calls.filter(([binding]) => binding.role === "image").length;
    const posts = imagePosts(), uploads = env.uploadReference.mock.calls.length;
    await expect(env.finishLateImage(true)).rejects.toThrow();
    const bible = (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J12", subjectId: operation.subjectId }))!;
    await env.database.collections.artifacts.updateOne({ _id: bible._id }, { $set: { state: "needs_review" } });
    await expect(env.finishLateImage()).rejects.toThrow();
    expect((await env.repository.getOperation(operation._id))!.imageCompletionDigest).toBeFalsy();
    await env.database.collections.artifacts.updateOne({ _id: bible._id }, { $set: { state: bible.state } });
    await env.finishLateImage();
    await env.dispatcher().advance(env.runId);
    expect(imagePosts()).toBe(posts);
    expect(env.uploadReference).toHaveBeenCalledTimes(uploads);
    expect(env.runtime.retrieve).toHaveBeenCalled();
    const recovered = (await env.repository.getOperation(operation._id))!;
    expect(recovered).toMatchObject({ state: "succeeded", reservationCount: 1, verifiedWorkflowId: env.config.bindings.find((item) => item.role === "image")!.publishedWorkflowId });
    const artifact = await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J13", subjectId: operation.subjectId });
    expect(artifact).toBeTruthy();
    expect(await env.database.collections.artifact_versions.countDocuments({ artifactId: artifact!._id })).toBe(1);
    expect((await env.repository.getRun(env.runId))!.counters.logicalImage).toBe(blocked.counters.logicalImage);
  }, 120_000);
  it("recovers a lost J13 image response through GET without repeating upload or execution", async () => {
    const env = await setup("playful_kid", 17, true);
    await env.reachPageImageWithReferences();
    env.faults({ lost: true });
    const posts = vi.mocked(env.runtime.start).mock.calls.length;
    await env.dispatcher().advance(env.runId);
    expect(env.runtime.start).toHaveBeenCalledTimes(posts + 1);
    expect(env.runtime.retrieve).toHaveBeenCalled();
    const operation = (await env.repository.listOperations(env.runId)).at(-1)!;
    expect(operation).toMatchObject({ role: "image", taskId: "J13", state: "succeeded" });
    expect(operation.verifiedWorkflowId).toBeTruthy();
    const uploads = env.uploadReference.mock.calls.length;
    const artifact = await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J13", subjectId: operation.subjectId });
    expect(artifact).toMatchObject({ state: "approved" });
    expect(await env.database.collections.approvals.findOne({ artifactVersionId: artifact!.currentVersionId! }))
      .toMatchObject({ origin: "delegated", delegationId: (await env.repository.getRun(env.runId))!.activeDelegationId });
    await env.dispatcher().advance(env.runId);
    expect(env.uploadReference).toHaveBeenCalledTimes(uploads);
    expect((await env.repository.listOperations(env.runId)).filter((item) => item.role === "image" && item.taskId === "J13" && item.subjectId === operation.subjectId)).toHaveLength(1);
  }, 120_000);

  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("saves and independently approves every J13 page for %s", async (persona) => {
    const env = await setup(persona, persona === "playful_kid" ? 18 : 17, true);
    await expect(withMongoTransaction(env.database, async (session) => verifyExperimentGeneration(env.database, session,
      (await env.repository.getRun(env.runId))!, env.store))).rejects.toThrow();
    let boundary = false;
    for (let step = 0; step < 200; step++) {
      if ((await env.context.getRunView(env.runId))?.nextNarrativeTask === "slice_complete") { boundary = true; break; }
      const outcome = await env.dispatcher().advance(env.runId);
      expect(outcome).not.toBe("blocked");
      if (outcome === "boundary") { boundary = true; break; }
    }
    expect(boundary).toBe(true);
    const expected = persona === "playful_kid" ? 4 : persona === "enthusiast_parent" ? 6 : 9;
    const artifacts = await env.database.collections.artifacts.find({ experimentRunId: env.runId, taskId: "J13" }).toArray();
    expect(artifacts).toHaveLength(expected);
    expect(artifacts.every((artifact) => artifact.state === "approved" && artifact.currentVersionId)).toBe(true);
    expect(new Set(artifacts.map((artifact) => artifact.subjectId)).size).toBe(expected);
    for (const artifact of artifacts) {
      expect(await env.database.collections.approvals.countDocuments({ experimentRunId: env.runId, artifactVersionId: artifact.currentVersionId!, action: "approve" })).toBe(1);
    }
    const operations = (await env.repository.listOperations(env.runId)).filter((operation) => operation.role === "image" && operation.taskId === "J13");
    expect(operations).toHaveLength(expected);
    expect(operations.every((operation) => operation.state === "succeeded" && operation.parentWorkflowRunId && operation.verifiedWorkflowId)).toBe(true);
    expect(env.uploadReference).toHaveBeenCalled();
    const pageCalls = vi.mocked(env.runtime.start).mock.calls.filter(([, input]) => operations.some((operation) => operation._id === input.operationId));
    expect(pageCalls).toHaveLength(expected);
    for (const [, input] of pageCalls) {
      const operation = operations.find((item) => item._id === input.operationId)!;
      const acknowledgements = JSON.parse(operation.referenceUploadsJson ?? "[]") as { uploadFileId: string }[];
      expect(input.referenceFileIds ?? []).toEqual(acknowledgements.map((item) => item.uploadFileId));
    }
    expect((await env.repository.getRun(env.runId))?.counters).toMatchObject({ payableText: 0, payableImage: 0 });
    const versionReads = vi.spyOn(env.database.collections.artifact_versions, "find");
    const originalByteReads = vi.spyOn(env.store, "get");
    const storageHeads = vi.spyOn(env.store, "exists");
    const completedEvidence = await withMongoTransaction(env.database, async (session) => verifyExperimentGeneration(env.database, session,
      (await env.repository.getRun(env.runId))!, env.store));
    const artifactIds = (await env.database.collections.artifacts.find({ experimentRunId: env.runId }).toArray())
      .map((artifact) => artifact._id);
    expect(versionReads.mock.calls.filter(([filter]) => {
      const ids = (filter as { artifactId?: { $in?: string[] } }).artifactId?.$in;
      return ids?.length === artifactIds.length && artifactIds.every((id) => ids.includes(id));
    })).toHaveLength(1);
    versionReads.mockRestore();
    // Each immutable original is read once per attempt. Shared references used
    // by several pages do not add downloads, and verification needs no HEAD.
    expect(originalByteReads).toHaveBeenCalledTimes(expected + (persona === "professional_creator" ? 6 : 5));
    expect(storageHeads).not.toHaveBeenCalled();
    originalByteReads.mockRestore(); storageHeads.mockRestore();
    expect(completedEvidence.finalPages).toHaveLength(expected);
    expect(completedEvidence.referenceAssetIds).toHaveLength(persona === "professional_creator" ? 6 : 5);
    expect(new Set([...completedEvidence.finalAssetIds, ...completedEvidence.referenceAssetIds]).size).toBe(persona === "playful_kid" ? 9 : persona === "enthusiast_parent" ? 11 : 15);
    if (persona === "playful_kid") {
      await createExperimentCompletionService(env.database, env.store).markGenerationComplete({ runId: env.runId,
        expectedRevision: (await env.repository.getRun(env.runId))!.revision, nowMs: env.next() });
      const assertAdmissionRejected = async (role: "tester" | "judge") => {
        const run = (await env.repository.getRun(env.runId))!;
        await expect(env.repository.prepareOperation({ runId: env.runId, operationId: randomUUID(), expectedRevision: run.revision,
          role, taskId: null, subjectKind: "book", subjectId: run.bookletId, providerKind: "text", attempt: 1,
          inputFingerprint: "a".repeat(64), nowMs: env.next() })).rejects.toThrow("Evaluation must save one tester report");
      };
      await assertAdmissionRejected("judge");
      const report = {
        schemaVersion: "2", role: "tester", mode: "simulated", runId: env.runId, configurationHash: completedEvidence.configurationHash,
        summary: "Simulated creator feedback; not a human UI usability assessment.",
        intent: { status: "observed", explanation: "The fixed brief is retained." },
        consistency: { status: "observed", explanation: "Synthetic page images carry advisory consistency warnings." },
        interaction: { status: "observed", explanation: "Low-interaction delegated journey completed." },
        costEvidence: { status: "available", actualUsd: 0, estimatedUsd: null, explanation: "No payable provider requests in this simulation." },
        findings: [{ category: "consistency", target: { kind: "run", runId: env.runId }, explanation: "Synthetic images do not establish real visual quality. No regeneration requested." }],
        evidence: { versionIds: completedEvidence.artifacts.map((artifact) => artifact.versionId),
          inspectedAssetIds: [...completedEvidence.referenceAssetIds, ...completedEvidence.finalAssetIds] },
      };
      await expect(env.testerDecision({ kind: "feedback", payload: report }, true, true, true))
        .rejects.toMatchObject({ code: "invalid_state" });
      const pendingReport = (await env.repository.listOperations(env.runId)).at(-1)!;
      expect(pendingReport.state).toBe("unknown");
      expect((await env.repository.getRun(env.runId))!.evaluationStatus).toBe("pending");
      expect(pendingReport.resultJson).toBeNull();
      await env.repository.verifyDispatchPublication({ runId: env.runId, operationId: pendingReport._id,
        workflowRunId: pendingReport.workflowRunId!, parentWorkflowRunId: null,
        workflowId: env.config.bindings.find((binding) => binding.role === "tester" && binding.persona === persona)!.publishedWorkflowId,
        nowMs: env.next() });
      const reportContext = await env.context.getOperationContext({ runId: env.runId, operationId: pendingReport._id,
        workflowRunId: pendingReport.workflowRunId!, parentWorkflowRunId: null });
      expect(reportContext).toMatchObject({ role: "tester", reportEvidence: { mode: "simulated", runId: env.runId,
        configurationHash: completedEvidence.configurationHash } });
      await expect(env.repository.completeOperation({ envelope: { runId: env.runId, operationId: pendingReport._id,
        workflowRunId: pendingReport.workflowRunId!, inputFingerprint: pendingReport.inputFingerprint,
        result: { kind: "feedback", payload: { ...report, configurationHash: "b".repeat(64) } } }, parentWorkflowRunId: null, nowMs: env.next() }))
        .rejects.toMatchObject({ code: "invalid_result" });
      const retained = await env.repository.completeOperation({ envelope: { runId: env.runId, operationId: pendingReport._id,
        workflowRunId: pendingReport.workflowRunId!, inputFingerprint: pendingReport.inputFingerprint,
        result: { kind: "feedback", payload: report } }, parentWorkflowRunId: null, nowMs: env.next() });
      expect(retained.operation.state).toBe("succeeded");
      expect(JSON.parse(retained.operation.resultJson!).payload).toEqual(report);
      expect((await env.repository.getRun(env.runId))!).toMatchObject({ status: "queued", evaluationStatus: "running", activeOperationId: null });
      const reused = await env.repository.completeOperation({ envelope: { runId: env.runId, operationId: retained.operation._id,
        workflowRunId: retained.operation.workflowRunId!, inputFingerprint: retained.operation.inputFingerprint,
        result: { kind: "feedback", payload: report } }, parentWorkflowRunId: null, nowMs: env.next() });
      expect(reused.reused).toBe(true);
      await assertAdmissionRejected("tester");
      expect((await env.context.getRunView(env.runId))!.reports).toMatchObject([{ operationId: retained.operation._id,
        verifiedWorkflowId: env.config.bindings.find((binding) => binding.role === "tester" && binding.persona === persona)!.publishedWorkflowId,
        matchesCurrentVersions: true, report }]);
      expect(await env.database.collections.artifacts.countDocuments({ experimentRunId: env.runId, taskId: "J13", state: "approved" })).toBe(expected);
      await expect(env.testerDecision({ kind: "assessment", payload: { ...report, role: "judge" } }, true, true, true, "judge"))
        .rejects.toMatchObject({ code: "invalid_state" });
      const judgeOperation = (await env.repository.listOperations(env.runId)).at(-1)!;
      const judgeBinding = env.config.bindings.find((binding) => binding.role === "judge")!;
      await env.repository.verifyDispatchPublication({ runId: env.runId, operationId: judgeOperation._id,
        workflowRunId: judgeOperation.workflowRunId!, parentWorkflowRunId: null, workflowId: judgeBinding.publishedWorkflowId, nowMs: env.next() });
      const judgeContext = await env.context.getOperationContext({ runId: env.runId, operationId: judgeOperation._id,
        workflowRunId: judgeOperation.workflowRunId!, parentWorkflowRunId: null });
      const assessment = simulateNarrativeResult(judgeContext, "simulated");
      expect(assessment).toMatchObject({ kind: "assessment", payload: { role: "judge", intent: { status: "not_assessed" } } });
      await env.repository.completeOperation({ envelope: { runId: env.runId, operationId: judgeOperation._id,
        workflowRunId: judgeOperation.workflowRunId!, inputFingerprint: judgeOperation.inputFingerprint, result: assessment },
        parentWorkflowRunId: null, nowMs: env.next() });
      expect((await env.context.getRunView(env.runId))!.reports).toHaveLength(2);
      await assertAdmissionRejected("judge");
      const sheet = await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J09" });
      const sheetVersion = await env.database.collections.artifact_versions.findOne({ _id: sheet!.currentVersionId! });
      const sheetApproval = await env.database.collections.approvals.findOne({ experimentRunId: env.runId, artifactVersionId: sheet!.currentVersionId! });
      const extraId = randomUUID(), extraVersionId = randomUUID(), extraApprovalId = randomUUID();
      const extraContent = JSON.parse(sheetVersion!.contentJson) as { build: { assetId: string } };
      extraContent.build.assetId = randomUUID();
      await env.database.collections.artifacts.insertOne({ ...sheet!, _id: extraId, subjectId: randomUUID(), currentVersionId: extraVersionId });
      await env.database.collections.artifact_versions.insertOne({ ...sheetVersion!, _id: extraVersionId, artifactId: extraId,
        createdBy: "agent", sourceVersionId: null, dependencyVersionIdsJson: "[]", contentJson: JSON.stringify(extraContent) });
      await env.database.collections.approvals.insertOne({ ...sheetApproval!, _id: extraApprovalId, artifactVersionId: extraVersionId });
      await expect(withMongoTransaction(env.database, async (session) => verifyExperimentGeneration(env.database, session,
        (await env.repository.getRun(env.runId))!, env.store))).rejects.toThrow("exact required sheet targets");
      await env.database.collections.approvals.deleteOne({ _id: extraApprovalId });
      await env.database.collections.artifact_versions.deleteOne({ _id: extraVersionId });
      await env.database.collections.artifacts.deleteOne({ _id: extraId });
      const draftList = await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J03" });
      const version = await env.database.collections.artifact_versions.findOne({ _id: draftList!.currentVersionId! });
      await env.database.collections.artifact_versions.updateOne({ _id: version!._id }, { $set: { artifactId: randomUUID() } });
      await expect(withMongoTransaction(env.database, async (session) => verifyExperimentGeneration(env.database, session,
        (await env.repository.getRun(env.runId))!, env.store))).rejects.toThrow("approval evidence");
      await env.database.collections.artifact_versions.updateOne({ _id: version!._id }, { $set: { artifactId: version!.artifactId } });
      await env.database.collections.artifact_versions.updateOne({ _id: version!._id }, { $set: { dependencyVersionIdsJson: "[]" } });
      await expect(withMongoTransaction(env.database, async (session) => verifyExperimentGeneration(env.database, session,
        (await env.repository.getRun(env.runId))!, env.store))).rejects.toThrow("dependency edges");
      await env.database.collections.artifact_versions.updateOne({ _id: version!._id }, { $set: { dependencyVersionIdsJson: version!.dependencyVersionIdsJson } });
      const approval = await env.database.collections.approvals.findOne({ experimentRunId: env.runId, artifactVersionId: completedEvidence.finalPages[0].versionId });
      await env.database.collections.approvals.updateOne({ _id: approval!._id }, { $set: { action: "reject" } });
      await expect(withMongoTransaction(env.database, async (session) => verifyExperimentGeneration(env.database, session,
        (await env.repository.getRun(env.runId))!, env.store))).rejects.toThrow("approval evidence");
      await env.database.collections.approvals.updateOne({ _id: approval!._id }, { $set: { action: approval!.action } });
    }
    const damaged = await env.database.collections.assets.findOne({ _id: completedEvidence.finalAssetIds[0] });
    env.store.files.set(damaged!.uri, new Uint8Array([1]));
    await expect(withMongoTransaction(env.database, async (session) => verifyExperimentGeneration(env.database, session,
      (await env.repository.getRun(env.runId))!, env.store))).rejects.toThrow();
  }, 120_000);

  it("recovers a lost J12 result through GET with the same page and no replacement POST", async () => {
    const env = await setup("playful_kid", 17);
    for (let step = 0; step < 120; step++) {
      if ((await env.context.getRunView(env.runId))?.nextNarrativeTask === "J12") break;
      expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
    }
    const before = (await env.context.getRunView(env.runId))!;
    expect(before.nextNarrativeTask).toBe("J12");
    const savedLayout = before.currentArtifacts.find((item) => item.taskId === "J11")!;
    const layout = parseStoredPageLayout(before.persona, savedLayout.versions.find((item) => item.id === savedLayout.currentVersionId)!.content);
    expect(await env.dispatcher().advance(env.runId)).toBe("advanced"); // manager page delegation
    const manager = (await env.repository.listOperations(env.runId)).at(-1)!;
    expect(manager).toMatchObject({ role: "manager", state: "succeeded" });
    env.faults({ lostPageBible: true });
    expect(await env.dispatcher().advance(env.runId)).toBe("advanced");
    const blocked = (await env.repository.getRun(env.runId))!;
    const operation = (await env.repository.getOperation(blocked.activeOperationId!))!;
    expect(blocked).toMatchObject({ status: "blocked", safeFailure: "unknown_outcome" });
    expect(operation).toMatchObject({ role: "specialist", taskId: "J12", subjectKind: "page",
      subjectId: layout.pages[0].pageId, state: "unknown", reservationCount: 1,
      parentWorkflowRunId: manager.workflowRunId });
    const starts = vi.mocked(env.runtime.start).mock.calls.length;
    expect(await env.dispatcher().advance(env.runId)).toBe("waiting");
    expect(vi.mocked(env.runtime.start).mock.calls).toHaveLength(starts);
    expect(env.runtime.retrieve).toHaveBeenCalled();
    const recovered = (await env.repository.getOperation(operation._id))!;
    expect(recovered).toMatchObject({ state: "succeeded", workflowRunId: operation.workflowRunId,
      parentWorkflowRunId: manager.workflowRunId, reservationCount: 1 });
    const saved = JSON.parse(recovered.materializationJson!) as { versionId: string; artifactId: string };
    expect(await env.database.collections.artifacts.findOne({ _id: saved.artifactId })).toMatchObject({
      taskId: "J12", subjectKind: "page", subjectId: layout.pages[0].pageId, currentVersionId: saved.versionId, state: "approved",
    });
    expect(await env.database.collections.artifact_versions.countDocuments({ artifactId: saved.artifactId })).toBe(1);
    expect((await env.repository.listOperations(env.runId)).filter((item) => item.taskId === "J12")).toHaveLength(1);
  });

  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("dispatches the full 17-slot %s profile through J13", async (persona) => {
    const env = await setup(persona, 17);
    let reached = false;
    for (let step = 0; step < 160; step++) {
      const outcome = await env.dispatcher().advance(env.runId);
      expect(outcome).not.toBe("blocked");
      if (outcome === "boundary") { reached = true; break; }
    }
    expect(reached).toBe(true);
    const view = (await env.context.getRunView(env.runId))!;
    const layoutArtifact = view.currentArtifacts.find((item) => item.taskId === "J11")!;
    const layout = parseStoredPageLayout(persona, layoutArtifact.versions.find((item) => item.id === layoutArtifact.currentVersionId)!.content);
    expect(layout.pages).toHaveLength(persona === "playful_kid" ? 4 : persona === "enthusiast_parent" ? 6 : 9);
    expect(layout.pages.slice(1).filter((page) => page.panels.length > 1)).toHaveLength(persona === "playful_kid" ? 0 : persona === "enthusiast_parent" ? 1 : 2);
    const manuscript = view.currentArtifacts.find((item) => item.taskId === "J05")!;
    const style = view.currentArtifacts.find((item) => item.taskId === "J08")!;
    const source = manuscript.versions.find((item) => item.id === manuscript.currentVersionId)!.content as { units: { narration: string }[] };
    const pageArtifacts = view.currentArtifacts.filter((item) => item.taskId === "J12");
    expect(pageArtifacts).toHaveLength(layout.pages.length);
    for (const page of layout.pages) {
      const artifact = pageArtifacts.find((item) => item.subjectKind === "page" && item.subjectId === page.pageId)!;
      expect(artifact.state).toBe("approved");
      const version = artifact.versions.find((item) => item.id === artifact.currentVersionId)!;
      expect(version.approval).toBeTruthy();
      const content = version.content as { pageId: string; pageIndex: number; layoutVersionId: string; manuscriptVersionId: string;
        styleVersionId: string; panels: { panelKey: string; manuscriptUnitIds: string[]; lettering: { kind: string; text: string }[] }[] };
      expect(content).toMatchObject({ pageId: page.pageId, pageIndex: page.pageIndex,
        layoutVersionId: layoutArtifact.currentVersionId, manuscriptVersionId: manuscript.currentVersionId,
        styleVersionId: style.currentVersionId });
      expect(content.panels.map((panel) => panel.panelKey)).toEqual(page.panels.map((panel) => panel.panelKey));
      if (page.pageIndex === 0) expect(content.panels[0].lettering).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "title", text: layout.title })]));
      else for (const panel of content.panels) for (const letter of panel.lettering.filter((item) => item.kind === "narration")) {
        expect(source.units.some((unit) => unit.narration === letter.text)).toBe(true);
      }
    }
    const operations = (await env.repository.listOperations(env.runId)).filter((item) => item.taskId === "J12" && item.role === "specialist");
    expect(operations).toHaveLength(layout.pages.length);
    const managers = await env.repository.listOperations(env.runId);
    for (const operation of operations) {
      expect(operation).toMatchObject({ state: "succeeded", reservationCount: 1 });
      expect(operation.parentWorkflowRunId).toBeTruthy();
      expect(managers.some((item) => item.role === "manager" && item.workflowRunId === operation.parentWorkflowRunId &&
        item.resultJson?.includes('"taskId":"J12"'))).toBe(true);
    }
    expect(view.counters).toMatchObject({ payableText: 0, payableImage: 0 });
    expect(view.status).not.toBe("completed");
    expect((await env.database.collections.booklets.findOne({ _id: view.bookletId }))?.currentStage).toBe("J13");
  });

  async function pageBibleEnvironment(persona: Persona) {
    const env = await setup(persona, 16);
    let reached = false;
    for (let step = 0; step < 100; step++) {
      const outcome = await env.dispatcher().advance(env.runId);
      expect(outcome).not.toBe("blocked");
      if (outcome === "boundary") { reached = true; break; }
    }
    expect(reached).toBe(true);
    const view = (await env.context.getRunView(env.runId))!;
    const layoutVersion = view.currentArtifacts.find((item) => item.taskId === "J11")!.currentVersionId!;
    const manuscriptVersion = view.currentArtifacts.find((item) => item.taskId === "J05")!.currentVersionId!;
    const styleVersion = view.currentArtifacts.find((item) => item.taskId === "J08")!.currentVersionId!;
    const layoutContent = view.currentArtifacts.find((item) => item.taskId === "J11")!.versions.find((item) => item.id === layoutVersion)!.content;
    const layout = parseStoredPageLayout(persona, layoutContent);
    const run = (await env.repository.getRun(env.runId))!;
    const saved = JSON.parse(run.configurationJson) as Record<string, unknown>[];
    expect(saved).toHaveLength(14);
    saved.push({ role: "specialist", taskId: "J12", appId: randomUUID(), publishedWorkflowId: randomUUID(), toolProviderId: null });
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { configurationJson: JSON.stringify(saved) } });
    function proposal(pageIndex: number) {
      const page = layout.pages[pageIndex];
      return { schemaVersion: "2", pageId: page.pageId, pageIndex, layoutVersionId: layoutVersion,
        manuscriptVersionId: manuscriptVersion, styleVersionId: styleVersion,
        panels: page.panels.map((panel, index) => ({ panelKey: panel.panelKey,
          manuscriptUnitIds: panel.manuscriptUnitIds, sheetReferences: panel.sheetReferences,
          actionBeat: "Follow the saved manuscript beat.", emotionalBeat: "Curiosity", composition: "Clear focal action",
          characterIds: panel.sheetReferences.filter((ref) => ref.subjectKind === "character").map((ref) => ref.subjectId),
          locationIds: panel.sheetReferences.filter((ref) => ref.subjectKind === "location").map((ref) => ref.subjectId),
          lettering: index === 0 ? [{ kind: pageIndex === 0 ? "title" : "narration", text: pageIndex === 0 ? `  ${layout.title}  ` : "  Follow the light.  ",
            form: pageIndex === 0 ? "display" : "caption", speakerEntityId: null, panelKey: panel.panelKey,
            placement: "Inside live safe region", typographyTreatment: "Saved hierarchy", bubbleTreatment: "No bubble" }] : [],
          noText: index !== 0,
        })), reviewQuestions: [] };
    }
    async function produce(pageIndex: number, content: ReturnType<typeof proposal> = proposal(pageIndex), unknown = false) {
      const pageId = layout.pages[pageIndex].pageId;
      const operationId = randomUUID(), workflowRunId = randomUUID();
      const run = (await env.repository.getRun(env.runId))!;
      const operation = await env.repository.prepareOperation({ runId: env.runId, operationId, expectedRevision: run.revision,
        role: "specialist", taskId: "J12", subjectKind: "page", subjectId: pageId,
        inputFingerprint: createHash("sha256").update(operationId).digest("hex"), attempt: 1, providerKind: "text", nowMs: env.next() });
      await env.repository.beginDispatch({ runId: env.runId, operationId, parentWorkflowRunId: null, nowMs: env.next() });
      await env.repository.claimOperation({ runId: env.runId, operationId, workflowRunId, parentWorkflowRunId: null, nowMs: env.next() });
      if (unknown) {
        await env.repository.verifyDispatchPublication({ runId: env.runId, operationId, workflowRunId,
          parentWorkflowRunId: null, workflowId: saved.at(-1)!.publishedWorkflowId, nowMs: env.next() });
        await env.repository.recordDispatchOutcome({ runId: env.runId, operationId, parentWorkflowRunId: null,
          category: "unknown_outcome", nowMs: env.next() });
      }
      const envelope = { runId: env.runId, operationId, workflowRunId, inputFingerprint: operation.inputFingerprint,
        result: { kind: "proposal", payload: { taskId: "J12", content } } as RoleResult };
      const completed = await env.repository.completeOperation({ envelope, parentWorkflowRunId: null, nowMs: env.next() });
      return { completed, envelope };
    }
    return { ...env, layout, proposal, produce };
  }

  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("retains %s per-page J12 approvals and stops at J13", async (persona) => {
    const env = await pageBibleEnvironment(persona);
    const run = (await env.repository.getRun(env.runId))!;
    await env.testerDecision({ kind: "decision", payload: { decision: { action: "delegate", taskIds: ["J12"], subjectId: run.bookletId } } });
    const versions = vi.spyOn(env.database.collections.artifact_versions, "findOne");
    const approvals = vi.spyOn(env.database.collections.approvals, "findOne");
    const pointReads: number[] = [];
    for (const page of env.layout.pages) {
      versions.mockClear(); approvals.mockClear();
      const result = await env.produce(page.pageIndex);
      expect(result.completed.reused).toBe(false);
      pointReads.push(versions.mock.calls.length + approvals.mock.calls.length);
    }
    // Later pages must not add point lookups for each already approved sibling.
    expect(new Set(pointReads).size).toBe(1);
    versions.mockRestore(); approvals.mockRestore();
    const artifacts = await env.database.collections.artifacts.find({ experimentRunId: env.runId, taskId: "J12" }).sort({ subjectId: 1 }).toArray();
    expect(artifacts).toHaveLength(env.layout.pages.length);
    expect(new Set(artifacts.map((item) => item.subjectId))).toEqual(new Set(env.layout.pages.map((page) => page.pageId)));
    expect(artifacts.every((item) => item.state === "approved")).toBe(true);
    expect(await env.database.collections.approvals.countDocuments({ experimentRunId: env.runId,
      artifactVersionId: { $in: artifacts.map((item) => item.currentVersionId!) } })).toBe(env.layout.pages.length);
    expect((await env.database.collections.booklets.findOne({ _id: run.bookletId }))?.currentStage).toBe("J13");
    expect((await env.repository.getRun(env.runId))?.status).not.toBe("completed");
  });

  it("rejects wrong-page J12 content and retains its claimed operation", async () => {
    const env = await pageBibleEnvironment("playful_kid");
    const wrong = { ...env.proposal(1), pageId: env.layout.pages[2].pageId };
    await expect(env.produce(1, wrong)).rejects.toThrow();
    const failed = (await env.repository.getRun(env.runId))!;
    const active = (await env.repository.getOperation(failed.activeOperationId!))!;
    await env.repository.recordDispatchOutcome({ runId: env.runId, operationId: active._id, parentWorkflowRunId: null,
      category: "unknown_outcome", nowMs: env.next() });
    // The bad operation retains its claim; recovery requires the exact result identity.
    expect((await env.repository.getOperation(active._id))?.state).toBe("unknown");
  });
  it("completes an unknown J12 claim once and reuses its saved version after restart", async () => {
    const env = await pageBibleEnvironment("playful_kid");
    const reads = vi.spyOn(env.store, "get");
    const first = await env.produce(1, env.proposal(1), true);
    expect(reads).toHaveBeenCalled();
    const saved = JSON.parse(first.completed.operation.materializationJson!) as { versionId: string; artifactId: string };
    const duplicate = await createExperimentRepository(env.database, { store: () => env.store }).completeOperation({
      envelope: first.envelope, parentWorkflowRunId: null, nowMs: env.next() });
    expect(duplicate.reused).toBe(true);
    expect(JSON.parse(duplicate.operation.materializationJson!)).toMatchObject(saved);
    expect(await env.database.collections.artifact_versions.countDocuments({ artifactId: saved.artifactId })).toBe(1);
    reads.mockRestore();
  });
  it("leaves a J12 draft after revocation and accepts it through explicit tester approval", async () => {
    const env = await pageBibleEnvironment("playful_kid");
    const run = (await env.repository.getRun(env.runId))!;
    await env.testerDecision({ kind: "decision", payload: { decision: { action: "delegate", taskIds: ["J12"], subjectId: run.bookletId } } });
    const grantId = (await env.repository.getRun(env.runId))!.activeDelegationId!;
    await env.testerDecision({ kind: "decision", payload: { decision: { action: "revoke_delegation", delegationId: grantId } } });
    const { completed } = await env.produce(1);
    const saved = JSON.parse(completed.operation.materializationJson!) as { versionId: string; approvalId: string | null };
    expect(saved.approvalId).toBeNull();
    expect((await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J12", subjectId: env.layout.pages[1].pageId }))?.state).toBe("draft");
    await env.testerDecision({ kind: "decision", payload: { decision: { action: "approve", versionIds: [saved.versionId] } } });
    expect((await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J12", subjectId: env.layout.pages[1].pageId }))?.state).toBe("approved");
    expect((await env.database.collections.booklets.findOne({ _id: run.bookletId }))?.currentStage).toBe("J12");
  });
  it("rechecks selected J12 source bytes on a transaction retry", async () => {
    const env = await pageBibleEnvironment("playful_kid");
    const get = vi.spyOn(env.store, "get");
    const run = (await env.repository.getRun(env.runId))!;
    await withMongoTransaction(env.database, (session) => verifyCurrentPageBibleSources(env.database, session,
      run, env.layout.pages[1].pageId, env.store));
    const readsPerAttempt = get.mock.calls.length;
    expect(readsPerAttempt).toBeGreaterThan(0);
    const versions = env.database.collections.artifact_versions;
    const insert = versions.insertOne.bind(versions);
    let retried = false;
    const spy = vi.spyOn(versions, "insertOne").mockImplementation(async (...args) => {
      if (!retried && args[0].createdBy === "agent" && args[0].sourceOperationId) {
        retried = true;
        const error = new MongoServerError({ ok: 0, errmsg: "synthetic retry", code: 112 });
        error.addErrorLabel("TransientTransactionError");
        throw error;
      }
      return insert(...args);
    });
    get.mockClear();
    try { await env.produce(1); } finally { spy.mockRestore(); }
    expect(retried).toBe(true);
    expect(get).toHaveBeenCalledTimes(3 * readsPerAttempt);
    get.mockRestore();
  });
  it("revises one J12 page without changing an approved sibling", async () => {
    const env = await pageBibleEnvironment("playful_kid");
    const run = (await env.repository.getRun(env.runId))!;
    await env.testerDecision({ kind: "decision", payload: { decision: { action: "delegate", taskIds: ["J12"], subjectId: run.bookletId } } });
    const first = await env.produce(1), sibling = await env.produce(2);
    const original = JSON.parse(first.completed.operation.materializationJson!) as { versionId: string };
    const siblingSaved = JSON.parse(sibling.completed.operation.materializationJson!) as { versionId: string };
    await env.testerDecision({ kind: "decision", payload: { decision: { action: "revise", taskId: "J12",
      artifactVersionId: original.versionId, instruction: "Clarify the first story page." } } });
    const revised = env.proposal(1);
    revised.panels[0].lettering[0].text = "  The path opens.  ";
    const replacement = await env.produce(1, revised);
    expect(JSON.parse(replacement.completed.operation.materializationJson!)).toMatchObject({ approvalId: expect.any(String) });
    const siblingArtifact = await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J12",
      subjectId: env.layout.pages[2].pageId });
    expect(siblingArtifact).toMatchObject({ currentVersionId: siblingSaved.versionId, state: "approved" });
    expect((await env.repository.getRun(env.runId))?.textRevisions).toBe(1);
  });
  it("rejects J11 preparation after a required sheet loses approval or saved bytes", async () => {
    const env = await setup("professional_creator", 16);
    await env.reachPagination();
    const view = (await env.context.getRunView(env.runId))!;
    const sheet = view.currentArtifacts.filter((item) => item.taskId === "J10").at(-1)!;
    const approval = (await env.database.collections.approvals.findOne({ artifactVersionId: sheet.currentVersionId! }))!;
    const prepare = async () => env.repository.prepareOperation({ runId: env.runId, operationId: randomUUID(),
      expectedRevision: (await env.repository.getRun(env.runId))!.revision, role: "specialist", taskId: "J11",
      subjectKind: "book", subjectId: view.bookletId, inputFingerprint: "b".repeat(64), attempt: 1, providerKind: "text", nowMs: env.next() });
    await env.database.collections.approvals.deleteOne({ _id: approval._id });
    await expect(prepare()).rejects.toMatchObject({ code: "invalid_result" });
    await env.database.collections.approvals.insertOne(approval);
    const version = sheet.versions.find((item) => item.id === sheet.currentVersionId)!;
    const content = version.content as { build: { assetId: string } };
    const asset = (await env.database.collections.assets.findOne({ _id: content.build.assetId }))!;
    env.store.files.set(asset.uri, new Uint8Array([1]));
    await expect(prepare()).rejects.toMatchObject({ code: "invalid_state" });
    expect(await env.database.collections.artifacts.countDocuments({ experimentRunId: env.runId, taskId: "J11" })).toBe(0);
    expect((await env.repository.getRun(env.runId))?.activeOperationId).toBeNull();
  });
  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("verifies J11 sources once per %s completion and approval attempt", async (persona) => {
    const env = await setup(persona, 16);
    await env.reachPagination();
    const get = vi.spyOn(env.store, "get");
    await withMongoTransaction(env.database, async (session) => verifyCurrentPaginationSources(env.database, session,
      (await env.repository.getRun(env.runId))!, env.store));
    const readsPerVerification = get.mock.calls.length;
    expect(readsPerVerification).toBeGreaterThan(0);
    const run = (await env.repository.getRun(env.runId))!;
    const operationId = randomUUID(), workflowRunId = randomUUID(), parentWorkflowRunId = randomUUID();
    const operation = await env.repository.prepareOperation({ runId: env.runId, operationId, expectedRevision: run.revision,
      role: "specialist", taskId: "J11", subjectKind: "book", subjectId: run.bookletId, inputFingerprint: "a".repeat(64),
      attempt: 1, providerKind: "text", nowMs: env.next() });
    await env.repository.claimOperation({ runId: env.runId, operationId, workflowRunId, parentWorkflowRunId, nowMs: env.next() });
    const result = simulateNarrativeResult(await env.context.getOperationContext({ runId: env.runId, operationId,
      workflowRunId, parentWorkflowRunId }), "simulated");
    get.mockClear();
    await env.repository.completeOperation({ envelope: { runId: env.runId, operationId, workflowRunId,
      inputFingerprint: operation.inputFingerprint, result }, parentWorkflowRunId, nowMs: env.next() });
    expect(get).toHaveBeenCalledTimes(readsPerVerification);
    const view = (await env.context.getRunView(env.runId))!;
    const layout = view.currentArtifacts.find((item) => item.taskId === "J11")!;
    get.mockClear();
    await env.testerDecision({ kind: "decision", payload: { decision: { action: "approve", versionIds: [layout.currentVersionId!] } } });
    expect(get).toHaveBeenCalledTimes(readsPerVerification);
    expect((await env.context.getRunView(env.runId))?.currentArtifacts.find((item) => item.taskId === "J11")?.state).toBe("approved");
    get.mockRestore();
  });
  it("reverifies J11 sources on a transaction retry and a later approval request", async () => {
    const env = await setup("professional_creator", 16);
    await env.reachPagination();
    const get = vi.spyOn(env.store, "get");
    await withMongoTransaction(env.database, async (session) => verifyCurrentPaginationSources(env.database, session,
      (await env.repository.getRun(env.runId))!, env.store));
    const readsPerVerification = get.mock.calls.length;
    const run = (await env.repository.getRun(env.runId))!;
    const operationId = randomUUID(), workflowRunId = randomUUID(), parentWorkflowRunId = randomUUID();
    const operation = await env.repository.prepareOperation({ runId: env.runId, operationId, expectedRevision: run.revision,
      role: "specialist", taskId: "J11", subjectKind: "book", subjectId: run.bookletId, inputFingerprint: "a".repeat(64),
      attempt: 1, providerKind: "text", nowMs: env.next() });
    await env.repository.claimOperation({ runId: env.runId, operationId, workflowRunId, parentWorkflowRunId, nowMs: env.next() });
    const result = simulateNarrativeResult(await env.context.getOperationContext({ runId: env.runId, operationId,
      workflowRunId, parentWorkflowRunId }), "simulated");
    const artifacts = env.database.collections.artifacts;
    const originalInsert = artifacts.insertOne.bind(artifacts);
    let retried = false;
    const insert = vi.spyOn(artifacts, "insertOne").mockImplementation(async (...args) => {
      if (!retried && args[0].taskId === "J11") {
        retried = true;
        const error = new MongoServerError({ ok: 0, errmsg: "synthetic transaction retry", code: 112 });
        error.addErrorLabel("TransientTransactionError");
        throw error;
      }
      return originalInsert(...args);
    });
    get.mockClear();
    try {
      await env.repository.completeOperation({ envelope: { runId: env.runId, operationId, workflowRunId,
        inputFingerprint: operation.inputFingerprint, result }, parentWorkflowRunId, nowMs: env.next() });
    } finally { insert.mockRestore(); }
    expect(retried).toBe(true);
    expect(get).toHaveBeenCalledTimes(2 * readsPerVerification);
    const view = (await env.context.getRunView(env.runId))!;
    const layout = view.currentArtifacts.find((item) => item.taskId === "J11")!;
    const reference = view.currentArtifacts.find((item) => item.taskId === "J09")!;
    const build = reference.versions.find((item) => item.id === reference.currentVersionId)!.content as { build: { assetId: string } };
    const asset = (await env.database.collections.assets.findOne({ _id: build.build.assetId }))!;
    env.store.files.set(asset.uri, new Uint8Array([1]));
    get.mockClear();
    await expect(env.testerDecision({ kind: "decision", payload: { decision: { action: "approve",
      versionIds: [layout.currentVersionId!] } } })).rejects.toThrow();
    expect(get.mock.calls.length).toBeGreaterThan(0);
    expect((await env.context.getRunView(env.runId))?.currentArtifacts.find((item) => item.taskId === "J11")?.state).toBe("draft");
    get.mockRestore();
  });
  it("preserves saved page identities across J11 revision and duplicate completion", async () => {
    const env = await setup("professional_creator", 16);
    for (let step = 0; step < 100; step++) if (await env.dispatcher().advance(env.runId) === "boundary") break;
    const before = (await env.context.getRunView(env.runId))!;
    const artifact = before.currentArtifacts.find((item) => item.taskId === "J11")!;
    const first = artifact.versions.find((item) => item.id === artifact.currentVersionId)!;
    const ids = parseStoredPageLayout(before.persona, first.content).pages.map((page) => page.pageId);
    const specialist = (await env.repository.listOperations(env.runId)).filter((item) => item.role === "specialist" && item.taskId === "J11").at(-1)!;
    const duplicate = await env.repository.completeOperation({ envelope: { runId: env.runId, operationId: specialist._id,
      workflowRunId: specialist.workflowRunId!, inputFingerprint: specialist.inputFingerprint, result: JSON.parse(specialist.resultJson!) },
      parentWorkflowRunId: specialist.parentWorkflowRunId, nowMs: env.next() });
    expect(duplicate.operation.materializationJson).toBe(specialist.materializationJson);
    const revision = await env.testerDecision({ kind: "decision", payload: { decision: { action: "revise", taskId: "J11", artifactVersionId: first.id, instruction: "Keep the layout and clarify its review notes." } } }, false, true);
    await env.repository.verifyDispatchPublication({ runId: env.runId, operationId: revision.operation._id,
      parentWorkflowRunId: revision.operation.parentWorkflowRunId, workflowRunId: revision.operation.workflowRunId!,
      workflowId: env.config.bindings.find((item) => item.role === "tester" && item.persona === "professional_creator")!.publishedWorkflowId, nowMs: env.next() });
    for (let step = 0; step < 10; step++) if (await env.dispatcher().advance(env.runId) === "boundary") break;
    const after = (await createExperimentContextService(env.database).getRunView(env.runId))!;
    const current = after.currentArtifacts.find((item) => item.taskId === "J11")!;
    expect(current.currentVersionId).not.toBe(first.id);
    expect(current.versions).toHaveLength(2);
    expect(parseStoredPageLayout(after.persona, current.versions.at(-1)!.content).pages.map((page) => page.pageId)).toEqual(ids);
    expect(current.versions.at(-1)?.approval?.origin).toBe("explicit");
    expect(after.nextNarrativeTask).toBe("slice_complete");
    expect((await env.repository.getRun(env.runId))?.textRevisions).toBe(1);
  });
  it("recovers a lost J11 result through GET without another specialist execution", async () => {
    const env = await setup("playful_kid", 16);
    for (let step = 0; step < 100; step++) {
      if ((await env.context.getRunView(env.runId))?.nextNarrativeTask === "J11") break;
      expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
    }
    expect((await env.context.getRunView(env.runId))?.nextNarrativeTask).toBe("J11");
    await withMongoTransaction(env.database, async (session) => verifyCurrentPaginationSources(env.database, session,
      (await env.repository.getRun(env.runId))!, env.store));
    env.faults({ lostPagination: true });
    for (let step = 0; step < 3; step++) {
      await env.dispatcher().advance(env.runId);
      if ((await env.repository.getRun(env.runId))?.safeFailure === "unknown_outcome") break;
    }
    expect(await env.repository.getRun(env.runId)).toMatchObject({ status: "blocked", safeFailure: "unknown_outcome" });
    const posts = vi.mocked(env.runtime.start).mock.calls.length;
    await env.dispatcher().advance(env.runId);
    expect(vi.mocked(env.runtime.start).mock.calls).toHaveLength(posts);
    expect(vi.mocked(env.runtime.retrieve).mock.calls.length).toBeGreaterThan(0);
    expect((await env.context.getRunView(env.runId))?.currentArtifacts.find((item) => item.taskId === "J11")).toMatchObject({ state: "approved" });
    expect(await env.dispatcher().advance(env.runId)).toBe("boundary");
  });
  it.each(["failed", "stopped"] as const)("retains a claimed J11 %s outcome for late completion without another POST", async (status) => {
    const env = await setup("playful_kid", 16);
    await env.reachPagination();
    expect(await env.dispatcher().advance(env.runId)).toBe("advanced"); // manager delegation
    env.faults({ paginationTerminal: status });
    expect(await env.dispatcher().advance(env.runId)).toBe("advanced");
    const run = (await env.repository.getRun(env.runId))!;
    const operation = (await env.repository.getOperation(run.activeOperationId!))!;
    expect(run).toMatchObject({ status: "blocked", safeFailure: "unknown_outcome", activeOperationId: operation._id });
    expect(operation).toMatchObject({ role: "specialist", taskId: "J11", state: "unknown", reservationCount: 1 });
    expect(operation.verifiedWorkflowId ?? null).toBeNull(); // start identity is not terminal publication evidence
    const starts = vi.mocked(env.runtime.start).mock.calls.length;
    expect(await env.dispatcher().advance(env.runId)).toBe("waiting");
    expect(vi.mocked(env.runtime.start).mock.calls).toHaveLength(starts);
    expect(env.runtime.retrieve).toHaveBeenCalled();
    const result = simulateNarrativeResult(await env.context.getOperationContext({ runId: env.runId,
      operationId: operation._id, workflowRunId: operation.workflowRunId!, parentWorkflowRunId: operation.parentWorkflowRunId }), "simulated");
    await env.repository.completeOperation({ envelope: { runId: env.runId, operationId: operation._id,
      workflowRunId: operation.workflowRunId!, inputFingerprint: operation.inputFingerprint, result },
      parentWorkflowRunId: operation.parentWorkflowRunId, nowMs: env.next() });
    expect((await env.repository.getOperation(operation._id))?.state).toBe("succeeded");
    expect((await env.repository.getOperation(operation._id))?.verifiedWorkflowId ?? null).toBeNull();
    expect((await env.repository.getRun(env.runId))?.safeFailure).toBeNull();
    env.faults({});
    env.elapse(5_000);
    await env.dispatcher().advance(env.runId);
    expect(vi.mocked(env.runtime.start).mock.calls.filter(([binding]) => binding.taskId === "J11")).toHaveLength(1);
  });
  it("recovers a lost manager delegation to J11 through GET without another POST", async () => {
    const env = await setup("playful_kid", 16);
    await env.reachPagination();
    env.faults({ lostManagerPagination: true });
    await env.dispatcher().advance(env.runId);
    const blocked = (await env.repository.getRun(env.runId))!;
    const manager = (await env.repository.getOperation(blocked.activeOperationId!))!;
    expect(blocked).toMatchObject({ status: "blocked", safeFailure: "unknown_outcome" });
    expect(manager).toMatchObject({ role: "manager", taskId: null, subjectKind: "book", subjectId: blocked.bookletId,
      state: "unknown", reservationCount: 1 });
    const posts = vi.mocked(env.runtime.start).mock.calls.length;
    await env.dispatcher().advance(env.runId);
    expect(vi.mocked(env.runtime.start).mock.calls).toHaveLength(posts);
    expect(vi.mocked(env.runtime.retrieve).mock.calls.length).toBeGreaterThan(0);
    expect((await env.repository.getOperation(manager._id))?.resultJson).toContain('"taskId":"J11"');
    expect((await env.repository.getRun(env.runId))?.safeFailure).toBeNull();
    expect(await env.dispatcher().advance(env.runId)).toBe("advanced");
    expect(vi.mocked(env.runtime.start).mock.calls).toHaveLength(posts + 1);
  });
  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("dispatches %s through approved J11 and retains a J12 boundary", async (persona) => {
    const env = await setup(persona, 16);
    let reached = false;
    for (let step = 0; step < 100; step++) {
      const outcome = await env.dispatcher().advance(env.runId);
      expect(outcome).not.toBe("blocked");
      if (outcome === "boundary") { reached = true; break; }
    }
    expect(reached).toBe(true);
    const view = (await env.context.getRunView(env.runId))!;
    const layout = view.currentArtifacts.find((item) => item.taskId === "J11")!;
    const version = layout.versions.find((item) => item.id === layout.currentVersionId)!;
    const stored = parseStoredPageLayout(persona, version.content);
    expect(stored.pages).toHaveLength(persona === "playful_kid" ? 4 : persona === "enthusiast_parent" ? 6 : 9);
    expect(new Set(stored.pages.map((page) => page.pageId)).size).toBe(stored.pages.length);
    expect(version.approval?.origin).toBe(persona === "professional_creator" ? "explicit" : "delegated");
    expect(layout.state).toBe("approved");
    expect(view).toMatchObject({ status: "queued", nextNarrativeTask: "slice_complete", activeOperationId: null, counters: { payableText: 0, payableImage: 0 } });
    expect(await env.database.collections.booklets.findOne({ _id: view.bookletId })).toMatchObject({ currentStage: "J12" });
    const starts = vi.mocked(env.runtime.start).mock.calls.length;
    expect(await env.dispatcher().advance(env.runId)).toBe("boundary");
    expect(vi.mocked(env.runtime.start).mock.calls).toHaveLength(starts);
    expect((await createExperimentContextService(env.database).getRunView(env.runId))?.currentArtifacts.find((item) => item.taskId === "J11")?.currentVersionId).toBe(version.id);
  });
  it.each(["explicit", "delegated"] as const)("recovers an unknown tester sheet %s decision without replay", async (origin) => {
    const env = await setup("professional_creator", 15), view = await env.reachSheet("review");
    const versionId = view.nextSheetWork!.currentVersionId!, starts = vi.mocked(env.runtime.start).mock.calls.length;
    const before = (await env.repository.getRun(env.runId))!.counters;
    const result: RoleResult = origin === "explicit" ? { kind: "decision", payload: { decision: { action: "approve", versionIds: [versionId] } } } :
      { kind: "decision", payload: { decision: { action: "delegate", taskIds: ["J09", "J10"], subjectId: view.bookletId } } };
    const completed = await env.testerDecision(result, true);
    expect(completed.operation.state).toBe("succeeded");
    expect(await env.database.collections.approvals.countDocuments({ artifactVersionId: versionId })).toBe(1);
    expect((await env.repository.getRun(env.runId))!).toMatchObject({ status: "queued", activeOperationId: null, counters: { logicalText: before.logicalText + 1, logicalImage: before.logicalImage, payableText: 0, payableImage: 0 } });
    expect(vi.mocked(env.runtime.start).mock.calls).toHaveLength(starts);
  });
  it("honors a saved location-first manager delegation while characters remain missing", async () => {
    const env = await setup("playful_kid", 15);
    for (let step = 0; step < 80; step++) {
      const view = (await env.context.getRunView(env.runId))!;
      if (view.nextNarrativeTask === "J09") break;
      expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
    }
    const view = (await env.context.getRunView(env.runId))!, run = (await env.repository.getRun(env.runId))!;
    const source = view.currentArtifacts.find((item) => item.taskId === "J07")!;
    const content = source.versions.find((item) => item.id === source.currentVersionId)!.content as { locations: { locationId: string }[] };
    const subjectId = content.locations[0].locationId, operationId = randomUUID(), workflowRunId = randomUUID();
    const operation = await env.repository.prepareOperation({ runId: run._id, operationId, expectedRevision: run.revision, role: "manager", taskId: null,
      subjectKind: "book", subjectId: run.bookletId, providerKind: "text", attempt: 1, inputFingerprint: "e".repeat(64), nowMs: env.next() });
    await env.repository.claimOperation({ runId: run._id, operationId, workflowRunId, parentWorkflowRunId: null, nowMs: env.next() });
    await env.repository.completeOperation({ envelope: { runId: run._id, operationId, workflowRunId, inputFingerprint: operation.inputFingerprint,
      result: { kind: "delegate", payload: { taskId: "J10", subjectKind: "location", subjectId } } }, parentWorkflowRunId: null, nowMs: env.next() });
    await env.database.collections.experiment_operations.updateOne({ _id: operationId }, { $set: { verifiedWorkflowId: env.config.bindings.find((item) => item.role === "manager")!.publishedWorkflowId } });
    await env.dispatcher().advance(run._id);
    expect((await env.repository.listOperations(run._id)).at(-1)).toMatchObject({ role: "specialist", taskId: "J10", subjectId, parentWorkflowRunId: workflowRunId, state: "succeeded" });
  });
  it("keeps revision clarification and saved answers scoped to one character", async () => {
    const env = await setup("playful_kid", 15), view = await env.reachSheet("image");
    const target = view.nextSheetWork!.target, versionId = view.nextSheetWork!.currentVersionId!;
    await env.testerDecision({ kind: "decision", payload: { decision: { action: "revise", taskId: "J09", artifactVersionId: versionId, instruction: "Retain the same character; clarify expressions." } } });
    async function specialist(subjectId: string) {
      const run = (await env.repository.getRun(env.runId))!, operationId = randomUUID(), workflowRunId = randomUUID();
      const operation = await env.repository.prepareOperation({ runId: env.runId, operationId, expectedRevision: run.revision,
        role: "specialist", taskId: "J09", subjectKind: "character", subjectId, providerKind: "text", attempt: 1, inputFingerprint: randomUUID().replaceAll("-", "").repeat(2), nowMs: env.next() });
      const identity = { runId: env.runId, operationId, workflowRunId, parentWorkflowRunId: null };
      await env.repository.claimOperation({ ...identity, nowMs: env.next() });
      const savedContext = await env.context.getOperationContext(identity);
      return { operation, savedContext, complete: (result: RoleResult) => env.repository.completeOperation({
        envelope: { runId: env.runId, operationId, workflowRunId, inputFingerprint: operation.inputFingerprint, result }, parentWorkflowRunId: null, nowMs: env.next() }) };
    }
    const first = await specialist(target.subjectId);
    await first.complete({ kind: "clarification", payload: { question: "Which expressions should this character show?" } });
    await env.testerDecision({ kind: "decision", payload: { decision: { action: "answer", questionId: first.operation._id, text: "Curious, Concerned, Relieved" } } });
    const resumed = await specialist(target.subjectId);
    expect(resumed.savedContext).toMatchObject({ role: "specialist", subjectId: target.subjectId, matchingRevision: { artifactVersionId: versionId },
      questionAnswers: [{ questionId: first.operation._id, answer: "Curious, Concerned, Relieved" }] });
    expect((await env.repository.getRun(env.runId))?.textRevisions).toBe(1);
    await resumed.complete(simulateNarrativeResult(resumed.savedContext, "simulated"));
    const castVersion = (await env.database.collections.artifact_versions.findOne({ _id: target.sourceVersionIds[0] }))!;
    const otherId = (JSON.parse(castVersion.contentJson).characters as { characterId: string }[]).find((item) => item.characterId !== target.subjectId)!.characterId;
    const other = await specialist(otherId);
    expect(other.savedContext).toMatchObject({ role: "specialist", subjectId: otherId, currentTarget: null, matchingRevision: null, questionAnswers: [] });
  });
  it("rejects wrong sheet subjects and changed sources before saving a proposal", async () => {
    const env = await setup("playful_kid", 15), view = await env.reachSheet("image"), target = view.nextSheetWork!.target;
    const run = (await env.repository.getRun(env.runId))!;
    await expect(env.repository.prepareOperation({ runId: run._id, operationId: randomUUID(), expectedRevision: run.revision,
      role: "specialist", taskId: "J10", subjectKind: "character", subjectId: target.subjectId, providerKind: "text", attempt: 1, inputFingerprint: "c".repeat(64), nowMs: env.next() })).rejects.toMatchObject({ code: "invalid_input" });
    const cast = view.currentArtifacts.find((item) => item.taskId === "J06")!;
    await env.database.collections.artifacts.updateOne({ _id: cast.id }, { $set: { state: "needs_review" } });
    await expect(env.testerDecision({ kind: "decision", payload: { decision: { action: "approve", versionIds: [view.nextSheetWork!.currentVersionId!] } } })).rejects.toMatchObject({ code: "conflict" });
    expect(await env.database.collections.approvals.countDocuments({ artifactVersionId: view.nextSheetWork!.currentVersionId! })).toBe(0);
  });
  it("recovers a discarded sheet response and completes after an in-flight pause without replay", async () => {
    const env = await setup("enthusiast_parent", 15); await env.reachSheet("image"); env.faults({ lost: true, pause: true });
    await env.dispatcher().advance(env.runId);
    expect((await env.repository.getRun(env.runId))?.status).toBe("paused");
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(1);
    expect(await env.dispatcher().advance(env.runId)).toBe("waiting");
    await env.repository.resume({ runId: env.runId, expectedRevision: (await env.repository.getRun(env.runId))!.revision, nowMs: env.next() });
    env.faults({});
    for (let step = 0; step < 30; step++) if (await env.dispatcher().advance(env.runId) === "boundary") break;
    expect((await env.context.getRunView(env.runId))?.nextNarrativeTask).toBe("slice_complete");
    expect(vi.mocked(env.runtime.start).mock.calls.filter(([binding]) => binding.role === "image")).toHaveLength(5);
    expect((await env.repository.getRun(env.runId))?.counters).toMatchObject({ logicalImage: 5, payableImage: 0, payableText: 0 });
  });
  it("rejects retained legacy indexes before preparing or reserving a sheet specialist", async () => {
    const env = await setup("playful_kid", 15);
    await env.reachSamples();
    await env.database.collections.artifacts.createIndex({ bookletId: 1, artifactType: 1 }, { unique: true, name: "artifacts_booklet_type_unique" });
    for (let step = 0; step < 6; step++) {
      const view = (await env.context.getRunView(env.runId))!;
      if (view.nextNarrativeTask === "J09") break;
      expect(await env.dispatcher().advance(env.runId)).not.toBe("blocked");
    }
    const before = (await env.repository.getRun(env.runId))!;
    const character = (await env.database.collections.artifact_versions.findOne({ _id: (await env.context.getRunView(env.runId))!.currentArtifacts.find((item) => item.taskId === "J06")!.currentVersionId! }))!;
    const subjectId = JSON.parse(character.contentJson).characters[0].characterId as string;
    await expect(env.repository.prepareOperation({ runId: env.runId, operationId: randomUUID(), expectedRevision: before.revision,
      role: "specialist", taskId: "J09", subjectKind: "character", subjectId, providerKind: "text", attempt: 1, inputFingerprint: "b".repeat(64), nowMs: env.next() })).rejects.toMatchObject({ code: "invalid_state" });
    expect((await env.repository.getRun(env.runId))?.counters).toEqual(before.counters);
    expect(await env.database.collections.experiment_operations.countDocuments({ runId: env.runId, taskId: "J09" })).toBe(0);
  });
  it("does not explicitly approve an unassembled sheet draft", async () => {
    const env = await setup("professional_creator", 15), view = await env.reachSheet("image");
    const versionId = view.nextSheetWork!.currentVersionId!;
    await expect(env.testerDecision({ kind: "decision", payload: { decision: { action: "approve", versionIds: [versionId] } } })).rejects.toMatchObject({ code: "invalid_result" });
    expect(await env.database.collections.approvals.countDocuments({ artifactVersionId: versionId })).toBe(0);
  });
  it.each(["explicit", "delegated"] as const)("rejects corrupt sheet bytes during %s acceptance", async (origin) => {
    const env = await setup("professional_creator", 15), view = await env.reachSheet("review");
    const versionId = view.nextSheetWork!.currentVersionId!;
    const sheet = view.currentArtifacts.find((item) => item.currentVersionId === versionId)!;
    const build = (sheet.versions.find((item) => item.id === versionId)!.content as { build: { assetId: string } }).build;
    const asset = (await env.database.collections.assets.findOne({ _id: build.assetId }))!;
    env.store.files.set(asset.uri, new Uint8Array([1]));
    const decision: RoleResult = origin === "explicit" ? { kind: "decision", payload: { decision: { action: "approve", versionIds: [versionId] } } } :
      { kind: "decision", payload: { decision: { action: "delegate", taskIds: ["J09", "J10"], subjectId: view.bookletId } } };
    await expect(env.testerDecision(decision)).rejects.toMatchObject({ code: "invalid_state" });
    expect(await env.database.collections.approvals.countDocuments({ artifactVersionId: versionId })).toBe(0);
  });
  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("runs every reference subject from an empty %s run without seeded approvals", async (persona) => {
    const env = await setup(persona, 15);
    let outcome: string = "waiting";
    for (let step = 0; step < 110; step++) {
      outcome = await env.dispatcher().advance(env.runId);
      expect(outcome).not.toBe("blocked");
      if (outcome === "boundary") break;
    }
    expect(outcome).toBe("boundary");
    const view = (await env.context.getRunView(env.runId))!;
    const sheets = view.currentArtifacts.filter((item) => item.taskId === "J09" || item.taskId === "J10");
    const count = persona === "professional_creator" ? 4 : 3;
    expect(sheets).toHaveLength(count);
    expect(sheets.filter((item) => item.taskId === "J09")).toHaveLength(2);
    for (const sheet of sheets) {
      expect(sheet.state).toBe("approved");
      const assembled = sheet.versions.find((version) => version.id === sheet.currentVersionId)!;
      expect(assembled.approval?.origin).toBe(persona === "professional_creator" ? "explicit" : "delegated");
      const draft = sheet.versions.find((version) => version.id === assembled.sourceVersionId)!;
      expect(draft.approval).toBeNull();
      expect(assembled.dependencyVersionIds).toEqual([draft.id, ...(draft.dependencyVersionIds as string[])]);
      const proposal = await env.repository.getOperation(draft.sourceOperationId!);
      expect(proposal).toMatchObject({ role: "specialist", subjectKind: sheet.subjectKind, subjectId: sheet.subjectId, reservationCount: 1 });
      expect(proposal?.parentWorkflowRunId).toBeTruthy();
    }
    const images = (await env.repository.listOperations(env.runId)).filter((operation) => operation.role === "image");
    expect(images).toHaveLength(count + 2);
    expect(images.every((operation) => operation.state === "succeeded" && operation.verifiedWorkflowId && operation.parentWorkflowRunId)).toBe(true);
    expect(view.counters).toMatchObject({ logicalImage: count + 2, payableImage: 0, payableText: 0 });
    expect(env.store.files.size).toBe(count + 2);
    expect((await env.database.collections.booklets.findOne({ _id: view.bookletId }))?.currentStage).toBe("J11");
    const postCount = vi.mocked(env.runtime.start).mock.calls.length;
    expect(await env.dispatcher().advance(env.runId)).toBe("boundary");
    expect(env.runtime.start).toHaveBeenCalledTimes(postCount);
  });
  it.each([6, 11] as const)("preserves the retained %s-slot no-progress hash at count two", async (slots) => {
    const env = await setup("professional_creator", slots);
    for (let step = 0; step < 3; step++) await env.dispatcher().advance(env.runId);
    const current = (await env.database.collections.artifact_versions.findOne({ sourceOperationId: { $exists: true } }))!;
    expect(current).toBeTruthy();
    const historical = { ...current, _id: randomUUID(), versionNumber: 0 };
    delete historical.sourceOperationId;
    await env.database.collections.artifact_versions.insertOne(historical);
    const view = (await env.context.getRunView(env.runId))!;
    expect(view.currentArtifacts[0].versions).toHaveLength(2);
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
    const selectionReads = vi.spyOn(env.database.collections.experiment_operations, "find");
    const candidateReads = vi.spyOn(env.database.collections.experiment_operations, "findOne");
    await env.dispatcher().advance(env.runId);
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(1);
    for (let step = 0; step < 10; step++) if (await env.dispatcher().advance(env.runId) === "boundary") break;
    expect((await env.context.getRunView(env.runId))?.nextNarrativeTask).toBe("slice_complete");
    expect(vi.mocked(env.runtime.start).mock.calls.filter(([binding]) => binding.role === "image")).toHaveLength(2);
    expect((await env.repository.getRun(env.runId))?.counters.logicalImage).toBe(2);
    expect(selectionReads.mock.calls.some(([filter, options]) => "role" in filter && filter.role === "image" &&
      options?.projection?.attempt === 1 && !Object.hasOwn(options.projection, "imageRequestJson"))).toBe(true);
    expect(candidateReads.mock.calls.some(([filter, options]) => "state" in filter && filter.state === "succeeded" &&
      options?.projection?.imageRequestJson === 1 && !Object.hasOwn(options.projection, "m4Preparation"))).toBe(true);
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
  it("retains a claimed failed image execution for a late upload and verified GET acknowledgement", async () => {
    const env = await setup(); await env.reachSamples();
    env.faults({ omitUpload: true, acknowledgement: "failed" });
    await env.dispatcher().advance(env.runId);
    const run = (await env.repository.getRun(env.runId))!;
    const operation = (await env.repository.getOperation(run.activeOperationId!))!;
    expect(run).toMatchObject({ status: "blocked", safeFailure: "unknown_outcome", activeOperationId: operation._id });
    expect(operation).toMatchObject({ role: "image", state: "unknown", reservationCount: 1 });
    const originalRetrieve = env.runtime.retrieve;
    env.runtime.retrieve = vi.fn<WorkflowRuntime["retrieve"]>(async (binding, id) => {
      const result = await originalRetrieve(binding, id);
      return result.kind === "execution" ? { kind: "execution", execution: { ...result.execution,
        status: "failed", outputs: {} } } : result;
    });
    const postsBeforeRecovery = vi.mocked(env.runtime.start).mock.calls.length;
    expect(await env.dispatcher().advance(env.runId)).toBe("waiting");
    expect(vi.mocked(env.runtime.start).mock.calls).toHaveLength(postsBeforeRecovery);
    const bytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#74aadd" } }).png().toBuffer();
    const saved = await createExperimentImageStorage({ database: env.database, store: env.store, now: env.next }).complete({
      identity: { runId: env.runId, operationId: operation._id, workflowRunId: operation.workflowRunId!,
        parentWorkflowRunId: operation.parentWorkflowRunId, inputFingerprint: operation.inputFingerprint }, content: bytes,
    });
    env.runtime.retrieve = vi.fn<WorkflowRuntime["retrieve"]>(async (binding, id) => {
      const result = await originalRetrieve(binding, id);
      return result.kind === "execution" ? { kind: "execution", execution: { ...result.execution, status: "succeeded",
        outputs: { image_result: JSON.stringify({ runId: env.runId, operationId: operation._id,
          workflowRunId: operation.workflowRunId!, parentWorkflowRunId: operation.parentWorkflowRunId,
          inputFingerprint: operation.inputFingerprint, assetId: operation._id, sha256: saved.operation.resultDigest }) } } } : result;
    });
    expect((await env.repository.getRun(env.runId))?.safeFailure).toBeNull();
    env.faults({});
    env.elapse(5_000);
    await env.dispatcher().advance(env.runId);
    expect((await env.repository.getRun(env.runId))?.safeFailure).toBeNull();
    expect(await env.repository.getOperation(operation._id)).toMatchObject({ state: "succeeded",
      verifiedWorkflowId: env.config.bindings.find((binding) => binding.role === "image")!.publishedWorkflowId });
    expect((await env.repository.listOperations(env.runId)).filter((item) => item.role === "image" &&
      item.inputFingerprint === operation.inputFingerprint)).toHaveLength(1);
    expect(env.runtime.retrieve).toHaveBeenCalled();
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
    env.elapse(5_000);
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
