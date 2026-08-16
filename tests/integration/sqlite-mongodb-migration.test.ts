import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, inject, it } from "vitest";
import { createMongoDatabase } from "@/db/client";
import { COLLECTION_NAMES } from "@/db/documents";
import { createLegacyDatabase } from "@/db/legacy/client";
import { reconcileMigrationReport, verifyMongoData } from "@/db/verify";
import { migrateSqliteToMongo } from "@/scripts/import-sqlite-to-mongodb";

const databases: Array<ReturnType<typeof createMongoDatabase>> = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(async (database) => { await database.database.dropDatabase(); await database.close(); })); });
const sha = async (filename: string) => createHash("sha256").update(await readFile(filename)).digest("hex");

async function sourceDatabase(root: string, priorOnly = false) {
  const source = path.join(root, "booklets.db");
  const migrations = priorOnly ? path.join(root, "prior-migrations") : path.join(process.cwd(), "db", "legacy", "migrations");
  if (priorOnly) {
    await mkdir(path.join(migrations, "meta"), { recursive: true });
    await copyFile(path.join(process.cwd(), "db", "legacy", "migrations", "0000_left_sleepwalker.sql"), path.join(migrations, "0000_left_sleepwalker.sql"));
    const journal = JSON.parse(await readFile(path.join(process.cwd(), "db", "legacy", "migrations", "meta", "_journal.json"), "utf8")) as { entries: unknown[] };
    await writeFile(path.join(migrations, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }));
  }
  const database = createLegacyDatabase(`file:${source.replaceAll("\\", "/")}`);
  await migrate(database, { migrationsFolder: migrations });
  await database.$client.execute({
    sql: "insert into booklets (id, schema_version, working_title, lifecycle, current_stage, cover_asset_id, created_at_ms, updated_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?)",
    args: ["legacy-booklet", "1", "Legacy booklet", "draft", "audience_profile", null, 1, 2],
  });
  await database.$client.close();
  return source;
}

