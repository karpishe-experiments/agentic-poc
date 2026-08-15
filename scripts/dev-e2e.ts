import { spawn, spawnSync } from "node:child_process";

const executable = process.platform === "win32" ? "node.exe" : process.execPath;
const child = spawn(executable, ["node_modules/next/dist/bin/next", "dev", "--port", "3001"], {
  env: process.env,
  stdio: "inherit",
});

function stop(signal: NodeJS.Signals): void {
  if (child.killed) return;
  if (process.platform === "win32") {
    // `next dev` creates descendants on Windows; killing only the launcher keeps
    // Playwright's webServer hook open. Terminate just this known child tree.
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    child.kill(signal);
  }
  process.exit(0);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
child.once("exit", (code, signal) => process.exitCode = code ?? (signal ? 1 : 0));
