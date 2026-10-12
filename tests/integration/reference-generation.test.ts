import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import type { AssetStore, StoredAsset } from "@/lib/assets/asset-store";
import { ArtifactService } from "@/lib/application/artifact-service";
import { BookletService } from "@/lib/application/booklet-service";
import { GenerationService } from "@/lib/application/generation-service";
import { ImageAgentRunService } from "@/lib/application/image-agent-run-service";
import { CandidateExecutionService } from "@/lib/application/candidate-execution-service";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import { genUICardSchema } from "@/lib/contracts/cards";


const databases: Database[] = [];

afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

async function eventually<T>(read: () => Promise<T | null>): Promise<T> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for image Agent Run materialization.");
}

class MemoryAssetStore implements AssetStore {
  private readonly values = new Map<string, Uint8Array>();
  async put(uri: string, content: Uint8Array, mimeType: string): Promise<StoredAsset> { this.values.set(uri, content); return { uri, mimeType, byteLength: content.byteLength }; }
  async get(uri: string): Promise<Uint8Array> { const value = this.values.get(uri); if (!value) throw new Error("missing asset"); return value; }
  async exists(uri: string): Promise<boolean> { return this.values.has(uri); }
}

describe("reference generation", () => {
  it("generates persisted canonical assets in order and updates only the Visual Bible version", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "Robin shares rainwater." });
    const artifacts = new ArtifactService({ database });
    await artifacts.revise(booklet.id, "audience_profile", { schemaVersion: SCHEMA_VERSION, ageBand: "6-8", interests: ["gardens"], readingNeeds: "Clear sentences", tone: "Warm", avoidList: [], knownFacts: ["garden"], openAssumptions: [] }, { createdBy: "agent" });
    let detail = await artifacts.get(booklet.id, "audience_profile");
    await artifacts.approve(booklet.id, "audience_profile", detail.currentVersion!.id);
    const robin = "00000000-0000-4000-8000-000000000711";
    const garden = "00000000-0000-4000-8000-000000000712";
    await artifacts.revise(booklet.id, "story_plan", { schemaVersion: SCHEMA_VERSION, premise: "Robin shares rainwater.", theme: "Care", characters: [{ entityId: robin, name: "Robin", narrativeRole: "hero", goal: "Share water", relationships: [], named: true, continuityRelevant: true, recurringVisualSubject: true }], settings: [{ entityId: garden, name: "Garden", narrativeRole: "setting", named: true, continuityRelevant: true, recurringVisualSubject: true }], storyArc: "Robin learns to share.", keyEvents: ["Robin finds water."], ending: "Everyone shares.", ageFitNotes: "Ages 6–8", continuityConstraints: ["Keep the garden calm."] }, { createdBy: "agent" });
    detail = await artifacts.get(booklet.id, "story_plan");
    await artifacts.approve(booklet.id, "story_plan", detail.currentVersion!.id);
    await artifacts.revise(booklet.id, "visual_style", { schemaVersion: SCHEMA_VERSION, styleId: "soft-watercolor", name: "Soft watercolor", rationale: "Warm", visualDirection: "Soft", palette: ["blue"], texture: "Paper", lighting: "Morning", styleReferenceAssetIds: ["00000000-0000-4000-8000-000000000001"] }, { createdBy: "agent" });
    detail = await artifacts.get(booklet.id, "visual_style");
    await artifacts.approve(booklet.id, "visual_style", detail.currentVersion!.id);
    await artifacts.revise(booklet.id, "visual_bible", { schemaVersion: SCHEMA_VERSION, characters: [{ entityId: robin, name: "Robin", visualDetails: ["Red chest"], continuityConstraints: ["Keep red chest."], referenceRequired: true, currentReferenceAssetId: null, revisionNumber: 1 }], locations: [{ entityId: garden, name: "Garden", visualDetails: ["Round pond"], continuityConstraints: ["Keep pond."], referenceRequired: true, currentReferenceAssetId: null, revisionNumber: 1 }], styleReferences: ["00000000-0000-4000-8000-000000000001"] }, { createdBy: "agent" });

    const assets = new MemoryAssetStore();
    const generation = new GenerationService({ database, artifacts, assets });
    const job = await generation.createReferenceJob(booklet.id);
    await generation.runReferenceJob(booklet.id, job.id);
    const items = await eventually(async () => {
      const current = await (await import("@/db/repositories")).createRepositories(database).jobs.getItems(job.id);
      return current.every((item) => item.status === "succeeded") ? current : null;
    });
    const bible = await eventually(async () => {
      const current = await artifacts.get(booklet.id, "visual_bible");
      const value = current.currentVersion?.content as { characters?: Array<{ currentReferenceAssetId: string | null }> } | undefined;
      return value?.characters?.[0]?.currentReferenceAssetId ? current : null;
    });
    const content = bible.currentVersion?.content as { characters: Array<{ currentReferenceAssetId: string | null }>; locations: Array<{ currentReferenceAssetId: string | null }> };

    expect(items.map((item) => item.status)).toEqual(["succeeded", "succeeded"]);
    expect(items.map((item) => (item.input as { request: { quality: string } }).request.quality)).toEqual(["disabled", "disabled"]);
    expect(content.characters[0]?.currentReferenceAssetId).toBeTruthy();
    expect(content.locations[0]?.currentReferenceAssetId).toBeTruthy();
    const selectedAsset = await (await import("@/db/repositories")).createRepositories(database).assets.get(content.characters[0]!.currentReferenceAssetId!);
    expect(selectedAsset?.metadata).toMatchObject({ candidate: true });
    const executionItem = await database.collections.execution_items.findOne({ candidateAssetId: selectedAsset!.id });
    expect(executionItem).toMatchObject({ status: "succeeded" });
    expect(await assets.exists(selectedAsset!.uri)).toBe(true);
    expect(bible.currentVersion?.versionNumber).toBe(2);
    await eventually(async () => await database.collections.execution_batches.countDocuments({ materializationContinuationPending: true }) === 0 ? true : null);
  });

  it("restarts a completed image run through a replacement job and promotes only the new selection", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "Mira finds a bright seed." });
    const artifacts = new ArtifactService({ database });
    const characterId = "00000000-0000-4000-8000-000000000741";
    const settingId = "00000000-0000-4000-8000-000000000744";
    await artifacts.revise(booklet.id, "audience_profile", { schemaVersion: SCHEMA_VERSION, ageBand: "6-8", interests: ["gardens"], readingNeeds: "Clear sentences", tone: "Warm", avoidList: [], knownFacts: ["garden"], openAssumptions: [] }, { createdBy: "agent" });
    await artifacts.revise(booklet.id, "story_plan", { schemaVersion: SCHEMA_VERSION, premise: "Mira finds a bright seed.", theme: "Care", characters: [{ entityId: characterId, name: "Mira", narrativeRole: "hero", goal: "Plant the seed", relationships: [], named: true, continuityRelevant: true, recurringVisualSubject: true }], settings: [{ entityId: settingId, name: "Garden", narrativeRole: "setting", named: true, continuityRelevant: true, recurringVisualSubject: true }], storyArc: "Mira tends a seed.", keyEvents: ["Mira finds the seed."], ending: "The seed grows.", ageFitNotes: "Ages 6–8", continuityConstraints: ["Keep the garden calm."] }, { createdBy: "agent" });
    await artifacts.revise(booklet.id, "visual_style", { schemaVersion: SCHEMA_VERSION, styleId: "soft-watercolor", name: "Soft watercolor", rationale: "Warm", visualDirection: "Soft", palette: ["blue"], texture: "Paper", lighting: "Morning", styleReferenceAssetIds: ["00000000-0000-4000-8000-000000000001"] }, { createdBy: "agent" });
    await artifacts.revise(booklet.id, "visual_bible", { schemaVersion: SCHEMA_VERSION, characters: [{ entityId: characterId, name: "Mira", visualDetails: ["Yellow raincoat"], continuityConstraints: ["Keep the raincoat yellow."], referenceRequired: true, currentReferenceAssetId: null, revisionNumber: 1 }], locations: [{ entityId: settingId, name: "Garden", visualDetails: ["Round pond"], continuityConstraints: ["Keep the pond calm."], referenceRequired: false, currentReferenceAssetId: null, revisionNumber: 1 }], styleReferences: [] }, { createdBy: "agent" });
    const assets = new MemoryAssetStore();
    const repositories = (await import("@/db/repositories")).createRepositories(database);
    const generation = new GenerationService({ database, repositories, artifacts, assets });
    const firstJob = await generation.createReferenceJob(booklet.id);
    await generation.runReferenceJob(booklet.id, firstJob.id);
    const firstBible = await eventually(async () => {
      const current = await artifacts.get(booklet.id, "visual_bible");
      const assetId = (current.currentVersion?.content as { characters?: Array<{ currentReferenceAssetId: string | null }> } | undefined)?.characters?.[0]?.currentReferenceAssetId;
      return assetId ? { current, assetId } : null;
    });
    const completedCard = await eventually(async () => {
      const rows = await database.collections.cards.find({ bookletId: booklet.id, family: "agent_run" }).toArray();
      const row = rows.find((candidate) => JSON.parse(candidate.cardJson).payload?.state === "completed");
      return row ?? null;
    });
    const imageRuns = new ImageAgentRunService({ database, repositories, assets, runtimeMode: "fake", onMaterialized: async (ready) => { if (ready.target === "reference") await generation.runReferenceJob(booklet.id, ready.jobId); else await generation.runPageJob(booklet.id, ready.jobId); } });
    await imageRuns.restart(booklet.id, completedCard._id, { cardId: completedCard._id, responseId: "00000000-0000-4000-8000-000000000742", action: "restart_with_agents" });
    const restartCard = await eventually(async () => {
      const parsed = genUICardSchema.safeParse(await repositories.conversation.getActiveCard(booklet.id));
      return parsed.success && parsed.data.family === "agent_run" ? parsed.data : null;
    });
    if (restartCard.family !== "agent_run") throw new Error("Expected restart Agent Run card.");
    // The replacement pool has one compatible agent, so restart starts it without another card response.
    const replacementBatch = await eventually(async () => {
      const batch = await database.collections.execution_batches.find({ cardId: restartCard.cardId }).next();
      const card = await repositories.conversation.getCard(booklet.id, restartCard.cardId);
      return batch && card?.family === "agent_run" &&
        (card.payload.state === "completed" || (card.payload.state === "results" && card.allowedActions.includes("select_agent_result")))
        ? { ...batch, needsSelection: card.payload.state === "results" } : null;
    });

    if (replacementBatch.needsSelection) {
      const selected = (await repositories.execution.getItems(replacementBatch._id)).find((item) => item.status === "succeeded");
      if (!selected) throw new Error("Expected a successful restart candidate.");
      await imageRuns.select(booklet.id, restartCard.cardId, { cardId: restartCard.cardId, responseId: "00000000-0000-4000-8000-000000000745", action: "select_agent_result", value: selected.id });
    }
    await eventually(async () => (await database.collections.execution_batches.findOne({ _id: replacementBatch._id }))?.status === "completed" ? true : null);
    const replacementBible = await eventually(async () => {
      const current = await artifacts.get(booklet.id, "visual_bible");
      const assetId = (current.currentVersion?.content as { characters?: Array<{ currentReferenceAssetId: string | null }> } | undefined)?.characters?.[0]?.currentReferenceAssetId;
      return assetId && assetId !== firstBible.assetId ? { current, assetId } : null;
    });
    expect(replacementBible.current.currentVersion?.versionNumber).toBeGreaterThan(firstBible.current.currentVersion?.versionNumber ?? 0);
    expect(await database.collections.generation_jobs.countDocuments({ bookletId: booklet.id, jobType: "references", status: "succeeded" })).toBe(2);

    // A crash before the old batch acknowledgement must not let its saved
    // continuation replace the newer restart result on a later recovery.
    const firstBatch = await database.collections.execution_batches.findOne({ cardId: completedCard._id });
    if (!firstBatch?.selectedItemId) throw new Error("Expected the first selected image candidate.");
    await database.collections.execution_batches.updateOne({ _id: firstBatch._id }, { $set: { materializationContinuationPending: true } });
    const execute = vi.spyOn(CandidateExecutionService.prototype, "executeImage");
    execute.mockClear();
    const staleRecovery = await repositories.execution.recoverInterrupted(Date.now());
    expect(staleRecovery).toContain(firstBatch._id);
    await imageRuns.recoverInterrupted(staleRecovery);
    const afterStaleRecovery = await artifacts.get(booklet.id, "visual_bible");
    expect((afterStaleRecovery.currentVersion?.content as { characters?: Array<{ currentReferenceAssetId: string | null }> } | undefined)?.characters?.[0]?.currentReferenceAssetId).toBe(replacementBible.assetId);
    expect((await database.collections.execution_batches.findOne({ _id: firstBatch._id }))?.materializationContinuationPending).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("retains the exact saved image selection after interrupted explicit materialization and rejects a mismatched replacement", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "A rabbit finds a painted pebble." });
    const repositories = (await import("@/db/repositories")).createRepositories(database);
    const assets = new MemoryAssetStore();
    const sourceAgent = await database.collections.agent_versions.findOne({ _id: "00000000-0000-4000-8000-00000000b201" });
    if (!sourceAgent) throw new Error("Expected seeded reference image agent.");
    const alternateAgentId = "00000000-0000-4000-8000-000000000761";
    await database.collections.agent_definitions.insertOne({ _id: alternateAgentId, createdAtMs: Date.now(), createdBy: "test" });
    await database.collections.agent_versions.insertOne({ ...sourceAgent, _id: "00000000-0000-4000-8000-000000000762", agentId: alternateAgentId, displayName: "Alternate Reference Image Agent", createdAtMs: Date.now(), updatedAtMs: Date.now(), createdBy: "test", updatedBy: "test" });
    const jobId = "00000000-0000-4000-8000-000000000763";
    const itemId = "00000000-0000-4000-8000-000000000764";
    const request = { schemaVersion: "1" as const, operation: "generate" as const, model: "fake-image", prompt: "A friendly rabbit with a painted pebble.", promptPlan: { purpose: "reference", subject: "rabbit", action: "holds a pebble", location: "garden", visualStyle: "watercolor", continuityConstraints: [], preserve: [] }, geometry: "square_1_1" as const, quality: "low" as const, references: [], editTargetAssetId: null };
    await repositories.jobs.createOrGet({ id: jobId, bookletId: booklet.id, jobType: "references", idempotencyKey: `interrupted-selection:${booklet.id}`, input: {}, items: [{ id: itemId, itemKey: "character:rabbit", position: 0, input: { item: { entityId: "00000000-0000-4000-8000-000000000765", kind: "character", name: "Rabbit", visualDetails: ["blue scarf"], continuityConstraints: ["keep the scarf blue"], referenceRequired: true }, request } }], createdAtMs: Date.now() });
    const claimed = await repositories.jobs.claimNextPending(jobId, Date.now());
    if (!claimed) throw new Error("Expected claimed reference item.");
    let continuationCount = 0;
    const agentRuns = new ImageAgentRunService({ database, repositories, assets, runtimeMode: "fake", onMaterialized: async () => { continuationCount += 1; } });
    const cardId = await agentRuns.createReady({ bookletId: booklet.id, jobId, itemId: claimed.id, itemKey: claimed.itemKey, position: claimed.position, target: "reference", subjectLabel: "Rabbit", request });
    const ready = await repositories.conversation.getCard(booklet.id, cardId);
    if (!ready || ready.family !== "agent_run") throw new Error("Expected two-candidate image Agent Run card.");
    expect(ready.payload.candidates).toHaveLength(2);
    await agentRuns.start(booklet.id, cardId, { cardId, responseId: "00000000-0000-4000-8000-000000000766", action: "run_agents", value: ready.payload.candidates.map((candidate) => candidate.agentId) });
    const batch = await eventually(async () => (await database.collections.execution_batches.findOne({ cardId, status: "results" })) ?? null);
    const candidates = await repositories.execution.getItems(batch._id);
    const [savedCandidate, otherCandidate] = candidates.filter((candidate) => candidate.status === "succeeded");
    if (!savedCandidate?.candidateAssetId || !otherCandidate?.candidateAssetId) throw new Error("Expected two saved image candidates.");
    await database.collections.generation_items.updateOne({ _id: itemId, jobId }, { $set: { status: "running" } });
    await repositories.jobs.completeItem({ jobId, itemId, primaryAssetId: savedCandidate.candidateAssetId, assets: [], result: { sourceAssetId: savedCandidate.candidateAssetId, request, provider: "fake", model: "fake-image", usage: null, executionBatchId: batch._id }, finishedAtMs: Date.now() });
    const execute = vi.spyOn(CandidateExecutionService.prototype, "executeImage");
    execute.mockClear();
    await expect(agentRuns.select(booklet.id, cardId, { cardId, responseId: "00000000-0000-4000-8000-000000000767", action: "select_agent_result", value: otherCandidate.id })).rejects.toThrow("Saved generation output does not match the selected image candidate.");
    expect((await repositories.jobs.getItems(jobId))[0]).toMatchObject({ status: "succeeded", assetId: savedCandidate.candidateAssetId, result: { sourceAssetId: savedCandidate.candidateAssetId, executionBatchId: batch._id } });
    expect(await repositories.execution.getBatch(batch._id)).toMatchObject({ status: "results", selectedItemId: null, selectionMode: null });
    const resultsCard = await repositories.conversation.getCard(booklet.id, cardId);
    if (!resultsCard || resultsCard.family !== "agent_run") throw new Error("Expected results card after mismatch rejection.");
    const selectedResponseId = "00000000-0000-4000-8000-000000000768";
    await agentRuns.select(booklet.id, cardId, { cardId, responseId: selectedResponseId, action: "select_agent_result", value: savedCandidate.id });
    await eventually(async () => (await repositories.execution.getBatch(batch._id))?.status === "completed" ? true : null);
    const completedCard = await repositories.conversation.getCard(booklet.id, cardId);
    if (!completedCard || completedCard.family !== "agent_run") throw new Error("Expected completed image Agent Run card.");
    await database.collections.cards.updateOne({ _id: cardId, bookletId: booklet.id }, { $set: { status: "active", cardJson: JSON.stringify({ ...completedCard, status: "active", allowedActions: [], payload: { ...completedCard.payload, state: "running", selectedItemId: null, selectionMode: null } }), updatedAtMs: Date.now() } });
    await database.collections.execution_batches.updateOne({ _id: batch._id }, { $set: { status: "materializing", materializationStatus: "running", materializationContinuationPending: false, selectedItemId: savedCandidate.id, selectionMode: "explicit", selectionResponseId: selectedResponseId, completedAtMs: null, updatedAtMs: Date.now() } });
    const firstRecovery = await repositories.execution.recoverInterrupted(Date.now());
    expect(firstRecovery).toContain(batch._id);
    await agentRuns.recoverInterrupted(firstRecovery);
    expect(await repositories.execution.getBatch(batch._id)).toMatchObject({ status: "completed", materializationStatus: "completed", selectedItemId: savedCandidate.id, selectionMode: "explicit", selectionResponseId: selectedResponseId, materializationContinuationPending: true });
    expect(await repositories.conversation.getCard(booklet.id, cardId)).toMatchObject({ family: "agent_run", allowedActions: ["restart_with_agents"], payload: { state: "completed", selectedItemId: savedCandidate.id, selectionMode: "explicit" } });
    expect((await repositories.jobs.getItems(jobId))[0]).toMatchObject({ status: "succeeded", assetId: savedCandidate.candidateAssetId, result: { sourceAssetId: savedCandidate.candidateAssetId, executionBatchId: batch._id } });
    expect(continuationCount).toBe(1);
    const secondRecovery = await repositories.execution.recoverInterrupted(Date.now());
    expect(secondRecovery).toContain(batch._id);
    await agentRuns.recoverInterrupted(secondRecovery);
    expect(await repositories.execution.getBatch(batch._id)).toMatchObject({ status: "completed", selectedItemId: savedCandidate.id, materializationContinuationPending: true });
    expect((await repositories.jobs.getItems(jobId))[0]?.assetId).toBe(savedCandidate.candidateAssetId);
    expect(continuationCount).toBe(2);
    expect(execute).not.toHaveBeenCalled();
  });

  it("composes only the selected page candidate into the generation item", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "A child discovers a garden book." });
    const repositories = (await import("@/db/repositories")).createRepositories(database);
    const assets = new MemoryAssetStore();
    const generation = new GenerationService({ database, repositories, assets });
    const jobId = "00000000-0000-4000-8000-000000000751";
    const itemId = "00000000-0000-4000-8000-000000000752";
    const page = { schemaVersion: "1", pageId: "00000000-0000-4000-8000-000000000753", pageIndex: 0, kind: "cover", sceneAction: "A child opens a bright book.", characterIds: [], locationIds: [], incidentalVisualDetails: [], compositionIntent: "Keep the title clear.", continuityNotes: [], readerText: "A bright adventure begins.", lettering: [{ kind: "title", text: "A bright adventure begins.", speakerEntityId: null, delivery: "clear", placementHint: "top" }], relevantReferenceIds: [], textSafeRegion: { x: 0.1, y: 0.72, width: 0.8, height: 0.2 } };
    const request = { schemaVersion: "1" as const, operation: "generate" as const, model: "fake-image", prompt: "A bright book in a garden.", promptPlan: { purpose: "cover", subject: "child", action: "opens a book", location: "garden", visualStyle: "watercolor", continuityConstraints: [], preserve: [] }, geometry: "square_1_1" as const, quality: "low" as const, references: [], editTargetAssetId: null };
    await repositories.jobs.createOrGet({ id: jobId, bookletId: booklet.id, jobType: "pages", idempotencyKey: `page-agent-run:${booklet.id}`, input: {}, items: [{ id: itemId, itemKey: "page:cover", position: 0, input: { page, geometry: "square_1_1", request } }], createdAtMs: Date.now() });
    const claimed = await repositories.jobs.claimNextPending(jobId, Date.now());
    let resumedJobId: string | null = null;
    const agentRuns = new ImageAgentRunService({ database, repositories, assets, runtimeMode: "fake", onMaterialized: async (ready) => {
      resumedJobId = ready.jobId;
      if (ready.target === "reference") await generation.runReferenceJob(booklet.id, ready.jobId);
      else await generation.runPageJob(booklet.id, ready.jobId);
    } });
    await agentRuns.createReady({ bookletId: booklet.id, jobId, itemId: claimed!.id, itemKey: claimed!.itemKey, position: claimed!.position, target: "page", subjectLabel: "the cover", request, page });
    const completed = await eventually(async () => { const items = await repositories.jobs.getItems(jobId); return items[0]?.status === "succeeded" ? items[0] : null; });
    expect(completed.assetId).toBeTruthy();
    const result = completed.result as { sourceAssetId: string; composedAssetId: string; executionBatchId: string };
    expect(result).toMatchObject({ sourceAssetId: expect.any(String), composedAssetId: completed.assetId, executionBatchId: expect.any(String) });
    const composed = await repositories.assets.get(completed.assetId!);
    expect(composed).toMatchObject({ kind: "page_composed", sourceAssetId: result.sourceAssetId });
    expect(await assets.exists(composed!.uri)).toBe(true);
    // Job-item success precedes batch completion and its callback. Let the original
    // materialization finish before simulating interruption, or it can overwrite
    // the injected state and leave nothing for recovery to claim.
    await eventually(async () => {
      const batch = await repositories.execution.getBatch(result.executionBatchId);
      return batch?.status === "completed" && resumedJobId === jobId ? true : null;
    });
    resumedJobId = null;
    const interruptedItem = await database.collections.generation_items.findOne({ _id: itemId, jobId });
    if (!interruptedItem?.executionCardId) throw new Error("Expected the saved image Agent Run card.");
    const interruptedCard = await repositories.conversation.getCard(booklet.id, interruptedItem.executionCardId);
    if (!interruptedCard || interruptedCard.family !== "agent_run") throw new Error("Expected the saved image Agent Run card.");
    await database.collections.execution_batches.updateOne({ _id: result.executionBatchId }, { $set: { status: "materializing", materializationStatus: "running", completedAtMs: null, updatedAtMs: Date.now() } });
    const historicalRecovery = await repositories.execution.recoverInterrupted(Date.now());
    expect(historicalRecovery).toContain(result.executionBatchId);
    expect(await repositories.execution.getBatch(result.executionBatchId)).toMatchObject({ status: "completed", materializationStatus: "completed" });
    expect((await database.collections.execution_batches.findOne({ _id: result.executionBatchId }))?.materializationContinuationPending).toBe(true);
    // A fresh recovery process must rediscover the durable continuation. It
    // cannot rely on the first process's in-memory recovery list.
    const freshHistoricalRecovery = await repositories.execution.recoverInterrupted(Date.now());
    expect(freshHistoricalRecovery).toContain(result.executionBatchId);
    expect(await agentRuns.recoverInterrupted(freshHistoricalRecovery)).toContain(result.executionBatchId);
    await eventually(async () => resumedJobId === jobId ? true : null);
    // This reduced fixture has no Page Plan to finalize. The callback cannot
    // clear durable continuation state merely because it ran.
    expect((await database.collections.execution_batches.findOne({ _id: result.executionBatchId }))?.materializationContinuationPending).toBe(true);
    resumedJobId = null;
    await database.collections.cards.updateOne({ _id: interruptedItem.executionCardId, bookletId: booklet.id }, { $set: { cardJson: JSON.stringify({ ...interruptedCard, status: "active", allowedActions: [], payload: { ...interruptedCard.payload, state: "running", batchId: result.executionBatchId, selectedItemId: null, selectionMode: null } }), status: "active", updatedAtMs: Date.now() } });
    await database.collections.execution_batches.updateOne({ _id: result.executionBatchId }, { $set: { status: "materializing", materializationStatus: "running", selectedItemId: (await repositories.execution.getItems(result.executionBatchId))[0]!.id } });
    expect(await agentRuns.recoverInterrupted()).toContain(result.executionBatchId);
    await eventually(async () => (await repositories.execution.getBatch(result.executionBatchId))?.status === "completed" && resumedJobId === jobId ? true : null);
    expect((await repositories.jobs.getItems(jobId))[0]?.assetId).toBe(completed.assetId);

    // Startup reconciles legacy jobs before image recovery. A saved terminal
    // candidate must reopen only its exact current item for materialization;
    // it must not start another image request.
    const savedItem = await database.collections.generation_items.findOne({ _id: itemId, jobId });
    if (!savedItem?.executionCardId) throw new Error("Expected the saved image Agent Run card.");
    const savedCard = await repositories.conversation.getCard(booklet.id, savedItem.executionCardId);
    if (!savedCard || savedCard.family !== "agent_run") throw new Error("Expected the saved image Agent Run card.");
    const runningCard = { ...savedCard, status: "active" as const, allowedActions: [], payload: { ...savedCard.payload, state: "running" as const, batchId: result.executionBatchId, selectedItemId: null, selectionMode: null } };
    await database.collections.cards.updateOne({ _id: savedItem.executionCardId, bookletId: booklet.id }, { $set: { cardJson: JSON.stringify(runningCard), status: "active", updatedAtMs: Date.now() } });
    await database.collections.execution_batches.updateOne({ _id: result.executionBatchId }, { $set: { status: "materializing", materializationStatus: "running", selectedItemId: (await repositories.execution.getItems(result.executionBatchId))[0]!.id, completedAtMs: null, updatedAtMs: Date.now() } });
    await database.collections.generation_items.updateOne({ _id: itemId, jobId }, { $set: { status: "running", executionBatchId: result.executionBatchId, finishedAtMs: null } });
    await database.collections.generation_jobs.updateOne({ _id: jobId }, { $set: { status: "running", finishedAtMs: null, updatedAtMs: Date.now() } });
    const execute = vi.spyOn(CandidateExecutionService.prototype, "executeImage");
    execute.mockClear();
    const recoveredBatchIds = await repositories.execution.recoverInterrupted(Date.now());
    expect(recoveredBatchIds).toContain(result.executionBatchId);
    expect(await repositories.jobs.recoverInterrupted()).toBe(0);
    expect(await database.collections.generation_items.findOne({ _id: itemId, jobId })).toMatchObject({ status: "waiting_for_selection", executionBatchId: result.executionBatchId });
    expect(await agentRuns.recoverInterrupted(recoveredBatchIds)).toContain(result.executionBatchId);
    await eventually(async () => (await repositories.execution.getBatch(result.executionBatchId))?.status === "completed" && (await repositories.jobs.getItems(jobId))[0]?.status === "succeeded" ? true : null);
    expect(execute).not.toHaveBeenCalled();
  });});
