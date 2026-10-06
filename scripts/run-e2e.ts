import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createMongoDatabase } from "@/db/client";
import { seedVisualAssets } from "@/db/seed";
import { seedDefaultAgents, setupMongoStructure } from "@/db/setup";

type E2eProfile = "legacy" | "experiment-runner";

function readProfile() {
  const passthrough: string[] = [];
  let requested = process.env.E2E_PROFILE;
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    let value: string | null = null;
    let profileArgument = false;
    if (argument === "--profile") {
      profileArgument = true;
      value = process.argv[++index] ?? null;
    } else if (argument.startsWith("--profile=")) {
      profileArgument = true;
      value = argument.slice("--profile=".length);
    }
    if (!profileArgument) {
      passthrough.push(argument);
      continue;
    }
    if (!value || requested && requested !== value) throw new Error("Specify one matching E2E profile through E2E_PROFILE or --profile.");
    requested = value;
  }
  const profile = (requested ?? "legacy") as E2eProfile;
  if (profile !== "legacy" && profile !== "experiment-runner") throw new Error("E2E profile must be legacy or experiment-runner.");
  return { profile, passthrough };
}

function runnerBindings() {
  const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
  const binding = (role: "manager" | "specialist" | "tester" | "image", taskId: string | null, suffix: string, persona: string | null = null) => ({
    role, taskId, persona, appId: id(`1${suffix}`), publishedWorkflowId: id(`2${suffix}`), toolProviderId: null, apiKey: `e2e-runner-${suffix}`,
  });
  return [binding("manager", null, "1"), binding("specialist", "J01", "2"), binding("specialist", "J02", "3"),
    binding("tester", null, "4", "playful_kid"), binding("tester", null, "5", "enthusiast_parent"), binding("tester", null, "6", "professional_creator")];
}

const { profile, passthrough } = readProfile();
const runnerProfile = profile === "experiment-runner";
process.env.E2E_PROFILE = profile;
if (process.env.E2E_PORT !== undefined && (!/^\d+$/.test(process.env.E2E_PORT) || Number(process.env.E2E_PORT) < 1 || Number(process.env.E2E_PORT) > 65_535)) {
  throw new Error("E2E_PORT must be an integer between 1 and 65535.");
}

const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
process.env.MONGODB_URI = replicaSet.getUri();
process.env.MONGODB_DATABASE = "kids_booklet_e2e";
const runnerDataRoot = runnerProfile ? await mkdtemp(join(tmpdir(), "kids-booklet-runner-e2e-")) : null;
process.env.DATA_ROOT = runnerDataRoot ?? "./output/playwright/runtime/assets";
process.env.MODEL_RUNTIME = "fake";
process.env.IMAGE_PROVIDER_MODE = "fake";
process.env.OPENAI_API_KEY ??= "e2e-fake-key";
if (runnerProfile) {
  process.env.DEPLOYMENT_ENV = "local";
  // The browser fixture owns all runner responses. Do not start the server-side
  // dispatcher while this profile is open, even if a route interception regresses.
  process.env.RUNNER_ENABLED = "false";
  process.env.DIFY_BOOKLET_RUNNER_ENABLED = "true";
  process.env.DIFY_BOOKLET_BASE_URL = "https://dify.invalid";
  process.env.DIFY_BOOKLET_PUBLIC_ORIGIN = "http://127.0.0.1";
  process.env.DIFY_BOOKLET_TOOL_KEY = "e2e-runner-tool-key-without-provider-access";
  process.env.DIFY_BOOKLET_BINDINGS_JSON = JSON.stringify(runnerBindings());
}
const database = createMongoDatabase({ uri: process.env.MONGODB_URI, databaseName: process.env.MONGODB_DATABASE });
await setupMongoStructure(database);
if (!runnerProfile) {
  await seedDefaultAgents(database);
  await seedVisualAssets(database, process.env.DATA_ROOT);
}

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
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", runnerProfile ? "dev" : "start", "--port", port,
  ...(runnerProfile ? ["--hostname", "127.0.0.1"] : [])], { env: process.env, stdio: "inherit" });

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
  const playwright = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test",
    ...(runnerProfile ? ["tests/e2e/experiment-runner.spec.ts"] : []), ...passthrough], {
    env: { ...process.env, PLAYWRIGHT_REUSE_SERVER: "1", PLAYWRIGHT_BASE_URL: baseUrl }, stdio: "inherit",
  });
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => playwright.once("exit", (code, signal) => resolve({ code, signal })));
  exitCode = result.code ?? (result.signal ? 1 : 0);
} finally {
  stopServer();
  if (runnerProfile) {
    await database.database.dropDatabase().catch(() => undefined);
    if (runnerDataRoot) await rm(runnerDataRoot, { recursive: true, force: true });
  }
  await database.close();
  await replicaSet.stop();
}
process.exit(exitCode);
