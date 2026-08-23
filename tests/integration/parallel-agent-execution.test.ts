import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { BookletService } from "@/lib/application/booklet-service";
import { CardService } from "@/lib/application/card-service";
import { ChatService } from "@/lib/application/chat-service";
import { createRepositories } from "@/db/repositories";
import { CandidatePoolService } from "@/lib/application/candidate-pool-service";
import { ExecutionService } from "@/lib/application/execution-service";

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
    expect(await repositories.execution.markSelected({ batchId, itemId: item.id, responseId: "00000000-0000-4000-8000-000000000820", mode: "implicit_sole", now: Date.now() })).toBe(true);

    const execution = new ExecutionService(repositories, new CandidatePoolService(repositories, "fake"));
    expect(await execution.recoverInterrupted(async () => ({ result: {}, summary: "unused" }), undefined, (batch) => batch?.subjectKind === "text")).not.toContain(batchId);
    expect(await execution.recoverInterrupted(async () => ({ result: {}, summary: "unused" }), undefined, (batch) => batch?.subjectKind === "image")).toContain(batchId);
    expect((await execution.status(batchId))?.batch).toMatchObject({ status: "results", materializationStatus: "failed" });
  });
  it("re-queues interrupted attempts and resumes them with the frozen candidate version", async () => {
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
    expect(await execution.recoverInterrupted(async () => ({ result: { recovered: true }, summary: "Recovered candidate result" }))).toContain(batchId);
    const recovered = await eventually(async () => {
      const status = await execution.status(batchId);
      return status?.batch.status === "results" ? status : null;
    });
    expect(recovered.items[0]?.attemptCount).toBe(2);
    expect(recovered.items[0]?.attempts).toMatchObject([
      { status: "failed", safeError: { kind: "interrupted" } },
      { status: "succeeded" },
    ]);
  });});
