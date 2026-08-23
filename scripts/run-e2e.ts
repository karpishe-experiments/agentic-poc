import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createMongoDatabase } from "@/db/client";
import { seedVisualAssets } from "@/db/seed";
import { seedDefaultAgents, setupMongoStructure } from "@/db/setup";

const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
process.env.MONGODB_URI = replicaSet.getUri();
process.env.MONGODB_DATABASE = "kids_booklet_e2e";
process.env.DATA_ROOT = "./output/playwright/runtime/assets";
process.env.MODEL_RUNTIME = "fake";
process.env.IMAGE_PROVIDER_MODE = "fake";
process.env.OPENAI_API_KEY ??= "e2e-fake-key";
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
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", port], { env: process.env, stdio: "inherit" });

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
  const playwright = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
    env: { ...process.env, PLAYWRIGHT_REUSE_SERVER: "1", PLAYWRIGHT_BASE_URL: baseUrl }, stdio: "inherit",
  });
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => playwright.once("exit", (code, signal) => resolve({ code, signal })));
  exitCode = result.code ?? (result.signal ? 1 : 0);
} finally {
  stopServer();
  await replicaSet.stop();
}
process.exit(exitCode);
