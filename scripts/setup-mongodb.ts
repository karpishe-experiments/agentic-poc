import { config } from "dotenv";
import { getDatabase } from "@/db/client";
import { setupMongoStructure } from "@/db/setup";
config({ path: ".env.local" }); const database = getDatabase(); try { await setupMongoStructure(database); console.log(`MongoDB structure is ready in ${database.database.databaseName}.`); } finally { await database.close(); }
