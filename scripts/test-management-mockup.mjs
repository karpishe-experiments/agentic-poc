import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const envFile = new URL("../next-env.d.ts", import.meta.url);
const tsconfigFile = new URL("../tsconfig.json", import.meta.url);
const originalEnv = readFileSync(envFile);
const originalTsconfig = readFileSync(tsconfigFile);
const child = spawn(
  process.execPath,
  [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config",
    "playwright.mockup.config.ts",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: process.env },
);

let restored = false;
const restore = () => {
  if (restored) return;
  writeFileSync(envFile, originalEnv);
  writeFileSync(tsconfigFile, originalTsconfig);
  restored = true;
};

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
process.on("exit", restore);

let code = 1;
try {
  code = await new Promise((resolve) =>
    child.on("exit", (value, signal) => resolve(value ?? (signal ? 1 : 0))),
  );
} finally {
  restore();
}
process.exit(code);
