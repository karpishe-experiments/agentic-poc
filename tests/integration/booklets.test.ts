import { afterEach, describe, expect, it } from "vitest";
import { BookletService, type Clock, type IdGenerator } from "@/lib/application/booklet-service";
import { ChatService, isTypedWorkflowRecovery } from "@/lib/application/chat-service";
import { CardService } from "@/lib/application/card-service";
import { ArtifactService } from "@/lib/application/artifact-service";
import { RecoverableApplicationError } from "@/lib/application/application-error";
import { genUICardSchema, type GenUICard } from "@/lib/contracts/cards";
import type { Database } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { BOOKLET_ARTIFACT_TYPES } from "@/lib/contracts/domain";

const temporaryDatabases: Database[] = [];

afterEach(async () => { await Promise.all(temporaryDatabases.splice(0).map(closeTestDatabase)); });

function deterministicIds(): IdGenerator {
  let value = 100;
  return {
    next() {
      value += 1;
      return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
    },
  };
}

async function createServices(clock: Clock): Promise<{ database: Database; bookletService: BookletService; chatService: ChatService; cardService: CardService }> {
  const database = await createTestDatabase();
  temporaryDatabases.push(database);
  return {
    database,
    bookletService: new BookletService({ database, ids: deterministicIds(), clock }),
    chatService: new ChatService({ database }),
    cardService: new CardService({ database }),
  };
}

