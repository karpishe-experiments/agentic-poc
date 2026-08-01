import { spawnSync } from "node:child_process";

const preflight = spawnSync(process.execPath, ["scripts/preflight-env.mjs"], { stdio: "inherit" });
if (preflight.status !== 0) process.exit(preflight.status ?? 1);

console.error("Real evaluations are introduced in Slice 10. Supply a named fixture after that slice is complete.");
process.exit(1);
