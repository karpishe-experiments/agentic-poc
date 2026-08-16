import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { Document } from "mongodb";
import { config } from "dotenv";
import { createMongoDatabase } from "@/db/client";
import { COLLECTION_NAMES, type CollectionName } from "@/db/documents";
import { createLegacyDatabase, type LegacyDatabase } from "@/db/legacy/client";
import { setupMongoStructure } from "@/db/setup";
import { verifyMongoData } from "@/db/verify";

const MIGRATIONS = path.join(process.cwd(), "db", "legacy", "migrations");
const BOOLEAN_COLUMNS = new Set(["is_active"]);
const JSON_FIELDS = new Set(["contentJson", "uiMessageJson", "cardJson", "valueJson", "metadataJson", "inputJson", "resultJson", "errorJson", "inputRefJson", "outputRefJson", "usageJson", "agentConfigSnapshotJson", "artifactVersionIdsJson", "issuesJson", "repairVersionIdsJson", "pageAssetIdsJson", "preflightJson"]);
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : item);
const camel = (name: string) => name.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
const digest = async (filename: string) => createHash("sha256").update(await readFile(filename)).digest("hex");
const safeError = (error: unknown) => (error instanceof Error ? error.message : "Unknown migration failure").replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[redacted MongoDB URI]").slice(0, 500);
const redactedMongoHost = (uri: string) => {
  const schemeEnd = uri.indexOf("://");
  if (schemeEnd < 0) return "mongodb";
  const authorityAndPath = uri.slice(schemeEnd + 3);
  const hostStart = authorityAndPath.lastIndexOf("@") + 1;
  return authorityAndPath.slice(hostStart).split(/[/?]/, 1)[0] || "mongodb";
};

type JournalEntry = { id: number; hash: string; createdAt: number };
type SqliteSnapshot = { quickCheck: "ok"; journal: JournalEntry[]; schema: Array<{ type: string; name: string; sql: string | null }>; counts: Record<string, number> };
type ImportedDocument = Document & { _id: string };
type CountMap = Record<CollectionName, number>;

function transformRow(row: Record<string, unknown>): ImportedDocument {
  if (typeof row.id !== "string" || !row.id) throw new Error("Every SQLite source row must have a non-empty string id.");
  const document: ImportedDocument = { _id: row.id };
  for (const [key, value] of Object.entries(row)) if (key !== "id") document[camel(key)] = BOOLEAN_COLUMNS.has(key) ? Boolean(value) : value;
  for (const field of JSON_FIELDS) if (document[field] !== null && document[field] !== undefined) {
    if (typeof document[field] !== "string") throw new Error(`${field} on ${document._id} is not serialized JSON.`);
    try { JSON.parse(document[field] as string); } catch { throw new Error(`${field} on ${document._id} contains invalid JSON.`); }
  }
  return document;
}

async function expectedMigrations() {
  const journal = JSON.parse(await readFile(path.join(MIGRATIONS, "meta", "_journal.json"), "utf8")) as { entries: Array<{ tag: string; when: number }> };
  return Promise.all(journal.entries.map(async (entry) => {
    const bytes = await readFile(path.join(MIGRATIONS, `${entry.tag}.sql`));
    const normalizedLf = Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
    return {
      hashes: new Set([
        createHash("sha256").update(bytes).digest("hex"),
        createHash("sha256").update(normalizedLf).digest("hex"),
      ]),
      createdAt: entry.when,
    };
  }));
}

