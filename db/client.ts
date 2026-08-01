import { createClient } from "@libsql/client";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import { getServerEnv } from "@/lib/config/env";
import * as schema from "@/db/schema";

export function createDatabase(databaseUrl = getServerEnv().DATABASE_URL) {
  if (databaseUrl.startsWith("file:")) {
    const localPath = databaseUrl.slice("file:".length);
    mkdirSync(path.dirname(path.resolve(/* turbopackIgnore: true */ process.cwd(), localPath)), { recursive: true });
  }
  const client = createClient({ url: databaseUrl });
  return drizzle({ client, schema });
}

export type Database = ReturnType<typeof createDatabase>;
