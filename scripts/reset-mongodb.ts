import { config } from "dotenv";
import { getDatabase } from "@/db/client";
import { resetMongoData } from "@/db/reset";
import { getServerEnv, resolveDataRoot } from "@/lib/config/env";
config({ path: ".env.local" });
const env = getServerEnv();
const database = getDatabase();
try { const verification = await resetMongoData(database, resolveDataRoot(env)); console.log(JSON.stringify({ database: database.database.databaseName, reset: true, ...verification }, null, 2)); }
finally { await database.close(); }
