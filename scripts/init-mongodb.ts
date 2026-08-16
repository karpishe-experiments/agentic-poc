import { config } from "dotenv";
import { getDatabase } from "@/db/client";
import { seedDefaultAgents, setupMongoStructure } from "@/db/setup";
config({ path: ".env.local" }); const database = getDatabase(); try { await setupMongoStructure(database); await seedDefaultAgents(database); console.log(`MongoDB structure and runtime-agent defaults are ready in ${database.database.databaseName}.`); } finally { await database.close(); }
