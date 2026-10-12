import type { TestProject } from "vitest/node";

type MongoMemoryServerModule = typeof import("mongodb-memory-server");

const TEST_ONLY_ENVIRONMENT: Record<string, string> = {
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "local",
  ASSET_STORAGE: "filesystem",
  MODEL_RUNTIME: "fake",
  IMAGE_PROVIDER_MODE: "fake",
  DIFY_BOOKLET_RUNNER_ENABLED: "false",
  DIFY_COMMUNITY_PROBE_ENABLED: "false",
  OPENAI_API_KEY: "test-only-no-provider-key",
};

function configureTestOnlyEnvironment(): void {
  Object.assign(process.env, TEST_ONLY_ENVIRONMENT);
}

async function loadMongoMemoryServer(): Promise<MongoMemoryServerModule> {
  try {
    return await import("mongodb-memory-server");
  } catch {
    throw new Error("Mongo integration prerequisites require the installed mongodb-memory-server dependency.");
  }
}

async function verifyMongoPrerequisites({ DryMongoBinary }: MongoMemoryServerModule): Promise<string | undefined> {
  const nodeMajorVersion = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
  if (!Number.isSafeInteger(nodeMajorVersion) || nodeMajorVersion < 22) {
    throw new Error("Mongo integration prerequisites require Node.js 22 or newer.");
  }

  try {
    const options = await DryMongoBinary.generateOptions();
    const binaryPath = await DryMongoBinary.locateBinary(options);
    if (!binaryPath) {
      if (process.env.MONGOMS_RUNTIME_DOWNLOAD === "false") throw new Error("No cached MongoDB test binary is available in offline mode.");
      // Fresh Linux CI retains the supported library download path. The check
      // runs before test selection, never after an expensive integration case.
      console.log("Test prerequisites: MongoDB binary must be provisioned before integration startup.");
      return undefined;
    }
    return binaryPath;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new Error(
      `Mongo integration prerequisites failed before startup: ${reason} ` +
        "Install the configured mongodb-memory-server binary in the local cache or enable its supported download path.",
    );
  }
}

export default async function setup({ provide }: TestProject) {
  configureTestOnlyEnvironment();
  const mongoMemoryServer = await loadMongoMemoryServer();
  const systemBinary = await verifyMongoPrerequisites(mongoMemoryServer);
  const replicaSet = await mongoMemoryServer.MongoMemoryReplSet.create({
    ...(systemBinary ? { binary: { systemBinary } } : {}),
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  provide("mongodbUri", replicaSet.getUri());
  return async () => { await replicaSet.stop(); };
}

declare module "vitest" { export interface ProvidedContext { mongodbUri: string } }
