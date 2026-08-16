import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { TestProject } from "vitest/node";

export default async function setup({ provide }: TestProject) {
  const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  provide("mongodbUri", replicaSet.getUri());
  return async () => { await replicaSet.stop(); };
}

declare module "vitest" { export interface ProvidedContext { mongodbUri: string } }
