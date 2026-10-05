import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { MongoServerError } from "mongodb";
import { withMongoTransaction, type Database } from "@/db/client";
import { verifyCurrentPageBibleSources, verifyCurrentPaginationSources } from "@/db/experiment-pages";
import { createExperimentRepository } from "@/db/experiment-repository";
import type { AssetStore } from "@/lib/assets/asset-store";
import type { Persona, RoleResult } from "@/lib/contracts/experiment-runner";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import { configurationSnapshot, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";
import { createExperimentImageStorage } from "@/lib/experiment-runner/image-storage";
import { BOOK_TASKS } from "@/lib/experiment-runner/narrative-tasks";
import { parseStoredPageLayout } from "@/lib/contracts/experiment-pages";
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
async function setup(persona: Persona = "playful_kid", slots: 6 | 11 | 13 | 15 | 16 | 17 = 13) {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const store = new MemoryStore(), repository = createExperimentRepository(database, { store: () => store });
  const context = createExperimentContextService(database);
  const bindings: BookletRunnerConfig["bindings"] = [
    { role: "manager", taskId: null, persona: null },
    ...BOOK_TASKS.map((taskId) => ({ role: "specialist" as const, taskId, persona: null })),
    ...(["J09", "J10"] as const).map((taskId) => ({ role: "specialist" as const, taskId, persona: null })),
    ...(slots >= 16 ? [{ role: "specialist" as const, taskId: "J11" as const, persona: null }] : []),
    ...(slots === 17 ? [{ role: "specialist" as const, taskId: "J12" as const, persona: null }] : []),
    ...(["playful_kid", "enthusiast_parent", "professional_creator"] as const).map((persona) => ({ role: "tester" as const, taskId: null, persona })),
    { role: "image", taskId: null, persona: null },
  ].filter((item) => slots >= 15 || (item.taskId !== "J09" && item.taskId !== "J10" && (slots === 13 || (item.role !== "image" && item.taskId !== "J08" &&
    (slots === 11 || item.taskId === null || ["J01", "J02"].includes(item.taskId))))))
    .map((item) => ({ ...item, appId: randomUUID(), publishedWorkflowId: randomUUID(), toolProviderId: null, apiKey: "test-key" })) as BookletRunnerConfig["bindings"];
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.test", publicOrigin: "https://booklet.test", callbackKey: "test-callback", bindings };
  const runId = randomUUID(), bookletId = randomUUID(); let clock = 1;
  await repository.createRun({ runId, bookletId, persona, mode: "simulated", configuration: configurationSnapshot(config, persona), nowMs: clock++ });
  const saved = new Map<string, RuntimeExecution>();
  let lostImageResponse = false, pauseImage = false, pauseBeforeClaim = false, omitImageUpload = false, wrongImageDigest = false;
  let lostPaginationResponse = false, lostManagerPaginationResponse = false, lostPageBibleResponse = false;
  let paginationTerminal: "failed" | "stopped" | null = null;
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
        const lostManager = binding.role === "manager" && lostManagerPaginationResponse &&
          result.kind === "delegate" && result.payload.taskId === "J11";
        if (!(binding.taskId === "J11" && (lostPaginationResponse || paginationTerminal)) &&
            !(binding.taskId === "J12" && lostPageBibleResponse) && !lostManager) {
          await repository.completeOperation({ envelope: { runId, operationId: operation._id, workflowRunId, inputFingerprint: operation.inputFingerprint, result },
            parentWorkflowRunId: input.parentWorkflowRunId, nowMs: clock++ });
        }
        outputs = binding.taskId === "J11" && paginationTerminal ? {} : { booklet_result: JSON.stringify(envelope) };
      }
      const execution: RuntimeExecution = { id: workflowRunId, workflow_id: binding.publishedWorkflowId,
        status: binding.taskId === "J11" && paginationTerminal ? paginationTerminal : "succeeded", outputs };
      saved.set(workflowRunId, execution);
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
  const dispatcher = () => createExperimentDispatcher({ database, config, runtime, store: () => store, mutate: async (fn) => fn(), now: () => clock++ });
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
  async function testerDecision(result: RoleResult, recover = false, dispatched = false) {
    const run = (await repository.getRun(runId))!, operationId = randomUUID(), workflowRunId = randomUUID();
    const operation = await repository.prepareOperation({ runId, operationId, expectedRevision: run.revision, role: "tester", taskId: null,
      subjectKind: "book", subjectId: run.bookletId, providerKind: "text", attempt: 1, inputFingerprint: randomUUID().replaceAll("-", "").repeat(2), nowMs: clock++ });
    if (recover || dispatched) await repository.beginDispatch({ runId, operationId, parentWorkflowRunId: null, nowMs: clock++ });
    await repository.claimOperation({ runId, operationId, workflowRunId, parentWorkflowRunId: null, nowMs: clock++ });
    if (recover) await repository.recordDispatchOutcome({ runId, operationId, parentWorkflowRunId: null, category: "unknown_outcome", nowMs: clock++ });
    return repository.completeOperation({ envelope: { runId, operationId, workflowRunId, inputFingerprint: operation.inputFingerprint, result }, parentWorkflowRunId: null, nowMs: clock++ });
  }
  return { database, repository, context, config, runId, store, runtime, dispatcher, reachSamples, reachSheet, reachPagination, testerDecision,
    faults: (value: { lost?: boolean; lostPagination?: boolean; lostManagerPagination?: boolean; lostPageBible?: boolean; paginationTerminal?: "failed" | "stopped"; pause?: boolean; beforeClaim?: boolean; omitUpload?: boolean; wrongDigest?: boolean; acknowledgement?: typeof acknowledgement }) => {
      lostImageResponse = value.lost ?? false; pauseImage = value.pause ?? false;
      lostPaginationResponse = value.lostPagination ?? false;
      lostManagerPaginationResponse = value.lostManagerPagination ?? false;
      lostPageBibleResponse = value.lostPageBible ?? false;
      paginationTerminal = value.paginationTerminal ?? null;
      omitImageUpload = value.omitUpload ?? false; wrongImageDigest = value.wrongDigest ?? false;
      pauseBeforeClaim = value.beforeClaim ?? false; acknowledgement = value.acknowledgement ?? "normal";
    }, next: () => clock++ };
}
describe("automatic saved J08 sample dispatch", () => {
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
    for (const page of env.layout.pages) {
      const result = await env.produce(page.pageIndex);
      expect(result.completed.reused).toBe(false);
    }
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
    expect((await env.repository.getRun(env.runId))?.safeFailure).toBeNull();
    env.faults({});
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
    const env = await setup(origin === "explicit" ? "professional_creator" : "playful_kid", 15), view = await env.reachSheet("review");
    const versionId = view.nextSheetWork!.currentVersionId!, starts = vi.mocked(env.runtime.start).mock.calls.length;
    const before = (await env.repository.getRun(env.runId))!.counters;
    const result: RoleResult = origin === "explicit" ? { kind: "decision", payload: { decision: { action: "approve", versionIds: [versionId] } } } :
      { kind: "decision", payload: { decision: { action: "delegate", taskIds: view.activeDelegation!.taskIds, subjectId: view.bookletId } } };
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
    const env = await setup(origin === "explicit" ? "professional_creator" : "playful_kid", 15), view = await env.reachSheet("review");
    const versionId = view.nextSheetWork!.currentVersionId!;
    const sheet = view.currentArtifacts.find((item) => item.currentVersionId === versionId)!;
    const build = (sheet.versions.find((item) => item.id === versionId)!.content as { build: { assetId: string } }).build;
    const asset = (await env.database.collections.assets.findOne({ _id: build.assetId }))!;
    env.store.files.set(asset.uri, new Uint8Array([1]));
    const decision: RoleResult = origin === "explicit" ? { kind: "decision", payload: { decision: { action: "approve", versionIds: [versionId] } } } :
      { kind: "decision", payload: { decision: { action: "delegate", taskIds: view.activeDelegation!.taskIds, subjectId: view.bookletId } } };
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
