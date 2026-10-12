import { afterEach, expect, it } from "vitest";
import { withMongoTransaction, type Database } from "@/db/client";
import { withOperationBudget } from "@/lib/operations/budget";
import { createTestDatabase, closeTestDatabase } from "@/tests/helpers/mongodb";

let database: Database | undefined;
afterEach(async () => { if (database) await closeTestDatabase(database); database = undefined; });

it("reads find and aggregate getMore batches inside a bounded transaction", async () => {
  database = await createTestDatabase({ seedAgents: false });
  const db = database;
  await db.collections.deployment_control.insertMany(Array.from({ length: 5 }, (_, index) => ({
    _id: `cursor-${index}`, schemaVersion: "1" as const, environment: `cursor-${index}`, maintenance: false,
    reason: null, activeMutations: 0, updatedAtMs: index,
  })));
  await withOperationBudget(Date.now() + 10_000, () => withMongoTransaction(db, async (session) => {
    const found = await db.collections.deployment_control.find({}, { session, batchSize: 1 }).toArray();
    const aggregated = await db.collections.deployment_control.aggregate([{ $match: {} }], { session, batchSize: 1 }).toArray();
    expect(found).toHaveLength(5);
    expect(aggregated).toHaveLength(5);
  }));
});