describe("SQLite to MongoDB migration", () => {
  it.each([false, true])("imports a %s prior-schema source, preserves it, and safely reruns", async (priorOnly) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "kids-mongo-import-"));
    const source = await sourceDatabase(root, priorOnly); const originalHash = await sha(source);
    const uri = inject("mongodbUri"); const databaseName = `kids_booklet_test_${randomUUID().replaceAll("-", "_")}`;
    const options = { sourcePath: source, mongoUri: uri, mongoDatabase: databaseName, targetDatabase: databaseName, confirmWritesStopped: true, outputRoot: path.join(root, "first") };
    const first = await migrateSqliteToMongo(options);
    expect(first.report).toMatchObject({ status: "passed", target: { databaseName } });
    expect(first.report.collections.booklets.source).toBe(1);
    expect(await sha(source)).toBe(originalHash);
    const second = await migrateSqliteToMongo({ ...options, outputRoot: path.join(root, "second") });
    expect(second.report.collections.booklets.alreadyPresent).toBe(1);
    const target = createMongoDatabase({ uri, databaseName }); databases.push(target);
    await expect(reconcileMigrationReport(first.reportPath, databaseName, (await verifyMongoData(target)).counts)).resolves.toBeUndefined();
    expect(await target.collections.booklets.findOne({ _id: "legacy-booklet" })).toMatchObject({ workingTitle: "Legacy booklet" });
    for (const name of COLLECTION_NAMES) if (name !== "booklets") await target.database.collection(name).deleteMany({});
    const partial = await migrateSqliteToMongo({ ...options, outputRoot: path.join(root, "partial") });
    expect(partial.report.collections.booklets.alreadyPresent).toBe(1);
    expect(partial.report.collections.agent_versions.inserted).toBe(8);
    await target.collections.booklets.updateOne({ _id: "legacy-booklet" }, { $set: { workingTitle: "conflict" } });
    await expect(migrateSqliteToMongo({ ...options, outputRoot: path.join(root, "conflict") })).rejects.toThrow(/target conflict/i);
    const failedReport = await readFile(path.join(root, "conflict", "migration-report.json"), "utf8");
    expect(failedReport).toContain('"status": "failed"'); expect(failedReport).not.toContain(uri);
    expect(await sha(source)).toBe(originalHash);
  }, 30_000);

  it("requires explicit stopped-writer and exact target acknowledgements before target access", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "kids-mongo-guards-")); const source = await sourceDatabase(root);
    const uri = inject("mongodbUri"), databaseName = `kids_booklet_test_${randomUUID().replaceAll("-", "_")}`;
    await expect(migrateSqliteToMongo({ sourcePath: source, mongoUri: uri, mongoDatabase: databaseName, targetDatabase: databaseName, confirmWritesStopped: false, outputRoot: path.join(root, "unconfirmed") })).rejects.toThrow(/confirm-writes-stopped/i);
    await expect(migrateSqliteToMongo({ sourcePath: source, mongoUri: uri, mongoDatabase: databaseName, targetDatabase: "wrong", confirmWritesStopped: true, outputRoot: path.join(root, "wrong-target") })).rejects.toThrow(/exactly match/i);
    const target = createMongoDatabase({ uri, databaseName }); databases.push(target); expect(await target.database.listCollections().toArray()).toHaveLength(0);
  });

  it("rejects broken source references and tampered journals before target access", async () => {
    const uri = inject("mongodbUri");
    for (const failure of ["reference", "journal"] as const) {
      const root = await mkdtemp(path.join(os.tmpdir(), `kids-mongo-${failure}-`)), source = await sourceDatabase(root), legacy = createLegacyDatabase(`file:${source.replaceAll("\\", "/")}`);
      if (failure === "reference") {
        await legacy.$client.execute("PRAGMA foreign_keys=OFF");
        await legacy.$client.execute({ sql: "insert into assets (id, booklet_id, kind, uri, mime_type, width, height, source_asset_id, metadata_json, created_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", args: ["broken-asset", "missing-booklet", "page", "broken.png", "image/png", null, null, null, "{}", 1] });
      } else await legacy.$client.execute("insert into __drizzle_migrations (hash, created_at) values ('tampered', 9999999999999)");
      await legacy.$client.close();
      const databaseName = `kids_booklet_test_${randomUUID().replaceAll("-", "_")}`;
      await expect(migrateSqliteToMongo({ sourcePath: source, mongoUri: uri, mongoDatabase: databaseName, targetDatabase: databaseName, confirmWritesStopped: true, outputRoot: path.join(root, "output") })).rejects.toThrow(failure === "reference" ? /foreign_key_check|missing references/i : /unsupported|tampered/i);
      const target = createMongoDatabase({ uri, databaseName }); databases.push(target); expect(await target.database.listCollections().toArray()).toHaveLength(0);
    }
  });

  it("accepts an exact LF-normalized migration hash after a CRLF checkout", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "kids-mongo-line-endings-")), source = await sourceDatabase(root);
    const migration = await readFile(path.join(process.cwd(), "db", "legacy", "migrations", "0001_demonic_secret_warriors.sql"), "utf8");
    const normalizedHash = createHash("sha256").update(migration.replaceAll("\r\n", "\n")).digest("hex");
    const legacy = createLegacyDatabase(`file:${source.replaceAll("\\", "/")}`);
    await legacy.$client.execute({ sql: "update __drizzle_migrations set hash = ? where created_at = ?", args: [normalizedHash, 1786787955533] });
    await legacy.$client.close();
    const uri = inject("mongodbUri"), databaseName = `kids_booklet_test_${randomUUID().replaceAll("-", "_")}`;
    const result = await migrateSqliteToMongo({ sourcePath: source, mongoUri: uri, mongoDatabase: databaseName, targetDatabase: databaseName, confirmWritesStopped: true, outputRoot: path.join(root, "output") });
    expect(result.report).toMatchObject({ status: "passed", target: { databaseName } });
    const target = createMongoDatabase({ uri, databaseName }); databases.push(target);
  });

  it("rejects extra target records before importing source documents", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "kids-mongo-extra-")), source = await sourceDatabase(root), uri = inject("mongodbUri"), databaseName = `kids_booklet_test_${randomUUID().replaceAll("-", "_")}`;
    const target = createMongoDatabase({ uri, databaseName }); databases.push(target);
    await target.collections.booklets.insertOne({ _id: "extra", schemaVersion: "1", workingTitle: "Extra", lifecycle: "draft", currentStage: "audience_profile", coverAssetId: null, createdAtMs: 1, updatedAtMs: 1 });
    await expect(migrateSqliteToMongo({ sourcePath: source, mongoUri: uri, mongoDatabase: databaseName, targetDatabase: databaseName, confirmWritesStopped: true, outputRoot: path.join(root, "output") })).rejects.toThrow(/extra record/i);
    expect(await target.collections.booklets.findOne({ _id: "legacy-booklet" })).toBeNull();
  });

  it.each(["invalid-json", "missing-table", "corrupt-file"] as const)("rejects %s source state and writes a bounded failure report", async (failure) => {
    const root = await mkdtemp(path.join(os.tmpdir(), `kids-mongo-${failure}-`)), source = await sourceDatabase(root), uri = inject("mongodbUri"), databaseName = `kids_booklet_test_${randomUUID().replaceAll("-", "_")}`;
    if (failure === "corrupt-file") await writeFile(source, Buffer.from("not a sqlite database"));
    else {
      const legacy = createLegacyDatabase(`file:${source.replaceAll("\\", "/")}`);
      if (failure === "invalid-json") await legacy.$client.execute({ sql: "insert into assets (id, booklet_id, kind, uri, mime_type, width, height, source_asset_id, metadata_json, created_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", args: ["bad-json", null, "page", "bad-json.png", "image/png", null, null, null, "{bad", 1] });
      else await legacy.$client.execute("drop table exports");
      await legacy.$client.close();
    }
    const outputRoot = path.join(root, "output");
    await expect(migrateSqliteToMongo({ sourcePath: source, mongoUri: uri, mongoDatabase: databaseName, targetDatabase: databaseName, confirmWritesStopped: true, outputRoot })).rejects.toThrow();
    const report = await readFile(path.join(outputRoot, "migration-report.json"), "utf8"); expect(report).toContain('"status": "failed"'); expect(report.length).toBeLessThan(5_000); expect(report).not.toContain(uri);
    const target = createMongoDatabase({ uri, databaseName }); databases.push(target); expect(await target.database.listCollections().toArray()).toHaveLength(0);
  });

  it("checkpoints and imports a WAL-mode source", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "kids-mongo-wal-")), source = await sourceDatabase(root), legacy = createLegacyDatabase(`file:${source.replaceAll("\\", "/")}`);
    expect(String(Object.values((await legacy.$client.execute("PRAGMA journal_mode=WAL")).rows[0] ?? {})[0]).toLowerCase()).toBe("wal");
    await legacy.$client.execute("PRAGMA wal_autocheckpoint=0");
    await legacy.$client.execute({ sql: "insert into booklets (id, schema_version, working_title, lifecycle, current_stage, cover_asset_id, created_at_ms, updated_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?)", args: ["wal-booklet", "1", "WAL booklet", "draft", "audience_profile", null, 3, 4] });
    await legacy.$client.close();
    const uri = inject("mongodbUri"), databaseName = `kids_booklet_test_${randomUUID().replaceAll("-", "_")}`;
    const result = await migrateSqliteToMongo({ sourcePath: source, mongoUri: uri, mongoDatabase: databaseName, targetDatabase: databaseName, confirmWritesStopped: true, outputRoot: path.join(root, "output") });
    expect(result.report.collections.booklets).toMatchObject({ source: 2, target: 2 });
    const target = createMongoDatabase({ uri, databaseName }); databases.push(target);
  });
});
