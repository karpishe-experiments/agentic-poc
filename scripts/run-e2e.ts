import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createMongoDatabase } from "@/db/client";
import { seedVisualAssets } from "@/db/seed";
import { seedDefaultAgents, setupMongoStructure } from "@/db/setup";

const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
const difyExperiment = process.argv.includes("--dify-experiment");
process.env.MONGODB_URI = replicaSet.getUri();
process.env.MONGODB_DATABASE = "kids_booklet_e2e";
const dataRoot = await mkdtemp(join(tmpdir(), "booklet-e2e-assets-"));
process.env.DATA_ROOT = dataRoot;
process.env.MODEL_RUNTIME = "fake";
process.env.IMAGE_PROVIDER_MODE = "fake";
process.env.OPENAI_API_KEY ??= "e2e-fake-key";
if (difyExperiment) {
  process.env.DEPLOYMENT_ENV = "local";
  process.env.DIFY_EXPERIMENT_ENABLED = "true";
  process.env.DIFY_EXPERIMENT_MODE = "fake";
  process.env.DIFY_IMAGE_ENABLED = "true";
}
const database = createMongoDatabase({ uri: process.env.MONGODB_URI, databaseName: process.env.MONGODB_DATABASE });
await setupMongoStructure(database);
await seedDefaultAgents(database);
await seedVisualAssets(database, process.env.DATA_ROOT);
await database.close();

async function reservePort(): Promise<string> {
  const reservation = createServer();
  return await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      if (!address || typeof address === "string") { reject(new Error("Could not reserve an E2E port.")); return; }
      reservation.close((error) => error ? reject(error) : resolve(String(address.port)));
    });
  });
}

const port = process.env.E2E_PORT ?? await reservePort();
const baseUrl = `http://${difyExperiment ? "localhost" : "127.0.0.1"}:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", difyExperiment ? "dev" : "start", "--port", port], { env: process.env, stdio: "inherit" });

function stopServer(): void {
  if (server.killed) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
  else server.kill("SIGTERM");
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The server is still warming up.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The isolated Playwright server did not become ready within 120 seconds.");
}

let exitCode = 1;
try {
  await waitForServer();
  const playwright = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2).filter((argument) => argument !== "--dify-experiment")], {
    env: { ...process.env, PLAYWRIGHT_REUSE_SERVER: "1", PLAYWRIGHT_BASE_URL: baseUrl }, stdio: "inherit",
  });
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => playwright.once("exit", (code, signal) => resolve({ code, signal })));
  exitCode = result.code ?? (result.signal ? 1 : 0);
} finally {
  stopServer();
  await replicaSet.stop();
  if (resolve(dataRoot).startsWith(`${resolve(tmpdir())}${sep}`) && basename(dataRoot).startsWith("booklet-e2e-assets-")) {
    await rm(dataRoot, { recursive: true, force: true });
  }
}
process.exit(exitCode);
