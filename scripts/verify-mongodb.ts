import { config } from "dotenv";
import { createMongoDatabase } from "@/db/client";
import { verifyMongoStructure } from "@/db/setup";
import { verifyMongoData } from "@/db/verify";
import { getServerEnv, resolveDataRoot } from "@/lib/config/env";

config({ path: ".env.local" });
const env = getServerEnv();
const database = createMongoDatabase({ uri: env.MONGODB_URI, databaseName: env.MONGODB_DATABASE });
try {
  if (process.argv.includes("--structure-only")) {
    await verifyMongoStructure(database); console.log("MongoDB connectivity and exact indexes passed.");
  } else {
    const verification = await verifyMongoData(database, resolveDataRoot(env));
    console.log(JSON.stringify({ database: database.database.databaseName, ...verification }, null, 2));
  }
} finally { await database.close(); }
