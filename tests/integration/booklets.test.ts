import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { BookletService, type Clock, type IdGenerator } from "@/lib/application/booklet-service";
import { ChatService } from "@/lib/application/chat-service";
import { CardService } from "@/lib/application/card-service";
import { ArtifactService } from "@/lib/application/artifact-service";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import { createDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { BOOKLET_ARTIFACT_TYPES } from "@/lib/contracts/domain";

const temporaryDatabases: Array<ReturnType<typeof createDatabase>> = [];

afterEach(() => {
  temporaryDatabases.splice(0).forEach((database) => database.$client.close());
});

function deterministicIds(): IdGenerator {
  let value = 100;
  return {
    next() {
      value += 1;
      return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
    },
  };
}

async function createServices(clock: Clock): Promise<{ database: ReturnType<typeof createDatabase>; bookletService: BookletService; chatService: ChatService; cardService: CardService }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kids-booklet-integration-"));
  const database = createDatabase(`file:${path.join(directory, "booklets.db")}`);
  temporaryDatabases.push(database);
  await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
  return {
    database,
    bookletService: new BookletService({ database, ids: deterministicIds(), clock }),
    chatService: new ChatService({ database }),
    cardService: new CardService({ database }),
  };
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

  it("returns a dedicated not-found error for a missing workspace", async () => {
    const { bookletService: service } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    await expect(service.getWorkspaceSnapshot("00000000-0000-4000-8000-000000000999")).rejects.toMatchObject({ name: "BookletNotFoundError" });
  });

  it("persists a deterministic fake turn and its active decision card", async () => {
    const { database, bookletService, chatService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await bookletService.create({ idea: "A robin learns why taking turns makes the garden kinder." });
    const turn = await chatService.createFakeTurn(booklet.id, {
      id: "00000000-0000-4000-8000-000000000901",
      role: "user",
      parts: [{ type: "text", text: "Please help me begin." }],
    });

    expect(turn.assistantMessage.parts.some((part) => part.type === "data-card")).toBe(true);
    const snapshot = await bookletService.getWorkspaceSnapshot(booklet.id);
    expect(snapshot.messages).toHaveLength(3);
    expect(snapshot.activeCard).toMatchObject({ family: "question", variant: "single_select", status: "active" });
    const calls = await createRepositories(database).evidence.listModelCalls(booklet.id);
    expect(calls).toMatchObject([
      { operation: "manager", skillId: null, status: "succeeded" },
      { operation: "skill", skillId: "intake_readiness@1", status: "succeeded" },
    ]);
    expect(calls[0]?.traceId).toBe(calls[1]?.traceId);
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ usage: { inputTokens: 0, outputTokens: 0 }, actualCostUsd: "0", estimatedCostUsd: "0", pricingVersion: "fake-runtime-v1", providerRequestId: null }),
    ]));
  });

  it("makes a repeated card response idempotent and collapses the submitted card", async () => {
    const { bookletService, chatService, cardService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await bookletService.create({ idea: "A little fox finds a new way home." });
    const turn = await chatService.createFakeTurn(booklet.id, {
      id: "00000000-0000-4000-8000-000000000902",
      role: "user",
      parts: [{ type: "text", text: "Please help me begin." }],
    });
    const card = turn.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!card || card.type !== "data-card") throw new Error("Expected a card from the fake runtime.");
    const response = {
      cardId: card.data.cardId,
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
    const initialTurn = await chatService.createFakeTurn(booklet.id, {
      id: "00000000-0000-4000-8000-000000000904",
      role: "user",
      parts: [{ type: "text", text: "Please help me begin." }],
    });
    const card = initialTurn.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!card || card.type !== "data-card") throw new Error("Expected a card from the fake runtime.");
    const responseId = "00000000-0000-4000-8000-000000000905";
    await cardService.submit(booklet.id, { cardId: card.data.cardId, responseId, action: "submit", value: "6-8" });

    const followup = await chatService.createFakeTurn(booklet.id, {
      id: "00000000-0000-4000-8000-000000000906",
      role: "user",
      metadata: { schemaVersion: "1", bookletId: booklet.id, responseId },
      parts: [{ type: "text", text: "This client summary is not authoritative." }],
    });
    const duplicateFollowup = await chatService.createFakeTurn(booklet.id, {
      id: "00000000-0000-4000-8000-000000000907",
      role: "user",
      metadata: { schemaVersion: "1", bookletId: booklet.id, responseId },
      parts: [{ type: "text", text: "Retrying the same saved decision." }],
    });
    const snapshot = await bookletService.getWorkspaceSnapshot(booklet.id);
    const persistedFirstCard = (snapshot.messages[2]?.message as { parts: Array<{ type: string; data?: { status?: string } }> }).parts
      .find((part) => part.type === "data-card");

    expect(followup.assistantMessage.id).toBe(duplicateFollowup.assistantMessage.id);
    expect(snapshot.messages).toHaveLength(5);
    expect(persistedFirstCard?.data?.status).toBe("submitted");
    expect(snapshot.activeCard).toMatchObject({ status: "active", family: "artifact_review", variant: "summary", payload: { artifactType: "audience_profile" } });
  });

  it("creates a deterministic recovery card for a conflicting later response and can reopen a prior card", async () => {
    const { bookletService, chatService, cardService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await bookletService.create({ idea: "A squirrel learns that asking for help can be brave." });
    const turn = await chatService.createFakeTurn(booklet.id, {
      id: "00000000-0000-4000-8000-000000000908",
      role: "user",
      parts: [{ type: "text", text: "Please help me begin." }],
    });
    const card = turn.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!card || card.type !== "data-card") throw new Error("Expected a card from the fake runtime.");
    await cardService.submit(booklet.id, {
      cardId: card.data.cardId,
      responseId: "00000000-0000-4000-8000-000000000909",
      action: "submit",
      value: "6-8",
    });
    const conflict = await cardService.submit(booklet.id, {
      cardId: card.data.cardId,
      responseId: "00000000-0000-4000-8000-000000000910",
      action: "submit",
      value: "3-5",
    });
    expect(conflict).toMatchObject({ kind: "conflict", recoveryCard: { family: "issue", variant: "recovery" } });

    const reopened = await cardService.reopen(booklet.id, card.data.cardId);
    expect(reopened).toMatchObject({ cardId: expect.not.stringMatching(card.data.cardId), status: "active", family: "question" });
    expect((await bookletService.getWorkspaceSnapshot(booklet.id)).activeCard).toMatchObject({ cardId: reopened.cardId, status: "active" });
  });

  it("advances from the approved audience review to the persisted Story Plan review", async () => {
    const { bookletService, chatService, cardService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await bookletService.create({ idea: "A robin learns to share rainwater in a bright garden." });
    const first = await chatService.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000921", role: "user", parts: [{ type: "text", text: "Please begin." }] });
    const question = first.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!question || question.type !== "data-card") throw new Error("Expected intake card.");
    const responseId = "00000000-0000-4000-8000-000000000922";
    await cardService.submit(booklet.id, { responseId, cardId: question.data.cardId, action: "select", value: "6-8" });
    await chatService.createFakeTurn(booklet.id, {
      id: "00000000-0000-4000-8000-000000000923",
      role: "user",
      metadata: { schemaVersion: "1", bookletId: booklet.id, responseId },
      parts: [{ type: "text", text: "Ages 6–8" }],
    });
    const audienceReview = (await bookletService.getWorkspaceSnapshot(booklet.id)).activeCard;
    if (!audienceReview || typeof audienceReview !== "object" || !("cardId" in audienceReview)) throw new Error("Expected audience review card.");
    await cardService.submit(booklet.id, { responseId: "00000000-0000-4000-8000-000000000924", cardId: String(audienceReview.cardId), action: "approve_and_continue" });
    const storyTurn = await chatService.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000925", role: "user", parts: [{ type: "text", text: "Show me the story plan." }] });
    const storyReview = storyTurn.assistantMessage.parts.find((part) => part.type === "data-card");

    expect(storyReview).toMatchObject({ type: "data-card", data: { family: "artifact_review", variant: "summary", payload: { artifactType: "story_plan" } } });
  });

  it("revises a Story Plan conversationally while preserving its existing visual subjects", async () => {
    const { database, bookletService, chatService, cardService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await bookletService.create({ idea: "A robin learns to share rainwater in a bright garden." });
    const first = await chatService.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000931", role: "user", parts: [{ type: "text", text: "Please begin." }] });
    const question = first.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!question || question.type !== "data-card") throw new Error("Expected intake card.");
    const intakeResponseId = "00000000-0000-4000-8000-000000000932";
    await cardService.submit(booklet.id, { responseId: intakeResponseId, cardId: question.data.cardId, action: "select", value: "6-8" });
    await chatService.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000933", role: "user", metadata: { schemaVersion: "1", bookletId: booklet.id, responseId: intakeResponseId }, parts: [{ type: "text", text: "Ages 6–8" }] });
    const audienceCard = (await bookletService.getWorkspaceSnapshot(booklet.id)).activeCard;
    if (!audienceCard || typeof audienceCard !== "object" || !("cardId" in audienceCard)) throw new Error("Expected audience review.");
    await cardService.submit(booklet.id, { responseId: "00000000-0000-4000-8000-000000000934", cardId: String(audienceCard.cardId), action: "approve_and_continue" });
    const draft = await chatService.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000935", role: "user", parts: [{ type: "text", text: "Draft the Story Plan." }] });
    const storyCard = draft.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!storyCard || storyCard.type !== "data-card") throw new Error("Expected Story Plan review.");
    const before = await new ArtifactService({ database }).get(booklet.id, "story_plan");
    const beforeContent = before.currentVersion?.content as { characters: Array<{ entityId: string }>; settings: Array<{ entityId: string }> };
    const revisionResponseId = "00000000-0000-4000-8000-000000000936";
    await cardService.submit(booklet.id, { responseId: revisionResponseId, cardId: storyCard.data.cardId, action: "request_revision", revisionInstruction: "Make the middle moment more playful." });
    const revised = await chatService.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000937", role: "user", metadata: { schemaVersion: "1", bookletId: booklet.id, responseId: revisionResponseId }, parts: [{ type: "text", text: "Ignore this client text." }] });
    const after = await new ArtifactService({ database }).get(booklet.id, "story_plan");
    const afterContent = after.currentVersion?.content as { characters: Array<{ entityId: string }>; settings: Array<{ entityId: string }>; storyArc: string };

    expect(revised.assistantMessage.parts).toContainEqual(expect.objectContaining({ type: "data-card" }));
    expect(after.currentVersion?.versionNumber).toBe((before.currentVersion?.versionNumber ?? 0) + 1);
    expect(afterContent.characters.map((character) => character.entityId)).toEqual(beforeContent.characters.map((character) => character.entityId));
    expect(afterContent.settings.map((setting) => setting.entityId)).toEqual(beforeContent.settings.map((setting) => setting.entityId));
    expect(afterContent.storyArc).toContain("Make the middle moment more playful.");
  });

  it("attempts one deterministic Story Plan repair and records both quality review outcomes", async () => {
    const { database, bookletService, chatService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await bookletService.create({ idea: "A quiet story about a garden." });
    const artifacts = new ArtifactService({ database });
    await artifacts.revise(booklet.id, "audience_profile", {
      schemaVersion: SCHEMA_VERSION, ageBand: "6-8", interests: ["gardens"], readingNeeds: "Short clear sentences.", tone: "Gentle", avoidList: [], knownFacts: ["garden"], openAssumptions: [],
    }, { createdBy: "agent" });
    const audience = await artifacts.get(booklet.id, "audience_profile");
    await artifacts.approve(booklet.id, "audience_profile", audience.currentVersion!.id);
    await artifacts.revise(booklet.id, "story_plan", {
      schemaVersion: SCHEMA_VERSION, premise: "A quiet story about a garden.", theme: "Care", characters: [], settings: [], storyArc: "A small wish becomes a kind action.", keyEvents: ["A seed is found."], ending: "The garden blooms.", ageFitNotes: "Suitable for ages 6–8.", continuityConstraints: [],
    }, { createdBy: "agent" });

    const turn = await chatService.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000941", role: "user", parts: [{ type: "text", text: "Check Story Plan quality." }] });
    const repaired = await artifacts.get(booklet.id, "story_plan");
    const content = repaired.currentVersion?.content as { characters: unknown[]; settings: unknown[]; continuityConstraints: string[] };

    expect(turn.assistantMessage.parts).toContainEqual(expect.objectContaining({ type: "data-card" }));
    expect(content.characters).toHaveLength(1);
    expect(content.settings).toHaveLength(1);
    expect(content.continuityConstraints).toHaveLength(1);
    expect(await createRepositories(database).evidence.countQualityReviews(booklet.id)).toBe(2);
  });

  it("stops after one rejected repair and presents a recoverable quality issue", async () => {
    const { database, bookletService, chatService, cardService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
    const booklet = await bookletService.create({ idea: "A robin shares a garden puddle." });
    const artifacts = new ArtifactService({ database });
    await artifacts.revise(booklet.id, "audience_profile", {
      schemaVersion: SCHEMA_VERSION, ageBand: "6-8", interests: ["gardens"], readingNeeds: "Short clear sentences.", tone: "Gentle", avoidList: [], knownFacts: ["garden"], openAssumptions: [],
    }, { createdBy: "agent" });
    const audience = await artifacts.get(booklet.id, "audience_profile");
    await artifacts.approve(booklet.id, "audience_profile", audience.currentVersion!.id);
    await artifacts.revise(booklet.id, "story_plan", {
      schemaVersion: SCHEMA_VERSION, premise: "A robin shares a garden puddle.", theme: "Care", characters: [{ entityId: "00000000-0000-4000-8000-000000000951", name: "Robin", narrativeRole: "hero", goal: "Share water", relationships: [], named: true, continuityRelevant: true, recurringVisualSubject: true }], settings: [{ entityId: "00000000-0000-4000-8000-000000000952", name: "Garden", narrativeRole: "main setting", named: true, continuityRelevant: true, recurringVisualSubject: true }], storyArc: "Robin learns to share.", keyEvents: ["Robin finds water."], ending: "Everyone shares.", ageFitNotes: "Suitable for ages 6–8.", continuityConstraints: ["Keep the garden calm."],
    }, { createdBy: "agent" });

    const turn = await chatService.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000953", role: "user", parts: [{ type: "text", text: "Check Story Plan quality [force-validation-failure]." }] });
    const issue = turn.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!issue || issue.type !== "data-card") throw new Error("Expected a quality issue card.");
    const accepted = await cardService.submit(booklet.id, { responseId: "00000000-0000-4000-8000-000000000954", cardId: issue.data.cardId, action: "accept_with_issue" });
    const review = await database.$client.execute({ sql: "select accepted_at_ms from quality_reviews where booklet_id = ?", args: [booklet.id] });

    expect(turn.assistantMessage.parts).toContainEqual(expect.objectContaining({ type: "data-card", data: expect.objectContaining({ family: "issue", variant: "quality" }) }));
    expect(accepted).toMatchObject({ followupRequired: false });
    expect(review.rows[0]?.accepted_at_ms).not.toBeNull();
    expect(await createRepositories(database).evidence.countQualityReviews(booklet.id)).toBe(1);
  });
});
