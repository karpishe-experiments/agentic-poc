import { config } from "dotenv";
import { createMongoDatabase } from "@/db/client";
import { verifyMongoStructure } from "@/db/setup";
import { reconcileMigrationReport, verifyMongoData } from "@/db/verify";
import { getServerEnv, resolveDataRoot } from "@/lib/config/env";

config({ path: ".env.local" });
const env = getServerEnv();
const database = createMongoDatabase({ uri: env.MONGODB_URI, databaseName: env.MONGODB_DATABASE });
const argument = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
try {
  if (process.argv.includes("--structure-only")) {
    await verifyMongoStructure(database); console.log("MongoDB connectivity and exact indexes passed.");
  } else {
    const verification = await verifyMongoData(database, resolveDataRoot(env));
    const reportFilename = argument("--report");
    if (reportFilename) await reconcileMigrationReport(reportFilename, env.MONGODB_DATABASE, verification.counts);
    console.log(JSON.stringify({ database: database.database.databaseName, ...verification, reportReconciled: Boolean(reportFilename) }, null, 2));
  }
} finally { await database.close(); }
