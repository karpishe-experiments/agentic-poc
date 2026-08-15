import { spawn, spawnSync } from "node:child_process";

process.env.DATABASE_URL = "file:./output/playwright/runtime/booklets.db";
process.env.DATA_ROOT = "./output/playwright/runtime/assets";
process.env.MODEL_RUNTIME = "fake";
process.env.IMAGE_PROVIDER_MODE = "fake";
process.env.OPENAI_API_KEY ??= "e2e-fake-key";
await import("./prepare-e2e");
const port = process.env.E2E_PORT ?? "3001";
const baseUrl = `http://127.0.0.1:${port}`;

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", port], { env: process.env, stdio: "inherit" });

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
}
// The tsx loader holds a worker handle under Node 24. The isolated server and
// Playwright child have both exited at this point, so terminate deterministically.
process.exit(exitCode);
