import { createClient } from "@libsql/client";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/legacy/sqlite-schema";

export function createLegacyDatabase(databaseUrl: string) {
  if (databaseUrl.startsWith("file:") && databaseUrl !== "file::memory:") {
    const localPath = databaseUrl.slice("file:".length); mkdirSync(path.dirname(path.resolve(process.cwd(), localPath)), { recursive: true });
  }
  const client = createClient({ url: databaseUrl }); return drizzle({ client, schema });
}
export type LegacyDatabase = ReturnType<typeof createLegacyDatabase>;
