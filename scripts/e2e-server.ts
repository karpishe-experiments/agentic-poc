import { spawn, spawnSync } from "node:child_process";

process.env.OPENAI_API_KEY ??= "e2e-fake-key";

await import("./prepare-e2e");
const port = process.env.E2E_PORT ?? "3001";

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", port], {
  env: process.env,
  stdio: "inherit",
});

function stop(signal: NodeJS.Signals): void {
  if (child.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    child.kill(signal);
  }
  process.exit(0);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
child.once("exit", (code, signal) => process.exitCode = code ?? (signal ? 1 : 0));