async function inspectSqlite(database: LegacyDatabase): Promise<SqliteSnapshot> {
  const quick = await database.$client.execute("PRAGMA quick_check");
  if (String(Object.values(quick.rows[0] ?? {})[0]) !== "ok") throw new Error("SQLite PRAGMA quick_check failed.");
  const foreignKeys = await database.$client.execute("PRAGMA foreign_key_check");
  if (foreignKeys.rows.length) throw new Error("SQLite PRAGMA foreign_key_check found broken references.");
  let journalResult;
  try { journalResult = await database.$client.execute("select id, hash, created_at from __drizzle_migrations order by created_at, id"); } catch { throw new Error("SQLite migration journal is missing."); }
  const journal = journalResult.rows.map((row) => ({ id: Number(row.id), hash: String(row.hash), createdAt: Number(row.created_at) }));
  const expected = await expectedMigrations();
  if (journal.length < 1 || journal.length > expected.length) throw new Error("SQLite migration journal has an unsupported length.");
  journal.forEach((entry, index) => {
    const expectedEntry = expected[index];
    if (!expectedEntry?.hashes.has(entry.hash) || entry.createdAt !== expectedEntry.createdAt) throw new Error(`SQLite migration journal entry ${index + 1} is unknown, reordered, or tampered.`);
  });
  const tables = await database.$client.execute("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name <> '__drizzle_migrations' order by name");
  const schemaResult = await database.$client.execute("select type, name, sql from sqlite_master where name not like 'sqlite_%' and name <> '__drizzle_migrations' order by type, name");
  const schema = schemaResult.rows.map((row) => ({ type: String(row.type), name: String(row.name), sql: row.sql === null ? null : String(row.sql) }));
  const counts: Record<string, number> = {};
  for (const row of tables.rows) { const name = String(row.name); if (!/^[a-z0-9_]+$/.test(name)) throw new Error("SQLite contains an unsafe table name."); const count = await database.$client.execute(`select count(*) as count from ${name}`); counts[name] = Number(count.rows[0]?.count ?? 0); }
  return { quickCheck: "ok", journal, schema, counts };
}