async function runSoleAgentCard(bookletService: BookletService, cardService: CardService, bookletId: string, card: GenUICard): Promise<GenUICard> {
  if (card.family !== "agent_run") return card;
  await cardService.submit(bookletId, { cardId: card.cardId, responseId: crypto.randomUUID(), action: "run_agents", value: card.payload.selectedAgentIds });
  let latest: GenUICard | null = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = await bookletService.getWorkspaceSnapshot(bookletId);
    latest = snapshot.activeCard ? genUICardSchema.parse(snapshot.activeCard) : null;
    if (latest && latest.family !== "agent_run") return latest;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`The sole Agent run did not materialize a follow-up card: ${JSON.stringify(latest)}`);
}
describe("BookletService", () => {
  it("creates the complete persisted initial booklet state and lists the newest booklet first", async () => {
    let now = Date.UTC(2026, 7, 1, 9, 0, 0);
    const { bookletService: service } = await createServices({ now: () => now });

    const first = await service.create({ idea: "Mara builds a paper boat for a rainy day." });
    now += 1_000;
    const second = await service.create({ idea: "Owen and a gentle dragon map the night garden." });

    const list = await service.list();
    expect(list.map((booklet) => booklet.id)).toEqual([second.id, first.id]);
    expect(list[0]).toMatchObject({
      workingTitle: "Owen and a gentle dragon map the night garden",
      lifecycle: "draft",
      currentStage: "audience_profile",
      coverAssetId: null,
      generationProgress: null,
    });

    const snapshot = await service.getWorkspaceSnapshot(first.id);
    expect(snapshot.artifacts.map((artifact) => artifact.artifactType)).toEqual(BOOKLET_ARTIFACT_TYPES);
    expect(snapshot.artifacts.every((artifact) => artifact.state === "empty")).toBe(true);
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0]).toMatchObject({ role: "user", sequence: 0 });
    expect(snapshot.messages[0]?.message).toMatchObject({
      parts: [{ type: "text", text: "Mara builds a paper boat for a rainy day." }],
    });
    expect(snapshot.activeCard).toBeNull();
    expect(snapshot.activeJobs).toEqual([]);
    expect(snapshot.exports).toEqual([]);
  });

  it("marks a truncated idea-derived working title instead of cutting it mid-sentence", async () => {
    const { bookletService: service } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await service.create({ idea: `${"A gentle garden story ".repeat(12)}blooms.` });

    expect(booklet.workingTitle).toHaveLength(140);
    expect(booklet.workingTitle).toMatch(/…$/u);
  });

  it("returns a dedicated not-found error for a missing workspace", async () => {
    const { bookletService: service } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    await expect(service.getWorkspaceSnapshot("00000000-0000-4000-8000-000000000999")).rejects.toMatchObject({ name: "BookletNotFoundError" });
  });

  it("persists a deterministic fake turn and its active decision card", async () => {
    const { database, bookletService, chatService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await bookletService.create({ idea: "A robin learns why taking turns makes the garden kinder." });
    const turn = await chatService.createTurn(booklet.id, {
      id: "00000000-0000-4000-8000-000000000901",
      role: "user",
      parts: [{ type: "text", text: "Please help me begin." }],
    });

    expect(turn.assistantMessage.parts.some((part) => part.type === "data-card")).toBe(true);
    const snapshot = await bookletService.getWorkspaceSnapshot(booklet.id);
    expect(snapshot.messages).toHaveLength(3);
    expect(snapshot.activeCard).toMatchObject({ family: "agent_run", variant: "parallel_execution", status: "active" });
    const calls = await createRepositories(database).evidence.listModelCalls(booklet.id);
    expect(calls).toMatchObject([
      { operation: "manager", skillId: null, status: "succeeded" },

    ]);
    expect(calls).toHaveLength(1);
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ usage: { inputTokens: 0, outputTokens: 0 }, actualCostUsd: "0", estimatedCostUsd: "0", pricingVersion: "fake-runtime-v1", providerRequestId: null }),
    ]));
  });

  it("makes a repeated card response idempotent and collapses the submitted card", async () => {
    const { bookletService, chatService, cardService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await bookletService.create({ idea: "A little fox finds a new way home." });
    const turn = await chatService.createTurn(booklet.id, {
      id: "00000000-0000-4000-8000-000000000902",
      role: "user",
      parts: [{ type: "text", text: "Please help me begin." }],
    });
    const card = turn.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!card || card.type !== "data-card") throw new Error("Expected a card from the fake runtime.");
    const question = await runSoleAgentCard(bookletService, cardService, booklet.id, card.data);
    const response = {
      cardId: question.cardId,
      responseId: "00000000-0000-4000-8000-000000000903",
      action: "submit" as const,
      value: "6-8",
    };

    expect((await cardService.submit(booklet.id, response)).duplicate).toBe(false);
    expect((await cardService.submit(booklet.id, response)).duplicate).toBe(true);
    expect((await bookletService.getWorkspaceSnapshot(booklet.id)).activeCard).toBeNull();
  });

  it("claims a card-response follow-up once and restores submitted cards on reload", async () => {
    const { bookletService, chatService, cardService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await bookletService.create({ idea: "A hedgehog shares a warm lantern with a lost moth." });
    const initialTurn = await chatService.createTurn(booklet.id, {
      id: "00000000-0000-4000-8000-000000000904",
      role: "user",
      parts: [{ type: "text", text: "Please help me begin." }],
    });
    const card = initialTurn.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!card || card.type !== "data-card") throw new Error("Expected a card from the fake runtime.");
    const question = await runSoleAgentCard(bookletService, cardService, booklet.id, card.data);
    const responseId = "00000000-0000-4000-8000-000000000905";
    await cardService.submit(booklet.id, { cardId: question.cardId, responseId, action: "submit", value: "6-8" });
    await expect(bookletService.getWorkspaceSnapshot(booklet.id)).resolves.toMatchObject({
      pendingCardFollowup: { responseId, summary: expect.any(String) },
    });

    const followup = await chatService.createTurn(booklet.id, {
      id: "00000000-0000-4000-8000-000000000906",
      role: "user",
      metadata: { schemaVersion: "1", bookletId: booklet.id, responseId },
      parts: [{ type: "text", text: "This client summary is not authoritative." }],
    });
    const duplicateFollowup = await chatService.createTurn(booklet.id, {
      id: "00000000-0000-4000-8000-000000000907",
      role: "user",
      metadata: { schemaVersion: "1", bookletId: booklet.id, responseId },
      parts: [{ type: "text", text: "Retrying the same saved decision." }],
    });
    const snapshot = await bookletService.getWorkspaceSnapshot(booklet.id);
    const persistedFirstCard = (snapshot.messages[2]?.message as { parts: Array<{ type: string; data?: { status?: string } }> }).parts
      .find((part) => part.type === "data-card");

    expect(followup.assistantMessage.id).toBe(duplicateFollowup.assistantMessage.id);
    expect(snapshot.messages).toHaveLength(6);
    expect(snapshot.pendingCardFollowup).toBeNull();
    expect(persistedFirstCard?.data?.status).toBe("submitted");
    expect(snapshot.activeCard).toMatchObject({ status: "active", family: "agent_run", variant: "parallel_execution", payload: { target: "skill:intake_readiness@1" } });
  });

  it("creates a deterministic recovery card for a conflicting later response and can reopen a prior card", async () => {
    const { bookletService, chatService, cardService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await bookletService.create({ idea: "A squirrel learns that asking for help can be brave." });
    const turn = await chatService.createTurn(booklet.id, {
      id: "00000000-0000-4000-8000-000000000908",
      role: "user",
      parts: [{ type: "text", text: "Please help me begin." }],
    });
    const card = turn.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!card || card.type !== "data-card") throw new Error("Expected a card from the fake runtime.");
    const question = await runSoleAgentCard(bookletService, cardService, booklet.id, card.data);
    await cardService.submit(booklet.id, {
      cardId: question.cardId,
      responseId: "00000000-0000-4000-8000-000000000909",
      action: "submit",
      value: "6-8",
    });
    const conflict = await cardService.submit(booklet.id, {
      cardId: question.cardId,
      responseId: "00000000-0000-4000-8000-000000000910",
      action: "submit",
      value: "3-5",
    });
    expect(conflict).toMatchObject({ kind: "conflict", recoveryCard: { family: "issue", variant: "recovery" } });

    const reopened = await cardService.reopen(booklet.id, question.cardId);
    expect(reopened).toMatchObject({ cardId: expect.not.stringMatching(question.cardId), status: "active", family: "question" });
    expect((await bookletService.getWorkspaceSnapshot(booklet.id)).activeCard).toMatchObject({ cardId: reopened.cardId, status: "active" });
  });

  it("persists a safe Visual Bible retry card without losing the saved booklet", async () => {
    const { bookletService, chatService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await bookletService.create({ idea: "A small lantern helps a moonflower bloom." });

    const recovery = await chatService.createRecoveryTurn(booklet.id, new RecoverableApplicationError({
      code: "visual_bible_entities_mismatch",
      message: "Visual Bible entity mismatch.",
    }));
    const card = recovery.parts.find((part) => part.type === "data-card");

    expect(card).toMatchObject({
      type: "data-card",
      data: { family: "issue", variant: "recovery", title: "Retry Visual Bible", allowedActions: ["retry"] },
    });
    expect((await bookletService.getWorkspaceSnapshot(booklet.id)).activeCard).toMatchObject({
      family: "issue",
      variant: "recovery",
      status: "active",
    });
  });

  it("persists an idempotent Page Plan recovery that preserves approved decisions", async () => {
    const { bookletService, chatService, cardService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await bookletService.create({ idea: "A small lantern helps a moonflower bloom." });
    const error = new RecoverableApplicationError({
      code: "page_plan_specification_mismatch",
      message: "The Page Plan must use the current confirmed page count and geometry.",
    });

    expect(isTypedWorkflowRecovery(error)).toBe(true);
    expect(isTypedWorkflowRecovery(new RecoverableApplicationError({ code: "active_card_required", message: "Keep the current card." }))).toBe(false);
    const recovery = await chatService.createRecoveryTurn(booklet.id, error);
    const card = recovery.parts.find((part) => part.type === "data-card");
    if (!card || card.type !== "data-card") throw new Error("Expected Page Plan recovery card.");

    expect(card.data).toMatchObject({
      family: "issue",
      variant: "recovery",
      title: "Retry Page Plan",
      allowedActions: ["retry"],
      explanation: expect.stringContaining("No page images were created"),
      payload: { details: expect.arrayContaining([expect.stringContaining("does not change approved decisions")]) },
    });
    const response = { cardId: card.data.cardId, responseId: "00000000-0000-4000-8000-000000000911", action: "retry" as const };
    expect(await cardService.submit(booklet.id, response)).toMatchObject({ kind: "saved", duplicate: false, followupRequired: true });
    expect(await cardService.submit(booklet.id, response)).toMatchObject({ duplicate: true });
    const snapshot = await bookletService.getWorkspaceSnapshot(booklet.id);
    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.activeCard).toBeNull();
  });


  it("advances from the approved audience review to the persisted Story Plan review", async () => {
    const { database, bookletService, chatService, cardService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await bookletService.create({ idea: "A robin learns to share rainwater in a bright garden." });
    const first = await chatService.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000921", role: "user", parts: [{ type: "text", text: "Please begin." }] });
    const question = first.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!question || question.type !== "data-card") throw new Error("Expected intake card.");
    const intakeCard = await runSoleAgentCard(bookletService, cardService, booklet.id, question.data);
    const responseId = "00000000-0000-4000-8000-000000000922";
    await cardService.submit(booklet.id, { responseId, cardId: intakeCard.cardId, action: "select", value: "6-8" });
    await chatService.createTurn(booklet.id, {
      id: "00000000-0000-4000-8000-000000000923",
      role: "user",
      metadata: { schemaVersion: "1", bookletId: booklet.id, responseId },
      parts: [{ type: "text", text: "Ages 6–8" }],
    });
    const audienceReview = await runSoleAgentCard(bookletService, cardService, booklet.id, genUICardSchema.parse((await bookletService.getWorkspaceSnapshot(booklet.id)).activeCard));
    await cardService.submit(booklet.id, { responseId: "00000000-0000-4000-8000-000000000924", cardId: String(audienceReview.cardId), action: "approve_and_continue" });
    const storyTurn = await chatService.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000925", role: "user", parts: [{ type: "text", text: "Show me the story plan." }] });
    const storyRun = storyTurn.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!storyRun || storyRun.type !== "data-card") throw new Error("Expected Story Plan Agent run.");
    const storyReview = await runSoleAgentCard(bookletService, cardService, booklet.id, storyRun.data);

    expect(storyReview).toMatchObject({ family: "artifact_review", variant: "summary", payload: { artifactType: "story_plan" } });
    expect(await createRepositories(database).evidence.countQualityReviews(booklet.id)).toBe(0);
  });

  it("revises a Story Plan conversationally while preserving its existing visual subjects", async () => {
    const { database, bookletService, chatService, cardService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await bookletService.create({ idea: "A robin learns to share rainwater in a bright garden." });
    const first = await chatService.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000931", role: "user", parts: [{ type: "text", text: "Please begin." }] });
    const question = first.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!question || question.type !== "data-card") throw new Error("Expected intake card.");
    const intakeCard = await runSoleAgentCard(bookletService, cardService, booklet.id, question.data);
    const intakeResponseId = "00000000-0000-4000-8000-000000000932";
    await cardService.submit(booklet.id, { responseId: intakeResponseId, cardId: intakeCard.cardId, action: "select", value: "6-8" });
    await chatService.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000933", role: "user", metadata: { schemaVersion: "1", bookletId: booklet.id, responseId: intakeResponseId }, parts: [{ type: "text", text: "Ages 6–8" }] });
    const audienceCard = await runSoleAgentCard(bookletService, cardService, booklet.id, genUICardSchema.parse((await bookletService.getWorkspaceSnapshot(booklet.id)).activeCard));
    await cardService.submit(booklet.id, { responseId: "00000000-0000-4000-8000-000000000934", cardId: String(audienceCard.cardId), action: "approve_and_continue" });
    const draft = await chatService.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000935", role: "user", parts: [{ type: "text", text: "Draft the Story Plan." }] });
    const storyCard = draft.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!storyCard || storyCard.type !== "data-card") throw new Error("Expected Story Plan review.");
    const storyReview = await runSoleAgentCard(bookletService, cardService, booklet.id, storyCard.data);
    const before = await new ArtifactService({ database }).get(booklet.id, "story_plan");
    const beforeContent = before.currentVersion?.content as { characters: Array<{ entityId: string }>; settings: Array<{ entityId: string }> };
    const revisionResponseId = "00000000-0000-4000-8000-000000000936";
    await cardService.submit(booklet.id, { responseId: revisionResponseId, cardId: storyReview.cardId, action: "request_revision", revisionInstruction: "Make the middle moment more playful." });
    const revised = await chatService.createTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000937", role: "user", metadata: { schemaVersion: "1", bookletId: booklet.id, responseId: revisionResponseId }, parts: [{ type: "text", text: "Ignore this client text." }] });
    const revisionRun = revised.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!revisionRun || revisionRun.type !== "data-card") throw new Error("Expected revised Story Plan Agent run.");
    await runSoleAgentCard(bookletService, cardService, booklet.id, revisionRun.data);
    const after = await new ArtifactService({ database }).get(booklet.id, "story_plan");
    const afterContent = after.currentVersion?.content as { characters: Array<{ entityId: string }>; settings: Array<{ entityId: string }>; storyArc: string };

    expect(revised.assistantMessage.parts).toContainEqual(expect.objectContaining({ type: "data-card" }));
    expect(after.currentVersion?.versionNumber).toBe((before.currentVersion?.versionNumber ?? 0) + 1);
    expect(afterContent.characters.map((character) => character.entityId)).toEqual(beforeContent.characters.map((character) => character.entityId));
    expect(afterContent.settings.map((setting) => setting.entityId)).toEqual(beforeContent.settings.map((setting) => setting.entityId));
    expect(afterContent.storyArc).toContain("Make the middle moment more playful.");
  });



});
