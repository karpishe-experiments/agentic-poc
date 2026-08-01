import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { BookletService, type Clock, type IdGenerator } from "@/lib/application/booklet-service";
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

async function createService(clock: Clock): Promise<BookletService> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kids-booklet-integration-"));
  const database = createDatabase(`file:${path.join(directory, "booklets.db")}`);
  temporaryDatabases.push(database);
  await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
  return new BookletService({ database, ids: deterministicIds(), clock });
}

describe("BookletService", () => {
  it("creates the complete persisted initial booklet state and lists the newest booklet first", async () => {
    let now = Date.UTC(2026, 7, 1, 9, 0, 0);
    const service = await createService({ now: () => now });

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
    const service = await createService({ now: () => Date.UTC(2026, 7, 1) });
    await expect(service.getWorkspaceSnapshot("00000000-0000-4000-8000-000000000999")).rejects.toMatchObject({ name: "BookletNotFoundError" });
  });
});
