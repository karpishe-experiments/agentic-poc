import { execFileSync } from "node:child_process";
import { access } from "node:fs/promises";
import { config } from "dotenv";
import { createMongoDatabase } from "@/db/client";
import { verifyMongoStructure } from "@/db/setup";
import { createRepositories } from "@/db/repositories";
import { AgentResolver } from "@/lib/application/agent-resolver";
import { getServerEnv } from "@/lib/config/env";

config({ path: ".env.local" });
await access(".env.local").catch(() => { throw new Error(".env.local is missing or unreadable."); });
try { execFileSync("git", ["check-ignore", "--quiet", "--", ".env.local"], { cwd: process.cwd(), stdio: "ignore" }); }
catch { throw new Error(".env.local must exist and be ignored by Git."); }

const env = getServerEnv();
if (["replace-me", "your-api-key", "sk-..."].includes(env.OPENAI_API_KEY.trim())) throw new Error("OPENAI_API_KEY is a placeholder.");
const database = createMongoDatabase({ uri: env.MONGODB_URI, databaseName: env.MONGODB_DATABASE });
try {
  await verifyMongoStructure(database);
  const repositories = createRepositories(database);
  await new AgentResolver({ database, repositories }).prepareCompleteActiveSet("real");
  const snapshot = await repositories.agents.getAdminSnapshot();
  const models = [...new Set([...snapshot.versions.filter((version) => version.isActive).map((version) => version.modelId), env.OPENAI_IMAGE_MODEL])];
  const unavailable: string[] = [];
  for (const model of models) try {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` } });
    if (!response.ok) unavailable.push(`${model}:${response.status}`);
  } catch { unavailable.push(`${model}:network-or-client-error`); }
  if (unavailable.length) throw new Error(`Unavailable model aliases: ${unavailable.join(", ")}.`);
  console.log("PREFLIGHT_PASS: ignored environment, MongoDB structure/coverage, and configured model access are valid.");
} finally { await database.close(); }
