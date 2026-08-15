import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { createDatabase } from "@/db/client";

type BackupOptions = {
  databaseUrl: string;
  workspaceRoot?: string;
  outputRoot?: string;
  now?: Date;
};

type MigrationRow = { id: number; hash: string; created_at: number };

function resolveLocalFileDatabase(databaseUrl: string, workspaceRoot: string): string {
  if (!databaseUrl.startsWith("file:") || databaseUrl.includes(":memory:") || databaseUrl.includes("?") || databaseUrl.includes("#")) {
    throw new Error("DATABASE_URL must be a local file: path; memory, remote, and parameterized targets are refused.");
  }
  const source = path.resolve(workspaceRoot, decodeURIComponent(databaseUrl.slice("file:".length)));
  const relative = path.relative(workspaceRoot, source);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("DATABASE_URL must resolve to a file inside this workspace.");
  }
  return source;
}

async function inspectDatabase(filename: string): Promise<{ migrations: MigrationRow[]; bookletCount: number }> {
  const database = createDatabase(`file:${filename.replaceAll("\\", "/")}`);
  try {
    const migrations = await database.$client.execute("select id, hash, created_at from __drizzle_migrations order by created_at");
    const booklets = await database.$client.execute("select count(*) as booklet_count from booklets");
    return {
      migrations: migrations.rows.map((row) => ({ id: Number(row.id), hash: String(row.hash), created_at: Number(row.created_at) })),
      bookletCount: Number(booklets.rows[0]?.booklet_count ?? 0),
    };
  } finally {
    database.$client.close();
  }
}

export async function backupLocalDatabase(options: BackupOptions) {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
  const source = resolveLocalFileDatabase(options.databaseUrl, workspaceRoot);
  await stat(source);
  const checkpoint = createDatabase(`file:${source.replaceAll("\\", "/")}`);
  try {
    await checkpoint.$client.execute("PRAGMA wal_checkpoint(FULL)");
  } finally {
    checkpoint.$client.close();
  }
  const sourceState = await inspectDatabase(source);
  const timestamp = (options.now ?? new Date()).toISOString().replace(/[:.]/g, "-");
  const backupDirectory = path.join(options.outputRoot ?? path.join(workspaceRoot, "output", "backups", "agent-management"), timestamp);
  const backupPath = path.join(backupDirectory, "booklets.db");
  await mkdir(backupDirectory, { recursive: true });
  await copyFile(source, backupPath);
  const bytes = await readFile(backupPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const verified = await inspectDatabase(backupPath);
  if (verified.bookletCount !== sourceState.bookletCount || JSON.stringify(verified.migrations) !== JSON.stringify(sourceState.migrations)) {
    throw new Error("Backup verification failed: the migration journal or booklet count differs from the source database.");
  }
  const manifest = {
    schemaVersion: "1",
    sourcePath: source,
    byteSize: bytes.byteLength,
    sha256,
    preMigrationJournal: sourceState.migrations,
    bookletCount: sourceState.bookletCount,
    createdAt: (options.now ?? new Date()).toISOString(),
  };
  await writeFile(path.join(backupDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { backupPath, manifestPath: path.join(backupDirectory, "manifest.json"), manifest };
}

if (process.argv[1]?.endsWith("backup-local-db.ts")) {
  config({ path: ".env.local" });
  const databaseUrl = process.env.DATABASE_URL ?? "file:./data/booklets.db";
  const result = await backupLocalDatabase({ databaseUrl });
  console.log(JSON.stringify(result, null, 2));
}
