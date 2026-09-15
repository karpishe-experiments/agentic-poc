import { getDatabase } from "@/db/client";
import { initializeMongoData } from "@/db/initialize";
import { createAssetStore } from "@/lib/assets/create-asset-store";

if (process.env.RUNNER_ENABLED !== "false") throw new Error("Initialization requires RUNNER_ENABLED=false.");
const database = getDatabase();
try {
  await initializeMongoData(database, createAssetStore());
  console.log(JSON.stringify({ initialized: true, database: database.database.databaseName }));
} finally { await database.close(); }
