import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { createMongoDatabase, type MongoDatabaseContext } from "@/db/client";
import { seedDefaultAgents, setupMongoStructure } from "@/db/setup";

export async function createTestDatabase(options: { seedAgents?: boolean } = {}): Promise<MongoDatabaseContext> {
  const uri = inject("mongodbUri");
  const database = createMongoDatabase({ uri, databaseName: `kids_booklet_test_${randomUUID().replaceAll("-", "_")}` });
  await setupMongoStructure(database); if (options.seedAgents !== false) await seedDefaultAgents(database); return database;
}
export async function closeTestDatabase(database: MongoDatabaseContext): Promise<void> {
  if (!/^kids_booklet_test_[0-9a-f_]+$/.test(database.database.databaseName)) throw new Error("Refusing to drop an unguarded test database.");
  await database.database.dropDatabase(); await database.close();
}
