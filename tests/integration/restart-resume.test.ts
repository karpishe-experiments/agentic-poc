import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { BookletService } from "@/lib/application/booklet-service";
import { CardService } from "@/lib/application/card-service";
import { ChatService } from "@/lib/application/chat-service";

const databases: Array<ReturnType<typeof createDatabase>> = [];
afterEach(() => databases.splice(0).forEach((database) => database.$client.close()));

describe("restart recovery", () => {
  it("returns an interrupted card follow-up and only the running generation item to pending", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "kids-restart-"));
    const database = createDatabase(`file:${path.join(directory, "booklets.db")}`);
    databases.push(database);
    await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
    const booklet = await new BookletService({ database }).create({ idea: "A robin shares a puddle." });
    const chat = new ChatService({ database });
    const cardService = new CardService({ database });
    const repositories = createRepositories(database);

    const turn = await chat.createFakeTurn(booklet.id, {
      id: "00000000-0000-4000-8000-000000000a01", role: "user", parts: [{ type: "text", text: "Begin." }],
    });
    const card = turn.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!card || card.type !== "data-card") throw new Error("Expected intake card.");
    const responseId = "00000000-0000-4000-8000-000000000a02";
    await cardService.submit(booklet.id, { cardId: card.data.cardId, responseId, action: "select", value: "6-8" });
    expect(await repositories.conversation.claimCardFollowup({ bookletId: booklet.id, responseId })).toMatchObject({ status: "claimed" });

    const jobId = "00000000-0000-4000-8000-000000000a03";
    const itemId = "00000000-0000-4000-8000-000000000a04";
    await repositories.jobs.createOrGet({
      id: jobId, bookletId: booklet.id, jobType: "pages", idempotencyKey: `pages:restart:${booklet.id}`, input: { pagePlanVersionId: "restart" },
      items: [{ id: itemId, itemKey: "page:restart", position: 0, input: { pageId: "restart" } }], createdAtMs: Date.now(),
    });
    expect(await repositories.jobs.claimNextPending(jobId, Date.now())).toMatchObject({ id: itemId, attemptCount: 1 });

    expect(await repositories.conversation.recoverInterruptedFollowups()).toBe(1);
    expect(await repositories.jobs.recoverInterrupted()).toBe(1);
    expect(await repositories.conversation.claimCardFollowup({ bookletId: booklet.id, responseId })).toMatchObject({ status: "claimed" });
    expect(await repositories.jobs.getItems(jobId)).toMatchObject([{ id: itemId, status: "pending", attemptCount: 1 }]);
    expect(await repositories.jobs.listRunnable()).toEqual(expect.arrayContaining([{ id: jobId, bookletId: booklet.id, jobType: "pages" }]));
  });
});
