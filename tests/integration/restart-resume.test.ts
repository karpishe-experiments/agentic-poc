import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { createRepositories } from "@/db/repositories";
import { BookletService } from "@/lib/application/booklet-service";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

describe("restart recovery", () => {
  it("returns an interrupted card follow-up and only the running generation item to pending", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "A robin shares a puddle." });
    const repositories = createRepositories(database);
    const jobId = "00000000-0000-4000-8000-000000000a03";
    const itemId = "00000000-0000-4000-8000-000000000a04";
    const pausedJobId = "00000000-0000-4000-8000-000000000a05";
    const pausedItemId = "00000000-0000-4000-8000-000000000a06";
    await repositories.jobs.createOrGet({
      id: jobId, bookletId: booklet.id, jobType: "pages", idempotencyKey: `pages:restart:${booklet.id}`, input: { pagePlanVersionId: "restart" },
      items: [{ id: itemId, itemKey: "page:restart", position: 0, input: { pageId: "restart" } }], createdAtMs: Date.now(),
    });
    expect(await repositories.jobs.claimNextPending(jobId, Date.now())).toMatchObject({ id: itemId, attemptCount: 1 });
    await repositories.jobs.createOrGet({
      id: pausedJobId, bookletId: booklet.id, jobType: "pages", idempotencyKey: `pages:paused-retry:${booklet.id}`, input: { pagePlanVersionId: "paused" },
      items: [{ id: pausedItemId, itemKey: "page:paused", position: 0, input: { pageId: "paused" } }], createdAtMs: Date.now(),
    });
    expect(await repositories.jobs.claimNextPending(pausedJobId, Date.now(), true)).toMatchObject({ id: pausedItemId, attemptCount: 1 });

    expect(await repositories.conversation.recoverInterruptedFollowups()).toBe(0);
    expect(await repositories.jobs.recoverInterrupted()).toBe(2);
    expect(await repositories.jobs.getItems(jobId)).toMatchObject([{ id: itemId, status: "pending", attemptCount: 1 }]);
    expect(await repositories.jobs.getStatus(pausedJobId)).toMatchObject({ status: "paused", items: [{ id: pausedItemId, status: "pending", attemptCount: 1 }] });
    expect(await repositories.jobs.listRunnable()).toEqual(expect.arrayContaining([{ id: jobId, bookletId: booklet.id, jobType: "pages" }]));
    expect(await repositories.jobs.listRunnable()).not.toEqual(expect.arrayContaining([{ id: pausedJobId, bookletId: booklet.id, jobType: "pages" }]));
  });
});
