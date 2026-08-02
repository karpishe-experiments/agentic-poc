import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { BookletService, type Clock, type IdGenerator } from "@/lib/application/booklet-service";
import { ChatService } from "@/lib/application/chat-service";
import { CardService } from "@/lib/application/card-service";
import { createDatabase } from "@/db/client";
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

async function createServices(clock: Clock): Promise<{ bookletService: BookletService; chatService: ChatService; cardService: CardService }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kids-booklet-integration-"));
  const database = createDatabase(`file:${path.join(directory, "booklets.db")}`);
  temporaryDatabases.push(database);
  await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
  return {
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
    const { bookletService, chatService } = await createServices({ now: () => Date.UTC(2026, 7, 1) });
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
    expect(snapshot.activeCard).toMatchObject({ status: "active", family: "question" });
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
});