async function snapshot(filename: string) { const database = createLegacyDatabase(`file:${filename.replaceAll("\\", "/")}`); try { return await inspectSqlite(database); } finally { await database.$client.close(); } }
async function checkpoint(filename: string) {
  const database = createLegacyDatabase(`file:${filename.replaceAll("\\", "/")}`);
  try {
    const before = await inspectSqlite(database), checkpointResult = await database.$client.execute("PRAGMA wal_checkpoint(FULL)");
    const checkpointRow = checkpointResult.rows[0] as Record<string, unknown> | undefined;
    if (checkpointRow && (Number(checkpointRow.busy ?? 0) !== 0 || Number(checkpointRow.log ?? 0) !== Number(checkpointRow.checkpointed ?? checkpointRow.log ?? 0))) throw new Error("SQLite WAL checkpoint is busy or incomplete; stop all writers and retry.");
    const after = await inspectSqlite(database); if (canonical(before) !== canonical(after)) throw new Error("SQLite logical state changed while checkpointing; stop all writers and retry."); return { before, after };
  } finally { await database.$client.close(); }
}
function requireIds(known: Set<string>, values: unknown[], label: string) { const missing = values.filter((value): value is string => typeof value === "string" && value.length > 0 && !known.has(value)); if (missing.length) throw new Error(`${label} contains missing references: ${missing.slice(0, 5).join(", ")}.`); }
function validateSource(documents: Map<CollectionName, ImportedDocument[]>) {
  const rows = (name: CollectionName) => documents.get(name) ?? [];
  for (const name of COLLECTION_NAMES) if (!documents.has(name)) throw new Error(`Required SQLite table ${name} is missing.`);
  const ids = (name: CollectionName) => new Set(rows(name).map((row) => row._id));
  const booklets = ids("booklets"), artifacts = ids("artifacts"), versions = ids("artifact_versions"), messages = ids("messages"), cards = ids("cards"), assets = ids("assets"), jobs = ids("generation_jobs"), definitions = ids("agent_definitions"), agentVersions = ids("agent_versions"), responses = ids("card_responses"), reviews = ids("quality_reviews"), approvals = ids("approvals");
  requireIds(booklets, [...rows("artifacts"), ...rows("messages"), ...rows("cards"), ...rows("assets"), ...rows("generation_jobs"), ...rows("model_calls"), ...rows("quality_reviews"), ...rows("approvals"), ...rows("exports")].map((x) => x.bookletId), "booklet references");
  requireIds(artifacts, [...rows("artifact_versions").map((x) => x.artifactId), ...rows("cards").map((x) => x.artifactId)], "artifact references");
  requireIds(versions, [...rows("artifacts").map((x) => x.currentVersionId), ...rows("artifact_versions").map((x) => x.sourceVersionId), ...rows("artifact_dependencies").flatMap((x) => [x.downstreamVersionId, x.upstreamVersionId]), ...rows("model_calls").map((x) => x.artifactVersionId), ...rows("approvals").map((x) => x.artifactVersionId), ...rows("exports").map((x) => x.artifactVersionId)], "artifact-version references");
  requireIds(messages, [...rows("cards").map((x) => x.messageId), ...rows("card_responses").map((x) => x.followupMessageId)], "message references"); requireIds(cards, rows("card_responses").map((x) => x.cardId), "card references");
  requireIds(assets, [...rows("booklets").map((x) => x.coverAssetId), ...rows("assets").map((x) => x.sourceAssetId), ...rows("style_catalog").map((x) => x.previewAssetId), ...rows("generation_items").map((x) => x.assetId), ...rows("exports").flatMap((x) => [x.assetId, ...JSON.parse(String(x.pageAssetIdsJson)) as unknown[]])], "asset references");
  requireIds(jobs, [...rows("generation_items").map((x) => x.jobId), ...rows("model_calls").map((x) => x.jobId)], "job references"); requireIds(definitions, [...rows("agent_versions").map((x) => x.agentId), ...rows("model_calls").map((x) => x.agentDefinitionId)], "agent-definition references"); requireIds(agentVersions, [...rows("agent_versions").map((x) => x.parentVersionId), ...rows("agent_version_events").map((x) => x.agentVersionId), ...rows("model_calls").map((x) => x.agentVersionId)], "agent-version references");
  requireIds(responses, rows("approvals").map((x) => x.cardResponseId), "approval response references"); requireIds(reviews, rows("approvals").map((x) => x.qualityReviewId), "approval review references"); requireIds(approvals, rows("approvals").map((x) => x.sourceApprovalId), "approval lineage");
  const artifactById = new Map(rows("artifacts").map((row) => [row._id, row])), versionById = new Map(rows("artifact_versions").map((row) => [row._id, row])), messageById = new Map(rows("messages").map((row) => [row._id, row])), cardById = new Map(rows("cards").map((row) => [row._id, row]));
  for (const artifact of rows("artifacts")) if (artifact.currentVersionId && versionById.get(String(artifact.currentVersionId))?.artifactId !== artifact._id) throw new Error(`Artifact ${artifact._id} points to an incompatible current version.`);
  for (const card of rows("cards")) { if (card.messageId && messageById.get(String(card.messageId))?.bookletId !== card.bookletId) throw new Error(`Card ${card._id} references a message from another booklet.`); if (card.artifactId && artifactById.get(String(card.artifactId))?.bookletId !== card.bookletId) throw new Error(`Card ${card._id} references an artifact from another booklet.`); }
  for (const response of rows("card_responses")) { const card = cardById.get(String(response.cardId)); if (response.followupMessageId && messageById.get(String(response.followupMessageId))?.bookletId !== card?.bookletId) throw new Error(`Card response ${response._id} references a follow-up message from another booklet.`); }
  for (const review of rows("quality_reviews")) { requireIds(versions, JSON.parse(String(review.artifactVersionIdsJson)) as unknown[], `Review ${review._id} artifact versions`); if (review.repairVersionIdsJson) requireIds(versions, JSON.parse(String(review.repairVersionIdsJson)) as unknown[], `Review ${review._id} repair versions`); }
  const active = rows("agent_versions").filter((x) => x.isActive); if (active.filter((x) => x.role === "manager").length !== 1 || active.filter((x) => x.role === "specialist").length !== 7 || new Set(active.filter((x) => x.role === "specialist").map((x) => x.skillId)).size !== 7) throw new Error("SQLite runtime-agent coverage is incomplete or conflicting.");
}
async function atomicJson(filename: string, value: unknown) { const temporary = `${filename}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" }); await rename(temporary, filename); }

export type SqliteMongoMigrationOptions = { sourcePath: string; mongoUri: string; mongoDatabase: string; targetDatabase: string; confirmWritesStopped: boolean; outputRoot?: string; dataRoot?: string; now?: Date };
export async function migrateSqliteToMongo(options: SqliteMongoMigrationOptions) {
  if (!options.confirmWritesStopped) throw new Error("Pass --confirm-writes-stopped after stopping every SQLite writer.");
  if (options.targetDatabase !== options.mongoDatabase) throw new Error("--target-database must exactly match MONGODB_DATABASE.");
  const sourcePath = path.resolve(options.sourcePath); await stat(sourcePath);
  const timestamp = (options.now ?? new Date()).toISOString().replace(/[:.]/g, "-"); const runDirectory = path.resolve(options.outputRoot ?? path.join(process.cwd(), "output", "backups", "mongodb-atlas", timestamp));
  const backupPath = path.join(runDirectory, "source.db"), workingPath = path.join(runDirectory, "working.db"), manifestPath = path.join(runDirectory, "manifest.json"), reportPath = path.join(runDirectory, "migration-report.json");
  if ([backupPath, workingPath].includes(sourcePath)) throw new Error("SQLite source, backup, and working-copy paths must be distinct."); await mkdir(runDirectory, { recursive: true });
  let original: SqliteSnapshot | undefined; let targetAttempted = false;
  const inserted = Object.fromEntries(COLLECTION_NAMES.map((name) => [name, 0])) as CountMap, alreadyPresent = Object.fromEntries(COLLECTION_NAMES.map((name) => [name, 0])) as CountMap, failed = Object.fromEntries(COLLECTION_NAMES.map((name) => [name, 0])) as CountMap;
  try {
    const checked = await checkpoint(sourcePath); original = checked.before; const sourceSha256 = await digest(sourcePath); await copyFile(sourcePath, backupPath); const backupSha256 = await digest(backupPath); if (backupSha256 !== sourceSha256) throw new Error("SQLite backup hash does not match the closed source.");
    const backupState = await snapshot(backupPath); if (canonical(backupState) !== canonical(checked.after)) throw new Error("Verified backup logical state differs from the source."); await copyFile(backupPath, workingPath);
    const legacy = createLegacyDatabase(`file:${workingPath.replaceAll("\\", "/")}`), documents = new Map<CollectionName, ImportedDocument[]>(); let workingState: SqliteSnapshot;
    try { await migrate(legacy, { migrationsFolder: MIGRATIONS }); workingState = await inspectSqlite(legacy); if (workingState.journal.length !== (await expectedMigrations()).length) throw new Error("Working copy did not reach the latest supported migration."); for (const name of COLLECTION_NAMES) { let result; try { result = await legacy.$client.execute(`select * from ${name}`); } catch { throw new Error(`Required SQLite table ${name} is missing.`); } documents.set(name, result.rows.map((row) => transformRow(row as Record<string, unknown>))); } } finally { await legacy.$client.close(); }
    validateSource(documents);
    const sourceInfo = await stat(sourcePath), backupInfo = await stat(backupPath); const manifest = { schemaVersion: "1", createdAt: (options.now ?? new Date()).toISOString(), source: { path: sourcePath, byteSize: sourceInfo.size, sha256: sourceSha256, beforeCheckpoint: original, afterCheckpoint: checked.after }, backup: { path: backupPath, byteSize: backupInfo.size, sha256: backupSha256, snapshot: backupState, verified: true }, workingCopy: { path: workingPath, journal: workingState.journal } }; await atomicJson(manifestPath, manifest);
    targetAttempted = true; const target = createMongoDatabase({ uri: options.mongoUri, databaseName: options.mongoDatabase });
    try {
      await setupMongoStructure(target);
      for (const name of COLLECTION_NAMES) {
        const collection = target.database.collection<ImportedDocument>(name), sourceRows = documents.get(name)!;
        const sourceById = new Map(sourceRows.map((document) => [document._id, document]));
        for (const existing of await collection.find().toArray()) {
          const expected = sourceById.get(existing._id);
          if (!expected) throw new Error(`Target collection ${name} contains extra record ${existing._id}.`);
          if (canonical(existing) !== canonical(expected)) throw new Error(`Target conflict in ${name} for source id ${existing._id}.`);
          alreadyPresent[name] += 1;
        }
      }
      for (const name of COLLECTION_NAMES) { const collection = target.database.collection<ImportedDocument>(name); for (const document of documents.get(name)!) if (!(await collection.findOne({ _id: document._id }))) try { await collection.insertOne(document); inserted[name] += 1; } catch (error) { failed[name] += 1; throw error; } }
      const verification = await verifyMongoData(target, options.dataRoot), sourceCounts = Object.fromEntries(COLLECTION_NAMES.map((name) => [name, documents.get(name)!.length])) as CountMap; const mismatch = COLLECTION_NAMES.filter((name) => verification.counts[name] !== sourceCounts[name]); if (mismatch.length) throw new Error(`Reconciliation count mismatch: ${mismatch.join(", ")}.`);
      if (canonical(await snapshot(sourcePath)) !== canonical(original)) throw new Error("SQLite source logical state changed during import.");
      const report = { schemaVersion: "1", status: "passed", manifestPath, source: { path: sourcePath, sha256: sourceSha256, journal: original.journal, counts: original.counts }, backup: { path: backupPath, sha256: backupSha256, journal: backupState.journal, counts: backupState.counts, verified: true }, workingCopy: { path: workingPath, journal: workingState.journal }, target: { databaseName: options.mongoDatabase, redactedHost: redactedMongoHost(options.mongoUri) }, collections: Object.fromEntries(COLLECTION_NAMES.map((name) => [name, { source: sourceCounts[name], inserted: inserted[name], alreadyPresent: alreadyPresent[name], failed: failed[name], target: verification.counts[name] }])), integrity: { references: "passed", activeAgentCoverage: "passed", sourceUnchanged: true }, unresolvedAssetUris: verification.unresolvedAssetUris, completedAt: new Date().toISOString() }; await atomicJson(reportPath, report); return { runDirectory, manifestPath, reportPath, report };
    } finally { await target.close(); }
  } catch (error) { const report = { schemaVersion: "1", status: "failed", target: targetAttempted ? { databaseName: options.mongoDatabase, redactedHost: "[redacted]" } : null, inserted, alreadyPresent, failed, error: safeError(error), completedAt: new Date().toISOString() }; try { await atomicJson(reportPath, report); } catch { /* Retain original failure. */ } throw new Error(safeError(error)); }
  finally {
    if (original && canonical(await snapshot(sourcePath)) !== canonical(original)) {
      const message = "SQLite source logical state changed during migration.";
      await writeFile(reportPath, `${JSON.stringify({ schemaVersion: "1", status: "failed", target: targetAttempted ? { databaseName: options.mongoDatabase, redactedHost: "[redacted]" } : null, inserted, alreadyPresent, failed, error: message, completedAt: new Date().toISOString() }, null, 2)}\n`);
      throw new Error(message);
    }
  }
}

function argument(name: string) { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
if (process.argv[1]?.endsWith("import-sqlite-to-mongodb.ts")) { config({ path: ".env.local" }); const sourcePath = argument("--source"), targetDatabase = argument("--target-database"), mongoUri = process.env.MONGODB_URI, mongoDatabase = process.env.MONGODB_DATABASE; if (!sourcePath || !targetDatabase) throw new Error("Pass --source <path> and --target-database <name> explicitly."); if (!mongoUri || !mongoDatabase) throw new Error("MONGODB_URI and MONGODB_DATABASE are required."); console.log(JSON.stringify(await migrateSqliteToMongo({ sourcePath, mongoUri, mongoDatabase, targetDatabase, confirmWritesStopped: process.argv.includes("--confirm-writes-stopped"), dataRoot: argument("--data-root") }), null, 2)); }
