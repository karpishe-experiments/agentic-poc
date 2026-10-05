import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExperimentStyleAssembly } from "@/db/experiment-style";
import type { AssetStore } from "@/lib/assets/asset-store";
import type { Persona } from "@/lib/contracts/experiment-runner";
import { parseReferenceProposal } from "@/lib/contracts/experiment-references";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";
import { createExperimentImageStorage } from "@/lib/experiment-runner/image-storage";
import { BOOK_TASKS, NARRATIVE_TASKS, type NarrativeTask } from "@/lib/experiment-runner/narrative-tasks";
import { styleSampleRequests } from "@/lib/experiment-runner/reference-requests";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
class MemoryStore implements AssetStore {
  files = new Map<string, Uint8Array>();
  async put(uri: string, bytes: Uint8Array, mimeType: string) {
    this.files.set(uri, Uint8Array.from(bytes)); return { uri, mimeType, byteLength: bytes.byteLength };
  }
  async get(uri: string) { const bytes = this.files.get(uri); if (!bytes) throw new Error("missing"); return Uint8Array.from(bytes); }
  async exists(uri: string) { return this.files.has(uri); }
}
async function setup(persona: Persona, styleEnabled = true) {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const store = new MemoryStore();
  const repository = createExperimentRepository(database, { store: () => store }), context = createExperimentContextService(database);
  const runId = randomUUID(), bookletId = randomUUID();
  // Local source fixture, not a claim that these apps/keys are configured live.
  const configuration = (styleEnabled ? BOOK_TASKS : NARRATIVE_TASKS).map((taskId) => ({
    role: "specialist" as const, taskId, appId: randomUUID(), publishedWorkflowId: randomUUID(), toolProviderId: null,
  }));
  await repository.createRun({ runId, bookletId, persona, mode: "simulated", configuration, nowMs: 1 });
  let clock = 10;
  async function execute(role: "manager" | "specialist" | "tester", taskId: NarrativeTask | null, result?: unknown) {
    const operationId = randomUUID(), workflowRunId = randomUUID();
    const identity = { runId, operationId, workflowRunId, parentWorkflowRunId: null };
    await repository.prepareOperation({ runId, operationId, expectedRevision: (await repository.getRun(runId))!.revision,
      role, taskId, subjectKind: "book", subjectId: bookletId, inputFingerprint: "a".repeat(64), attempt: clock, providerKind: "text", nowMs: clock++ });
    await repository.claimOperation({ ...identity, nowMs: clock++ });
    const opContext = await context.getOperationContext(identity);
    const completed = await repository.completeOperation({ envelope: { runId, operationId, workflowRunId,
      inputFingerprint: "a".repeat(64), result: result ?? simulateNarrativeResult(opContext, "simulated") }, parentWorkflowRunId: null, nowMs: clock++ });
    return { ...completed, opContext };
  }
  async function approve(versionId: string) {
    return execute("tester", null, { kind: "decision", payload: { decision: { action: "approve", versionIds: [versionId] } } });
  }
  if (persona !== "professional_creator") await execute("tester", null);
  const versions: Partial<Record<NarrativeTask, string>> = {};
  for (const taskId of NARRATIVE_TASKS) {
    const saved = await execute("specialist", taskId);
    const versionId = JSON.parse(saved.operation.materializationJson!).versionId as string;
    versions[taskId] = versionId;
    if (persona === "professional_creator") await approve(versionId);
  }
  async function samples(draftStyleVersionId: string) {
    const draft = (await database.collections.artifact_versions.findOne({ _id: draftStyleVersionId }))!;
    const proposal = parseReferenceProposal("J08", "proposal", JSON.parse(draft.contentJson)).content;
    const requests = styleSampleRequests(proposal, { draftStyleVersionId, conceptVersionId: versions.J01!, outlineVersionId: versions.J02!,
      manuscriptVersionId: versions.J05!, finalCharactersVersionId: versions.J06!, finalLocationsVersionId: versions.J07! });
    const sampleOperationIds: string[] = [];
    for (const slot of requests) {
      const identity = { runId, operationId: randomUUID(), workflowRunId: randomUUID(), parentWorkflowRunId: null, inputFingerprint: imageRequestFingerprint(slot.request) };
      await repository.prepareOperation({ runId, operationId: identity.operationId, expectedRevision: (await repository.getRun(runId))!.revision,
        role: "image", taskId: "J08", subjectKind: "book", subjectId: bookletId, inputFingerprint: identity.inputFingerprint,
        attempt: 1, providerKind: "image", imageRequest: slot.request, nowMs: clock++ });
      await repository.claimOperation({ runId, operationId: identity.operationId, workflowRunId: identity.workflowRunId, parentWorkflowRunId: null, nowMs: clock++ });
      const bytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#74aadd" } }).png().toBuffer();
      await createExperimentImageStorage({ database, store, now: () => clock++ }).complete({ identity, content: bytes });
      sampleOperationIds.push(identity.operationId);
    }
    return createExperimentStyleAssembly({ database, store, now: () => clock++ }).assemble({ runId, draftStyleVersionId, sampleOperationIds });
  }
  return { database, repository, context, runId, bookletId, execute, approve, samples, versions, store };
}
describe("persisted style journey", () => {
  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("saves, assembles and accepts style for %s", async (persona) => {
    const env = await setup(persona);
    expect((await env.context.getRunView(env.runId))?.nextNarrativeTask).toBe("J08");
    const route = await env.execute("manager", null);
    expect(JSON.parse(route.operation.resultJson!)).toMatchObject({ kind: "delegate", payload: { taskId: "J08" } });
    const saved = await env.execute("specialist", "J08");
    const draftId = JSON.parse(saved.operation.materializationJson!).versionId as string;
    expect(await env.database.collections.approvals.countDocuments({ artifactVersionId: draftId })).toBe(0);
    expect((await env.context.getRunView(env.runId))?.nextNarrativeTask).toBe("style_samples");
    const assembled = await env.samples(draftId);
    expect((await env.context.getRunView(env.runId))?.nextNarrativeTask).toBe("tester");
    await env.execute("tester", null);
    expect(await env.database.collections.approvals.findOne({ artifactVersionId: assembled.version._id })).toMatchObject({
      origin: persona === "professional_creator" ? "explicit" : "delegated", testerDecisionId: expect.any(String),
    });
    expect(await env.database.collections.approvals.countDocuments({ artifactVersionId: draftId })).toBe(0);
    expect((await env.context.getRunView(env.runId))?.nextNarrativeTask).toBe("slice_complete");
    expect(await env.database.collections.booklets.findOne({ _id: env.bookletId })).toMatchObject({ currentStage: "J09" });
    expect((await env.repository.getRun(env.runId))?.counters).toMatchObject({ logicalImage: 2, payableImage: 0, payableText: 0 });
  });
  it("does not admit J08 in the retained seven-task profile", async () => {
    const env = await setup("professional_creator", false);
    expect((await env.context.getRunView(env.runId))?.nextNarrativeTask).toBe("slice_complete");
    await expect(env.execute("specialist", "J08")).rejects.toMatchObject({ code: "conflict" });
  });
  it("rejects explicit textual-draft acceptance and keeps sample work pending", async () => {
    const env = await setup("professional_creator");
    const saved = await env.execute("specialist", "J08");
    const draftId = JSON.parse(saved.operation.materializationJson!).versionId as string;
    await expect(env.approve(draftId)).rejects.toMatchObject({ code: "invalid_result" });
    expect(await env.database.collections.approvals.countDocuments({ artifactVersionId: draftId })).toBe(0);
  });
  it.each(["professional_creator", "playful_kid"] as const)("refuses %s assembled approval after sample evidence disappears", async (persona) => {
    const env = await setup(persona);
    const saved = await env.execute("specialist", "J08");
    const assembled = await env.samples(JSON.parse(saved.operation.materializationJson!).versionId as string);
    await env.database.collections.assets.deleteOne({ kind: "style_preview" });
    await expect(persona === "professional_creator" ? env.approve(assembled.version._id) : env.execute("tester", null)).rejects.toMatchObject({ code: "invalid_result" });
    expect(await env.database.collections.approvals.countDocuments({ artifactVersionId: assembled.version._id })).toBe(0);
  });
  it("revises accepted style into a new textual draft without approving or reusing its old images", async () => {
    const env = await setup("playful_kid");
    const saved = await env.execute("specialist", "J08");
    const assembled = await env.samples(JSON.parse(saved.operation.materializationJson!).versionId as string);
    await env.execute("tester", null);
    await env.execute("tester", null, { kind: "decision", payload: { decision: { action: "revise", taskId: "J08", artifactVersionId: assembled.version._id, instruction: "Keep the palette gentle and soften the line work." } } });
    const revised = await env.execute("specialist", "J08");
    const draftId = JSON.parse(revised.operation.materializationJson!).versionId as string;
    const draft = (await env.database.collections.artifact_versions.findOne({ _id: draftId }))!;
    expect(parseReferenceProposal("J08", "proposal", JSON.parse(draft.contentJson)).content.approvalQuestions).toContain("Revision request: Keep the palette gentle and soften the line work.");
    expect(draft.sourceVersionId).toBe(assembled.version._id);
    expect(await env.database.collections.approvals.countDocuments({ artifactVersionId: draftId })).toBe(0);
    expect(await env.database.collections.assets.countDocuments({ kind: "style_preview" })).toBe(2);
    expect((await env.context.getRunView(env.runId))?.nextNarrativeTask).toBe("style_samples");
    expect((await env.repository.getRun(env.runId))?.counters.logicalImage).toBe(2);
  });
  it.each([
    ["professional_creator", "missing"], ["professional_creator", "corrupt"],
    ["playful_kid", "missing"], ["playful_kid", "corrupt"],
  ] as const)("refuses %s acceptance when assembled sample bytes are %s", async (persona, fault) => {
    const env = await setup(persona);
    const saved = await env.execute("specialist", "J08");
    const assembled = await env.samples(JSON.parse(saved.operation.materializationJson!).versionId as string);
    const uri = env.store.files.keys().next().value!;
    if (fault === "missing") env.store.files.delete(uri);
    else env.store.files.get(uri)![0] ^= 1;
    await expect(persona === "professional_creator" ? env.approve(assembled.version._id) : env.execute("tester", null)).rejects.toMatchObject({ code: "invalid_result" });
    expect(await env.database.collections.approvals.countDocuments({ artifactVersionId: assembled.version._id })).toBe(0);
    expect(await env.database.collections.experiment_operations.countDocuments({ runId: env.runId, role: "image", state: "succeeded" })).toBe(2);
    expect((await env.repository.getRun(env.runId))?.counters.logicalImage).toBe(2);
  });
});
