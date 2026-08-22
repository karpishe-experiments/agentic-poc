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
    const turn = await chat.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000811", role: "user", parts: [{ type: "text", text: "The audience is ages 6-8." }] });
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
