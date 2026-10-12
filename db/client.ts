import { MongoClient, type ClientSession, type Db, type TransactionOptions } from "mongodb";
import { createCollectionHandles, type MongoCollections } from "@/db/collections";
import { getServerEnv } from "@/lib/config/env";
import { assertOperationBudget, remainingOperationMs } from "@/lib/operations/budget";
import { countTransactionAttempt } from "@/lib/experiment-runner/diagnostics";

const DATABASE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/;
const RESERVED_DATABASES = new Set(["admin", "config", "local"]);
const GLOBAL_DATABASE = Symbol.for("kids-booklet-poc.mongodb-context");

export type MongoDatabaseContext = { client: MongoClient; database: Db; collections: MongoCollections; close(): Promise<void> };
export type Database = MongoDatabaseContext;

export function validateMongoDatabaseName(databaseName: string): string {
  if (!DATABASE_NAME.test(databaseName) || RESERVED_DATABASES.has(databaseName.toLowerCase())) {
    throw new Error("MONGODB_DATABASE must be 1-63 letters, numbers, underscores, or hyphens, start with a letter or number, and not be admin, config, or local.");
  }
  return databaseName;
}

export function validateMongoUri(uri: string): string {
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri)) throw new Error("MONGODB_URI must use mongodb:// or mongodb+srv://.");
  return uri;
}

export function createMongoDatabase(input: { uri: string; databaseName: string }): MongoDatabaseContext {
  // Collection calls supply CSOT explicitly. A client-level timeout is copied
  // into insertMany's internal bulk operation and conflicts with withTransaction.
  const client = new MongoClient(validateMongoUri(input.uri), { maxPoolSize: 10, serverSelectionTimeoutMS: 5_000 });
  const database = client.db(validateMongoDatabaseName(input.databaseName));
  return { client, database, collections: createCollectionHandles(database), close: () => client.close() };
}

export function getDatabase(): MongoDatabaseContext {
  const state = globalThis as typeof globalThis & { [GLOBAL_DATABASE]?: MongoDatabaseContext };
  if (!state[GLOBAL_DATABASE]) {
    const env = getServerEnv();
    state[GLOBAL_DATABASE] = createMongoDatabase({ uri: env.MONGODB_URI, databaseName: env.MONGODB_DATABASE });
  }
  return state[GLOBAL_DATABASE];
}

const transactionOptions: TransactionOptions = { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" };

export async function withMongoTransaction<T>(context: MongoDatabaseContext, callback: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = context.client.startSession();
  try {
    return await session.withTransaction(async () => {
      countTransactionAttempt();
      assertOperationBudget();
      const result = await callback(session);
      // Check again before the driver commits, including on transaction retries.
      assertOperationBudget();
      return result;
    }, { ...transactionOptions, timeoutMS: remainingOperationMs(60_000) });
  } finally {
    await session.endSession();
  }
}
