import { config } from "dotenv";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDatabase } from "@/db/client";

config({ path: ".env.local" });

await migrate(createDatabase(), { migrationsFolder: "db/migrations" });
console.log("Database migrations completed.");
