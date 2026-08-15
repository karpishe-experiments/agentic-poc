import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createDatabase } from "@/db/client";
import { BookletService } from "@/lib/application/booklet-service";
import { backupLocalDatabase } from "@/scripts/backup-local-db";

describe("backupLocalDatabase", () => {
  it("refuses unsafe targets and writes a hash-verified readable backup", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "kids-local-backup-"));
    await expect(backupLocalDatabase({ databaseUrl: "file::memory:", workspaceRoot: workspace })).rejects.toThrow(/local file/i);
    await expect(backupLocalDatabase({ databaseUrl: "file:../outside.db", workspaceRoot: workspace })).rejects.toThrow(/inside this workspace/i);
    const databasePath = path.join(workspace, "data", "booklets.db");
    const database = createDatabase(`file:${databasePath.replaceAll("\\", "/")}`);
    await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
    await new BookletService({ database }).create({ idea: "A robin shares rainwater." });
    database.$client.close();

    const result = await backupLocalDatabase({ databaseUrl: "file:./data/booklets.db", workspaceRoot: workspace, outputRoot: path.join(workspace, "output"), now: new Date("2026-08-15T12:00:00.000Z") });

    expect(result.manifest).toMatchObject({ bookletCount: 1, byteSize: expect.any(Number), sha256: expect.stringMatching(/^[a-f0-9]{64}$/), preMigrationJournal: expect.any(Array) });
    await expect(readFile(result.manifestPath, "utf8")).resolves.toContain(result.manifest.sha256);
  });
});
