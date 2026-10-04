import { config } from "dotenv";
import { createMongoDatabase } from "@/db/client";
import { verifyMongoStructure } from "@/db/setup";
import { verifyExperimentData, verifyMongoData } from "@/db/verify";
import { getServerEnv, resolveDataRoot } from "@/lib/config/env";

config({ path: ".env.local" });
const env = getServerEnv();
const database = createMongoDatabase({ uri: env.MONGODB_URI, databaseName: env.MONGODB_DATABASE });
try {
  if (process.argv.includes("--structure-only")) {
    await verifyMongoStructure(database); console.log("MongoDB connectivity and exact indexes passed.");
  } else if (env.DIFY_BOOKLET_RUNNER_ENABLED === "true") {
    await verifyMongoStructure(database);
    await verifyExperimentData(database);
    console.log(JSON.stringify({ database: database.database.databaseName, profile: "dify_booklet_v1", verified: true }));
  } else {
    const verification = await verifyMongoData(database, resolveDataRoot(env));
    console.log(JSON.stringify({ database: database.database.databaseName, ...verification }, null, 2));
  }
} finally { await database.close(); }
