import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { BookletService } from "@/lib/application/booklet-service";
import { CardService } from "@/lib/application/card-service";
import { ChatService } from "@/lib/application/chat-service";
import { createRepositories } from "@/db/repositories";
import { CandidatePoolService } from "@/lib/application/candidate-pool-service";
import { ExecutionService } from "@/lib/application/execution-service";
import { AgentRunService } from "@/lib/application/agent-run-service";
import { CandidateExecutionService } from "@/lib/application/candidate-execution-service";
import { genUICardSchema } from "@/lib/contracts/cards";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

async function eventually<T>(read: () => Promise<T | null>): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for persisted agent execution.");
}

describe("parallel agent execution", () => {
  it("persists a ready card, runs the sole candidate, and materializes the selected result", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const booklets = new BookletService({ database });
    const cards = new CardService({ database });
    const chat = new ChatService({ database });
    const booklet = await booklets.create({ idea: "A robin shares rainwater in a bright garden." });
    const turn = await chat.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000811", role: "user", parts: [{ type: "text", text: "The audience is ages 6-8." }] });
    const part = turn.assistantMessage.parts.find((candidate) => candidate.type === "data-card");
    if (!part || part.type !== "data-card" || part.data.family !== "agent_run") throw new Error("Expected an Agent Run card.");
    expect(part.data.payload.state).toBe("ready");
    expect(part.data.payload.candidates).toHaveLength(1);
    const response = await cards.submit(booklet.id, { cardId: part.data.cardId, responseId: "00000000-0000-4000-8000-000000000812", action: "run_agents", value: part.data.payload.selectedAgentIds });
    expect(response).toMatchObject({ followupRequired: false, refreshRequired: true });
    const repositories = createRepositories(database);
    const completed = await eventually(async () => {
      const batches = await database.collections.execution_batches.find({ bookletId: booklet.id }).toArray();
      return batches.find((batch) => batch.status === "completed") ?? null;
    });
    expect(completed.resultChoicePolicy).toBe("implicit_sole");
    expect(await repositories.execution.getPreference(booklet.id, "skill:intake_readiness@1")).toBeNull();
    const active = await eventually(async () => {
      const snapshot = await booklets.getWorkspaceSnapshot(booklet.id);
      const card = snapshot.activeCard as { family?: string; title?: string } | null;
      return card?.family === "artifact_review" ? card : null;
    });
    expect(active.title).toBe("Review the audience profile");
    expect(await database.collections.artifact_versions.countDocuments({ sourceExecutionBatchId: completed._id })).toBe(1);
    const audience = await repositories.artifacts.getDetail(booklet.id, "audience_profile");
    const replayed = await repositories.artifacts.createVersion({ id: "00000000-0000-4000-8000-000000000813", bookletId: booklet.id, artifactType: "audience_profile", content: audience!.currentVersion!.content, dependencyVersionIds: [], createdBy: "agent", sourceExecutionBatchId: completed._id, createdAtMs: Date.now() });
    expect(replayed.id).toBe(audience!.currentVersion!.id);
    expect(await database.collections.artifact_versions.countDocuments({ sourceExecutionBatchId: completed._id })).toBe(1);
    expect(await repositories.evidence.countModelCalls(booklet.id)).toBeGreaterThanOrEqual(2);
    expect((await repositories.evidence.listModelCalls(booklet.id)).some((call) => call.operation === "candidate" && call.executionBatchId === completed._id && call.executionItemId !== null)).toBe(true);
  });

  it("projects a saved terminal text candidate after recovery without another provider execution", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const booklets = new BookletService({ database });
    const cards = new CardService({ database });
    const chat = new ChatService({ database });
    const booklet = await booklets.create({ idea: "A sparrow returns a lost ribbon." });
    const turn = await chat.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000833", role: "user", parts: [{ type: "text", text: "The audience is ages 6-8." }] });
    const part = turn.assistantMessage.parts.find((candidate) => candidate.type === "data-card");
    if (!part || part.type !== "data-card" || part.data.family !== "agent_run") throw new Error("Expected an Agent Run card.");
    await cards.submit(booklet.id, { cardId: part.data.cardId, responseId: "00000000-0000-4000-8000-000000000834", action: "run_agents", value: part.data.payload.selectedAgentIds });
    const repositories = createRepositories(database);
    const completed = await eventually(async () => (await database.collections.execution_batches.findOne({ bookletId: booklet.id, status: "completed" })) ?? null);
    const agentCard = await repositories.conversation.getCard(booklet.id, part.data.cardId);
    if (!agentCard || agentCard.family !== "agent_run") throw new Error("Expected saved Agent Run card.");
    await database.collections.execution_batches.updateOne({ _id: completed._id }, { $set: { status: "materializing", materializationStatus: "running", completedAtMs: null, updatedAtMs: Date.now() } });
    await repositories.execution.recoverInterrupted(Date.now());
    expect(await repositories.execution.getBatch(completed._id)).toMatchObject({ status: "completed", materializationStatus: "completed" });
    const staleCard = { ...agentCard, status: "active" as const, allowedActions: [], payload: { ...agentCard.payload, state: "running" as const, items: [], selectedItemId: null, selectionMode: null } };
    await database.collections.cards.updateOne({ _id: part.data.cardId, bookletId: booklet.id }, { $set: { cardJson: JSON.stringify(staleCard), updatedAtMs: Date.now() } });
    await database.collections.execution_batches.updateOne({ _id: completed._id }, { $set: { status: "running", materializationStatus: "idle", selectedItemId: null, selectionMode: null, selectionResponseId: null, completedAtMs: null, updatedAtMs: Date.now() } });

    const execute = vi.spyOn(CandidateExecutionService.prototype, "executeText");
    const recovered = await new AgentRunService({ repositories, runtimeMode: "fake" }).recoverInterrupted();
    expect(recovered).toContain(completed._id);
    await eventually(async () => (await repositories.execution.getBatch(completed._id))?.status === "completed" ? true : null);
    expect(execute).not.toHaveBeenCalled();
    expect(await repositories.conversation.getCard(booklet.id, part.data.cardId)).toMatchObject({ family: "agent_run", payload: { state: "completed" } });
  });

  it.each(["implicit_sole", "explicit"] as const)("restores the missing text decision card for retained %s selection after an artifact commit", async (selectionMode) => {
    const database = await createTestDatabase(); databases.push(database);
    const booklets = new BookletService({ database });
    const cards = new CardService({ database });
    const chat = new ChatService({ database });
    const booklet = await booklets.create({ idea: "A rabbit returns a lost scarf." });
    const turn = await chat.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000891", role: "user", parts: [{ type: "text", text: "The audience is ages 6-8." }] });
    const part = turn.assistantMessage.parts.find((candidate) => candidate.type === "data-card");
    if (!part || part.type !== "data-card" || part.data.family !== "agent_run") throw new Error("Expected an Agent Run card.");
    await cards.submit(booklet.id, { cardId: part.data.cardId, responseId: "00000000-0000-4000-8000-000000000892", action: "run_agents", value: part.data.payload.selectedAgentIds });
    const repositories = createRepositories(database);
    const completed = await eventually(async () => (await database.collections.execution_batches.findOne({ bookletId: booklet.id, status: "completed" })) ?? null);
    const agentCard = await repositories.conversation.getCard(booklet.id, part.data.cardId);
    if (!agentCard || agentCard.family !== "agent_run") throw new Error("Expected saved Agent Run card.");
    const audience = await repositories.artifacts.getDetail(booklet.id, "audience_profile");
    const decision = await eventually(async () => {
      const snapshot = await booklets.getWorkspaceSnapshot(booklet.id);
      const card = snapshot.activeCard ? genUICardSchema.parse(snapshot.activeCard) : null;
      return card?.family === "artifact_review" ? card : null;
    });
    const decisionRow = await database.collections.cards.findOne({ _id: decision.cardId, bookletId: booklet.id });
    await database.collections.cards.deleteOne({ _id: decision.cardId, bookletId: booklet.id });
    if (decisionRow?.messageId) await database.collections.messages.deleteOne({ _id: decisionRow.messageId });
    const selectedItem = await database.collections.execution_items.findOne({ _id: completed.selectedItemId! });
    if (!selectedItem) throw new Error("Expected selected candidate.");
    const otherItemId = "00000000-0000-4000-8000-000000000893";
    if (selectionMode === "explicit") {
      await database.collections.execution_items.insertOne({ ...selectedItem, _id: otherItemId, agentId: "00000000-0000-4000-8000-000000000894", canonicalResultJson: JSON.stringify({ ready: true, rationale: "A different candidate", knownFacts: ["Different candidate B"] }) });
    }
    const runningCard = { ...agentCard, status: "active" as const, allowedActions: [], payload: { ...agentCard.payload, state: "running" as const, selectionMode } };
    await database.collections.cards.updateOne({ _id: agentCard.cardId }, { $set: { status: "active", cardJson: JSON.stringify(runningCard) } });
    await database.collections.execution_batches.updateOne({ _id: completed._id }, { $set: { status: "materializing", materializationStatus: "running", resultChoicePolicy: selectionMode, selectionMode, completedAtMs: null } });

    const execute = vi.spyOn(CandidateExecutionService.prototype, "executeText");
    execute.mockClear();
    const recoveredIds = await repositories.execution.recoverInterrupted(Date.now());
    expect(await repositories.execution.getBatch(completed._id)).toMatchObject({ status: "results", materializationStatus: "failed", materializationContinuationPending: false, selectedItemId: selectedItem._id, selectionMode, selectionResponseId: completed.selectionResponseId });
    if (selectionMode === "explicit") {
      expect(await repositories.execution.markSelected({ batchId: completed._id, itemId: otherItemId, responseId: "00000000-0000-4000-8000-000000000895", mode: "explicit", ownerId: "00000000-0000-4000-8000-000000000896", deadlineAtMs: Date.now() + 30_000, now: Date.now() })).toBe(false);
      // A handled failure can already have projected results before restart.
      const resultsCard = { ...runningCard, payload: { ...runningCard.payload, state: "results" as const } };
      await database.collections.cards.updateOne({ _id: agentCard.cardId }, { $set: { cardJson: JSON.stringify(resultsCard) } });
    }
    await new AgentRunService({ repositories, runtimeMode: "fake" }).recoverInterrupted(recoveredIds);
    await eventually(async () => (await repositories.execution.getBatch(completed._id))?.status === "completed" ? true : null);
    const restored = await booklets.getWorkspaceSnapshot(booklet.id);
    expect(restored.activeCard).toMatchObject({ family: "artifact_review", payload: { artifactType: "audience_profile", versionId: audience!.currentVersion!.id } });
    expect(await repositories.conversation.getCard(booklet.id, agentCard.cardId)).toMatchObject({ family: "agent_run", payload: { state: "completed" } });
    expect(await repositories.execution.getBatch(completed._id)).toMatchObject({ selectedItemId: selectedItem._id, selectionMode, selectionResponseId: completed.selectionResponseId });
    expect(await database.collections.artifact_versions.countDocuments({ sourceExecutionBatchId: completed._id })).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    execute.mockRestore();
  });

  it("keeps a completed historical card unresolved when its intake output cannot be proven", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const booklets = new BookletService({ database });
    const cards = new CardService({ database });
    const chat = new ChatService({ database });
    const booklet = await booklets.create({ idea: "A fox finds a lost mitten." });
    const turn = await chat.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000871", role: "user", parts: [{ type: "text", text: "The audience is ages 6-8." }] });
    const part = turn.assistantMessage.parts.find((candidate) => candidate.type === "data-card");
    if (!part || part.type !== "data-card" || part.data.family !== "agent_run") throw new Error("Expected an Agent Run card.");
    await cards.submit(booklet.id, { cardId: part.data.cardId, responseId: "00000000-0000-4000-8000-000000000872", action: "run_agents", value: part.data.payload.selectedAgentIds });
    const repositories = createRepositories(database);
    const completed = await eventually(async () => (await database.collections.execution_batches.findOne({ bookletId: booklet.id, status: "completed" })) ?? null);
    const selected = (await repositories.execution.getItems(completed._id))[0]!;
    const canonicalResult = selected.canonicalResult;
    const selectionResponseId = "00000000-0000-4000-8000-000000000872";
    const card = await repositories.conversation.getCard(booklet.id, part.data.cardId);
    if (!card || card.family !== "agent_run") throw new Error("Expected completed Agent Run card.");
    await database.collections.artifact_versions.deleteMany({ sourceExecutionBatchId: completed._id });
    await database.collections.cards.updateOne({ _id: part.data.cardId }, { $set: { status: "submitted", cardJson: JSON.stringify({ ...card, status: "submitted", payload: { ...card.payload, state: "completed", selectedItemId: selected.id, selectionMode: "implicit_sole" } }) } });
    await database.collections.execution_batches.updateOne({ _id: completed._id }, { $set: { status: "materializing", materializationStatus: "running", selectedItemId: selected.id, selectionMode: "implicit_sole", selectionResponseId, completedAtMs: null } });
    const execute = vi.spyOn(CandidateExecutionService.prototype, "executeText"); execute.mockClear();
    const service = new AgentRunService({ repositories, runtimeMode: "fake" });
    await service.recoverInterrupted(await repositories.execution.recoverInterrupted(Date.now()));
    const batch = await repositories.execution.getBatch(completed._id);
    const items = await repositories.execution.getItems(completed._id);
    const recoveredCard = await repositories.conversation.getCard(booklet.id, part.data.cardId);
    expect(batch).toMatchObject({ status: "results", materializationStatus: "failed", selectedItemId: selected.id, selectionMode: "implicit_sole", selectionResponseId, materializationUnresolvedReason: expect.stringContaining("could not prove") });
    expect(items).toEqual([expect.objectContaining({ id: selected.id, canonicalResult })]);
    expect(recoveredCard).toMatchObject({ family: "agent_run", allowedActions: ["change_agents"], explanation: expect.stringContaining("could not prove"), payload: { state: "results", selectedItemId: selected.id, selectionMode: "implicit_sole" } });
    const firstProjection = JSON.stringify({ batch, items, recoveredCard });
    await service.recoverInterrupted(await repositories.execution.recoverInterrupted(Date.now()));
    expect(JSON.stringify({ batch: await repositories.execution.getBatch(completed._id), items: await repositories.execution.getItems(completed._id), recoveredCard: await repositories.conversation.getCard(booklet.id, part.data.cardId) })).toBe(firstProjection);
    expect(await database.collections.artifact_versions.countDocuments({ sourceExecutionBatchId: completed._id })).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps a completed historical quality card unresolved when only unlinked review evidence remains", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const booklets = new BookletService({ database });
    const cards = new CardService({ database });
    const chat = new ChatService({ database });
    const booklet = await booklets.create({ idea: "A wren learns to share a warm nest." });
    const start = await chat.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000881", role: "user", parts: [{ type: "text", text: "The audience is ages 6-8." }] });
    const startPart = start.assistantMessage.parts.find((candidate) => candidate.type === "data-card");
    if (!startPart || startPart.type !== "data-card" || startPart.data.family !== "agent_run") throw new Error("Expected intake Agent Run card.");
    await cards.submit(booklet.id, { cardId: startPart.data.cardId, responseId: "00000000-0000-4000-8000-000000000882", action: "run_agents", value: startPart.data.payload.selectedAgentIds });
    await eventually(async () => (await database.collections.execution_batches.findOne({ bookletId: booklet.id, cardId: startPart.data.cardId, status: "completed" })) ?? null);
    const intakeReview = await eventually(async () => {
      const active = (await booklets.getWorkspaceSnapshot(booklet.id)).activeCard as { cardId?: string; family?: string; payload?: { versionId?: string | null } } | null;
      return active?.family === "artifact_review" && active.payload?.versionId ? active : null;
    });
    await cards.submit(booklet.id, { cardId: intakeReview.cardId!, responseId: "00000000-0000-4000-8000-000000000883", action: "approve_and_continue" });
    const story = await chat.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000884", role: "user", parts: [{ type: "text", text: "Draft the Story Plan." }] });
    const storyPart = story.assistantMessage.parts.find((candidate) => candidate.type === "data-card");
    if (!storyPart || storyPart.type !== "data-card" || storyPart.data.family !== "agent_run") throw new Error("Expected story Agent Run card.");
    await cards.submit(booklet.id, { cardId: storyPart.data.cardId, responseId: "00000000-0000-4000-8000-000000000885", action: "run_agents", value: storyPart.data.payload.selectedAgentIds });
    await eventually(async () => (await database.collections.execution_batches.findOne({ bookletId: booklet.id, cardId: storyPart.data.cardId, status: "completed" })) ?? null);
    const storyReview = await eventually(async () => {
      const active = (await booklets.getWorkspaceSnapshot(booklet.id)).activeCard as { cardId?: string; family?: string; title?: string } | null;
      return active?.family === "artifact_review" && active.title === "Review the Story Plan" ? active : null;
    });
    const qualityFollowup = "00000000-0000-4000-8000-000000000886";
    await cards.submit(booklet.id, { cardId: storyReview.cardId!, responseId: qualityFollowup, action: "request_revision", revisionInstruction: "Check the Story Plan quality." });
    const quality = await chat.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000887", role: "user", metadata: { schemaVersion: "1", bookletId: booklet.id, responseId: qualityFollowup }, parts: [{ type: "text", text: "Check the Story Plan quality." }] });
    const qualityPart = quality.assistantMessage.parts.find((candidate) => candidate.type === "data-card");
    if (!qualityPart || qualityPart.type !== "data-card" || qualityPart.data.family !== "agent_run") throw new Error("Expected quality Agent Run card.");
    await cards.submit(booklet.id, { cardId: qualityPart.data.cardId, responseId: "00000000-0000-4000-8000-000000000888", action: "run_agents", value: qualityPart.data.payload.selectedAgentIds });
    const repositories = createRepositories(database);
    const completed = await eventually(async () => (await database.collections.execution_batches.findOne({ bookletId: booklet.id, cardId: qualityPart.data.cardId, status: "completed" })) ?? null);
    expect(JSON.parse(completed.canonicalInputJson)).toMatchObject({ skillId: "quality_review_targeted_repair@1" });
    const selected = (await repositories.execution.getItems(completed._id))[0]!;
    const canonicalResult = selected.canonicalResult;
    const selectionResponseId = completed.selectionResponseId;
    const card = await repositories.conversation.getCard(booklet.id, qualityPart.data.cardId);
    if (!card || card.family !== "agent_run" || !selectionResponseId) throw new Error("Expected saved quality Agent Run projection.");
    const unlinkedReview = await database.collections.quality_reviews.findOne({ bookletId: booklet.id, sourceExecutionBatchId: null });
    expect(unlinkedReview).not.toBeNull();
    const qualityReviewCount = await database.collections.quality_reviews.countDocuments({ bookletId: booklet.id });
    const artifactCount = await database.collections.artifact_versions.countDocuments({ bookletId: booklet.id });
    await database.collections.cards.updateOne({ _id: qualityPart.data.cardId }, { $set: { status: "submitted", cardJson: JSON.stringify({ ...card, status: "submitted", payload: { ...card.payload, state: "completed", selectedItemId: selected.id, selectionMode: "implicit_sole" } }) } });
    await database.collections.execution_batches.updateOne({ _id: completed._id }, { $set: { status: "materializing", materializationStatus: "running", selectedItemId: selected.id, selectionMode: "implicit_sole", selectionResponseId, completedAtMs: null } });
    const execute = vi.spyOn(CandidateExecutionService.prototype, "executeText"); execute.mockClear();
    const service = new AgentRunService({ repositories, runtimeMode: "fake" });
    await service.recoverInterrupted(await repositories.execution.recoverInterrupted(Date.now()));
    const batch = await repositories.execution.getBatch(completed._id);
    const items = await repositories.execution.getItems(completed._id);
    const recoveredCard = await repositories.conversation.getCard(booklet.id, qualityPart.data.cardId);
    expect(batch).toMatchObject({ status: "results", materializationStatus: "failed", selectedItemId: selected.id, selectionMode: "implicit_sole", selectionResponseId, materializationUnresolvedReason: expect.stringContaining("could not prove") });
    expect(items).toEqual([expect.objectContaining({ id: selected.id, canonicalResult })]);
    expect(recoveredCard).toMatchObject({ family: "agent_run", allowedActions: ["change_agents"], explanation: expect.stringContaining("could not prove"), payload: { state: "results", selectedItemId: selected.id, selectionMode: "implicit_sole" } });
    const firstProjection = JSON.stringify({ batch, items, recoveredCard });
    await service.recoverInterrupted(await repositories.execution.recoverInterrupted(Date.now()));
    expect(JSON.stringify({ batch: await repositories.execution.getBatch(completed._id), items: await repositories.execution.getItems(completed._id), recoveredCard: await repositories.conversation.getCard(booklet.id, qualityPart.data.cardId) })).toBe(firstProjection);
    expect(await database.collections.quality_reviews.countDocuments({ bookletId: booklet.id })).toBe(qualityReviewCount);
    expect(await database.collections.quality_reviews.findOne({ _id: unlinkedReview!._id })).toEqual(unlinkedReview);
    expect(await database.collections.artifact_versions.countDocuments({ bookletId: booklet.id })).toBe(artifactCount);
    expect(execute).not.toHaveBeenCalled();
  });

  it("projects an all-failed terminal text run after recovery without another provider execution", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const booklets = new BookletService({ database });
    const cards = new CardService({ database });
    const chat = new ChatService({ database });
    const booklet = await booklets.create({ idea: "A badger returns a borrowed lantern." });
    const turn = await chat.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000835", role: "user", parts: [{ type: "text", text: "The audience is ages 6-8." }] });
    const part = turn.assistantMessage.parts.find((candidate) => candidate.type === "data-card");
    if (!part || part.type !== "data-card" || part.data.family !== "agent_run") throw new Error("Expected an Agent Run card.");
    await cards.submit(booklet.id, { cardId: part.data.cardId, responseId: "00000000-0000-4000-8000-000000000836", action: "run_agents", value: part.data.payload.selectedAgentIds });
    const repositories = createRepositories(database);
    const completed = await eventually(async () => (await database.collections.execution_batches.findOne({ bookletId: booklet.id, status: "completed" })) ?? null);
    const item = await database.collections.execution_items.findOne({ batchId: completed._id });
    if (!item) throw new Error("Expected the completed candidate item.");
    const agentCard = await repositories.conversation.getCard(booklet.id, part.data.cardId);
    if (!agentCard || agentCard.family !== "agent_run") throw new Error("Expected saved Agent Run card.");
    const staleCard = { ...agentCard, status: "active" as const, allowedActions: [], payload: { ...agentCard.payload, state: "running" as const, items: [], selectedItemId: null, selectionMode: null } };
    await database.collections.cards.updateOne({ _id: part.data.cardId, bookletId: booklet.id }, { $set: { cardJson: JSON.stringify(staleCard), updatedAtMs: Date.now() } });
    await database.collections.execution_items.updateOne({ _id: item._id }, { $set: { status: "failed", canonicalResultJson: null, resultSummaryJson: null, safeErrorJson: JSON.stringify({ kind: "interrupted", message: "Saved terminal failure." }), updatedAtMs: Date.now() } });
    await database.collections.execution_batches.updateOne({ _id: completed._id }, { $set: { status: "results", materializationStatus: "idle", selectedItemId: null, selectionMode: null, selectionResponseId: null, completedAtMs: null, updatedAtMs: Date.now() } });

    const execute = vi.spyOn(CandidateExecutionService.prototype, "executeText");
    execute.mockClear();
    const recovered = await new AgentRunService({ repositories, runtimeMode: "fake" }).recoverInterrupted();
    expect(recovered).toContain(completed._id);
    await eventually(async () => {
      const card = await repositories.conversation.getCard(booklet.id, part.data.cardId);
      return card?.family === "agent_run" && card.payload.state === "results" ? card : null;
    });
    expect(execute).not.toHaveBeenCalled();
    expect(await repositories.conversation.getCard(booklet.id, part.data.cardId)).toMatchObject({
      family: "agent_run",
      allowedActions: expect.arrayContaining(["retry_failed_agents"]),
      payload: { state: "results", items: [{ status: "failed" }] },
    });
  });

  it("does not let a recovered historical terminal batch overwrite the same card's ready successor", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const booklets = new BookletService({ database });
    const cards = new CardService({ database });
    const chat = new ChatService({ database });
    const booklet = await booklets.create({ idea: "A mole finds a map beneath a leaf." });
    const turn = await chat.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000837", role: "user", parts: [{ type: "text", text: "The audience is ages 6-8." }] });
    const part = turn.assistantMessage.parts.find((candidate) => candidate.type === "data-card");
    if (!part || part.type !== "data-card" || part.data.family !== "agent_run") throw new Error("Expected an Agent Run card.");
    await cards.submit(booklet.id, { cardId: part.data.cardId, responseId: "00000000-0000-4000-8000-000000000838", action: "run_agents", value: part.data.payload.selectedAgentIds });
    const repositories = createRepositories(database);
    const completed = await eventually(async () => (await database.collections.execution_batches.findOne({ bookletId: booklet.id, status: "completed" })) ?? null);
    const agentCard = await repositories.conversation.getCard(booklet.id, part.data.cardId);
    if (!agentCard || agentCard.family !== "agent_run") throw new Error("Expected saved Agent Run card.");
    const readySuccessor = { ...agentCard, status: "active" as const, allowedActions: ["run_agents", "change_agents"] as const, payload: { ...agentCard.payload, state: "ready" as const, batchId: null, items: [], selectedItemId: null, selectionMode: null } };
    await database.collections.cards.updateOne({ _id: part.data.cardId, bookletId: booklet.id }, { $set: { cardJson: JSON.stringify(readySuccessor), updatedAtMs: Date.now() } });
    await database.collections.execution_batches.updateOne({ _id: completed._id }, { $set: { status: "results", materializationStatus: "idle", selectedItemId: null, selectionMode: null, selectionResponseId: null, completedAtMs: null, updatedAtMs: Date.now() } });

    const execute = vi.spyOn(CandidateExecutionService.prototype, "executeText");
    execute.mockClear();
    const recovered = await new AgentRunService({ repositories, runtimeMode: "fake" }).recoverInterrupted();
    expect(recovered).toContain(completed._id);
    await eventually(async () => {
      const card = await repositories.conversation.getCard(booklet.id, part.data.cardId);
      return card?.family === "agent_run" && card.payload.state === "ready" && card.payload.batchId === null ? card : null;
    });
    expect(execute).not.toHaveBeenCalled();
    expect(await repositories.conversation.getCard(booklet.id, part.data.cardId)).toMatchObject({
      family: "agent_run",
      allowedActions: ["run_agents", "change_agents"],
      payload: { state: "ready", batchId: null },
    });
  });

  it("atomically chooses either selection or change-agents for the same terminal card", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const booklets = new BookletService({ database });
    const cards = new CardService({ database });
    const chat = new ChatService({ database });
    const booklet = await booklets.create({ idea: "A squirrel shares a button collection." });
    const turn = await chat.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000839", role: "user", parts: [{ type: "text", text: "The audience is ages 6-8." }] });
    const part = turn.assistantMessage.parts.find((candidate) => candidate.type === "data-card");
    if (!part || part.type !== "data-card" || part.data.family !== "agent_run") throw new Error("Expected an Agent Run card.");
    await cards.submit(booklet.id, { cardId: part.data.cardId, responseId: "00000000-0000-4000-8000-000000000840", action: "run_agents", value: part.data.payload.selectedAgentIds });
    const repositories = createRepositories(database);
    const completed = await eventually(async () => (await database.collections.execution_batches.findOne({ bookletId: booklet.id, status: "completed" })) ?? null);
    const item = (await repositories.execution.getItems(completed._id))[0]!;
    const agentCard = await repositories.conversation.getCard(booklet.id, part.data.cardId);
    if (!agentCard || agentCard.family !== "agent_run") throw new Error("Expected saved Agent Run card.");
    const resultsCard = { ...agentCard, status: "active" as const, allowedActions: ["select_agent_result", "change_agents"] as Array<"select_agent_result" | "change_agents">, payload: { ...agentCard.payload, state: "results" as const, batchId: completed._id, selectedItemId: null, selectionMode: null } };
    const readyCard = { ...resultsCard, allowedActions: ["run_agents", "change_agents"] as Array<"run_agents" | "change_agents">, payload: { ...resultsCard.payload, state: "ready" as const, batchId: null, items: [] } };
    await database.collections.cards.updateOne({ _id: part.data.cardId, bookletId: booklet.id }, { $set: { cardJson: JSON.stringify(resultsCard), updatedAtMs: Date.now() } });
    await database.collections.execution_batches.updateOne({ _id: completed._id }, { $set: { status: "results", materializationStatus: "idle", selectedItemId: null, selectionMode: null, selectionResponseId: null, completedAtMs: null, updatedAtMs: Date.now() } });
    const execute = vi.spyOn(CandidateExecutionService.prototype, "executeText");
    execute.mockClear();

    const [selection, change] = await Promise.allSettled([
      repositories.execution.markSelected({ batchId: completed._id, itemId: item.id, responseId: "00000000-0000-4000-8000-000000000841", mode: "explicit", ownerId: "00000000-0000-4000-8000-000000000842", deadlineAtMs: Date.now() + 30_000, expectedCard: { bookletId: booklet.id, cardId: part.data.cardId, state: "results" }, now: Date.now() }),
      repositories.conversation.updateAgentRunProjection({ bookletId: booklet.id, card: readyCard, expectedCurrent: { batchId: completed._id, state: "results" }, updatedAtMs: Date.now() }),
    ]);
    const card = await repositories.conversation.getCard(booklet.id, part.data.cardId);
    const batch = await repositories.execution.getBatch(completed._id);
    expect(execute).not.toHaveBeenCalled();
    if (card?.family === "agent_run" && card.payload.state === "running") {
      expect(selection).toMatchObject({ status: "fulfilled", value: true });
      expect(change).not.toMatchObject({ status: "fulfilled", value: true });
      expect(batch).toMatchObject({ status: "materializing" });
    } else {
      expect(card).toMatchObject({ family: "agent_run", payload: { state: "ready", batchId: null } });
      expect(change).toMatchObject({ status: "fulfilled", value: true });
      expect(selection).not.toMatchObject({ status: "fulfilled", value: true });
      expect(batch).toMatchObject({ status: "results" });
    }
  });

  it("atomically claims a ready card so duplicate submissions create one batch", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const booklets = new BookletService({ database });
    const cards = new CardService({ database });
    const chat = new ChatService({ database });
    const booklet = await booklets.create({ idea: "A fox helps a sleepy owl find the moon." });
    const turn = await chat.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000814", role: "user", parts: [{ type: "text", text: "The audience is ages 6-8." }] });
    const part = turn.assistantMessage.parts.find((candidate) => candidate.type === "data-card");
    if (!part || part.type !== "data-card" || part.data.family !== "agent_run") throw new Error("Expected an Agent Run card.");

    const submissions = await Promise.allSettled([
      cards.submit(booklet.id, { cardId: part.data.cardId, responseId: "00000000-0000-4000-8000-000000000815", action: "run_agents", value: part.data.payload.selectedAgentIds }),
      cards.submit(booklet.id, { cardId: part.data.cardId, responseId: "00000000-0000-4000-8000-000000000816", action: "run_agents", value: part.data.payload.selectedAgentIds }),
    ]);

    expect(submissions.filter((submission) => submission.status === "fulfilled")).toHaveLength(1);
    expect(await database.collections.execution_batches.countDocuments({ bookletId: booklet.id })).toBe(1);
  });
  it("refreshes a stale ready card after its candidate pool changes", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const booklets = new BookletService({ database });
    const cards = new CardService({ database });
    const chat = new ChatService({ database });
    const booklet = await booklets.create({ idea: "A hedgehog shares a lantern with a mole." });
    const turn = await chat.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000824", role: "user", parts: [{ type: "text", text: "The audience is ages 6-8." }] });
    const part = turn.assistantMessage.parts.find((candidate) => candidate.type === "data-card");
    if (!part || part.type !== "data-card" || part.data.family !== "agent_run") throw new Error("Expected an Agent Run card.");
    const originalFingerprint = part.data.payload.poolFingerprint;
    await database.collections.agent_versions.updateOne({ _id: part.data.payload.candidates[0]!.agentVersionId }, { $inc: { revision: 1 } });

    await expect(cards.submit(booklet.id, { cardId: part.data.cardId, responseId: "00000000-0000-4000-8000-000000000825", action: "run_agents", value: part.data.payload.selectedAgentIds })).rejects.toMatchObject({ code: "execution_pool_stale", status: 409 });
    const refreshed = await createRepositories(database).conversation.getCard(booklet.id, part.data.cardId);
    expect(refreshed).toMatchObject({ family: "agent_run", payload: { state: "ready", poolFingerprint: expect.any(String) } });
    if (!refreshed || refreshed.family !== "agent_run") throw new Error("Expected refreshed Agent Run card.");
    expect(refreshed.payload.poolFingerprint).not.toBe(originalFingerprint);
    expect(refreshed.payload.staleSelectionNotices).toContain("Available agents changed. Review the refreshed team before running.");
  });

  it("removes inactive remembered agents from a ready-team default", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const repositories = createRepositories(database);
    const pools = new CandidatePoolService(repositories, "fake");
    const singleton = await pools.resolve("skill:intake_readiness@1");
    const primary = singleton.candidates[0]!;
    const pool = { ...singleton, candidates: [primary, { ...primary, id: "00000000-0000-4000-8000-000000000827", agentId: "00000000-0000-4000-8000-000000000828", displayName: "Second candidate" }] };
    const remembered = pools.rememberedSelection(pool, [primary.agentId, "00000000-0000-4000-8000-000000000826"]);
    expect(remembered.selectedAgentIds).toEqual([primary.agentId]);
    expect(remembered.notices).toContain("Previously selected agents are no longer available and were removed from this team.");
  });
  it("keeps image jobs observable while waiting for an agent team or result selection", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const booklets = new BookletService({ database });
    const repositories = createRepositories(database);
    const booklet = await booklets.create({ idea: "A rabbit shares a paper lantern." });
    const jobId = "00000000-0000-4000-8000-000000000829";
    const itemId = "00000000-0000-4000-8000-000000000830";
    await repositories.jobs.createOrGet({ id: jobId, bookletId: booklet.id, jobType: "references", idempotencyKey: `waiting-state:${booklet.id}`, input: {}, items: [{ id: itemId, itemKey: "character:rabbit", position: 0, input: {} }], createdAtMs: Date.now() });
    await repositories.jobs.claimNextPending(jobId, Date.now());
    await database.collections.generation_items.updateOne({ _id: itemId, jobId }, { $set: { status: "waiting_for_agents", executionCardId: "00000000-0000-4000-8000-000000000831" } });

    expect(await repositories.jobs.getStatus(jobId)).toMatchObject({ status: "waiting_for_agents" });
    expect((await booklets.getWorkspaceSnapshot(booklet.id)).activeJobs).toMatchObject([{ id: jobId, status: "waiting_for_agents" }]);
    await repositories.jobs.recoverInterrupted();
    expect(await repositories.jobs.getStatus(jobId)).toMatchObject({ status: "waiting_for_agents" });

    await database.collections.generation_items.updateOne({ _id: itemId, jobId }, { $set: { status: "waiting_for_selection", executionBatchId: "00000000-0000-4000-8000-000000000832" } });
    expect(await repositories.jobs.getStatus(jobId)).toMatchObject({ status: "waiting_for_selection" });
  });
  it("recovers an interrupted materialization for its matching service after another service checks first", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const repositories = createRepositories(database);
    const candidate = (await repositories.agents.resolveActiveCandidates("skill:intake_readiness@1"))[0]!;
    const batchId = "00000000-0000-4000-8000-000000000817";
    await repositories.execution.createBatch({
      id: batchId, bookletId: "00000000-0000-4000-8000-000000000818", cardId: "00000000-0000-4000-8000-000000000819", targetKey: "skill:intake_readiness@1", subjectKind: "image", subjectId: "reference", previousBatchId: null,
      poolFingerprint: "materialization-recovery-test", canonicalInput: { test: true }, workflowFingerprint: { test: true }, schemaVersion: "test", resultChoicePolicy: "implicit_sole", selectedAgentIds: [],
      agents: [{ agentId: candidate.agentId, agentVersionId: candidate.id, profileId: candidate.profileId!, profileVersion: candidate.profileVersion!, agentSnapshot: candidate, profileSnapshot: {} }], now: Date.now(),
    });
    const item = (await repositories.execution.getItems(batchId))[0]!;
    await repositories.execution.claimQueued(batchId, item.id, Date.now());
    await repositories.execution.finishItem({ batchId, itemId: item.id, result: { ready: true }, summary: "Ready to materialize", now: Date.now() });
    const selectedAtMs = Date.now();
    expect(await repositories.execution.markSelected({ batchId, itemId: item.id, responseId: "00000000-0000-4000-8000-000000000820", mode: "implicit_sole", ownerId: "00000000-0000-4000-8000-000000000821", deadlineAtMs: selectedAtMs + 30_000, now: selectedAtMs })).toBe(true);

    const execution = new ExecutionService(repositories, new CandidatePoolService(repositories, "fake"));
    expect(await execution.recoverInterrupted(async () => ({ result: {}, summary: "unused" }), undefined, (batch) => batch?.subjectKind === "text")).not.toContain(batchId);
    expect(await execution.recoverInterrupted(async () => ({ result: {}, summary: "unused" }), undefined, (batch) => batch?.subjectKind === "image")).toContain(batchId);
    expect((await execution.status(batchId))?.batch).toMatchObject({ status: "results", materializationStatus: "failed" });
  });
  it("retains interrupted attempts as failed until an explicit retry", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const repositories = createRepositories(database);
    const candidate = (await repositories.agents.resolveActiveCandidates("skill:intake_readiness@1"))[0]!;
    const batchId = "00000000-0000-4000-8000-000000000821";
    await repositories.execution.createBatch({
      id: batchId, bookletId: "00000000-0000-4000-8000-000000000822", cardId: "00000000-0000-4000-8000-000000000823", targetKey: "skill:intake_readiness@1", subjectKind: "text", subjectId: "audience_profile", previousBatchId: null,
      poolFingerprint: "recovery-test", canonicalInput: { test: true }, workflowFingerprint: { test: true }, schemaVersion: "test", resultChoicePolicy: "implicit_sole", selectedAgentIds: [],
      agents: [{ agentId: candidate.agentId, agentVersionId: candidate.id, profileId: candidate.profileId!, profileVersion: candidate.profileVersion!, agentSnapshot: candidate, profileSnapshot: {} }], now: Date.now(),
    });
    const item = (await repositories.execution.getItems(batchId))[0]!;
    await repositories.execution.claimQueued(batchId, item.id, Date.now() - 20);

    const execution = new ExecutionService(repositories, new CandidatePoolService(repositories, "fake"));
    const executor = vi.fn(async () => ({ result: { recovered: true }, summary: "Recovered candidate result" }));
    expect(await execution.recoverInterrupted(executor)).toContain(batchId);
    expect(executor).not.toHaveBeenCalled();
    const interrupted = await execution.status(batchId);
    expect(interrupted).toMatchObject({ batch: { status: "results" }, items: [{ attemptCount: 1, status: "failed", attempts: [{ status: "failed", safeError: { kind: "interrupted" } }] }] });

    await execution.retryFailed(batchId, executor);
    const recovered = await eventually(async () => {
      const status = await execution.status(batchId);
      return status?.batch.status === "results" ? status : null;
    });
    expect(recovered.items[0]?.attemptCount).toBe(2);
    expect(recovered.items[0]?.attempts).toMatchObject([
      { status: "failed", safeError: { kind: "interrupted" } },
      { status: "succeeded" },
    ]);
  });

  it("keeps an aborted candidate unknown and out of automatic retry", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const repositories = createRepositories(database);
    const candidate = (await repositories.agents.resolveActiveCandidates("skill:intake_readiness@1"))[0]!;
    const batchId = "00000000-0000-4000-8000-000000000843";
    await repositories.execution.createBatch({
      id: batchId, bookletId: "00000000-0000-4000-8000-000000000844", cardId: "00000000-0000-4000-8000-000000000845", targetKey: "skill:intake_readiness@1", subjectKind: "text", subjectId: "audience_profile", previousBatchId: null,
      poolFingerprint: "abort-recovery-test", canonicalInput: { test: true }, workflowFingerprint: { test: true }, schemaVersion: "test", resultChoicePolicy: "implicit_sole", selectedAgentIds: [],
      agents: [{ agentId: candidate.agentId, agentVersionId: candidate.id, profileId: candidate.profileId!, profileVersion: candidate.profileVersion!, agentSnapshot: candidate, profileSnapshot: {} }], now: Date.now(),
    });
    const execution = new ExecutionService(repositories, new CandidatePoolService(repositories, "fake"));
    const executor = vi.fn(async () => { const error = new Error("aborted provider request"); error.name = "AbortError"; throw error; });
    await execution.run(batchId, executor);
    const failed = await execution.status(batchId);
    expect(failed).toMatchObject({ batch: { status: "results" }, items: [{ status: "failed", safeError: { kind: "unknown" } }] });
    await execution.retryFailed(batchId, executor);
    expect(executor).toHaveBeenCalledTimes(1);
    expect((await execution.status(batchId))?.items[0]).toMatchObject({ status: "failed", safeError: { kind: "unknown" } });
  });
});
