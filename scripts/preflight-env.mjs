import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parse } from "dotenv";
import { createClient } from "@libsql/client";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const placeholders = new Set(["", "replace-me", "your-api-key", "sk-..."]);
// Keep this no-transpile startup script conservative: it validates the same
// checked-in text-model IDs accepted by lib/config/agent-models.ts before a
// network lookup. Adding a catalog model requires updating this guard too.
const supportedTextModels = new Set(["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]);
const expectedSpecialistSkills = new Set([
  "intake_readiness@1",
  "story_planning_revision@1",
  "quality_review_targeted_repair@1",
  "visual_direction_reference_planning@1",
  "booklet_specification@1",
  "page_planning_writing@1",
  "image_prompt_compilation@1",
]);

function fail(message) {
  console.error(`PREFLIGHT_FAIL: ${message}`);
  process.exitCode = 1;
}

async function main() {
  let values;
  try {
    values = parse(await readFile(envPath));
  } catch {
    fail(".env.local is missing or unreadable");
    return;
  }

  try {
    execFileSync("git", ["check-ignore", "--quiet", "--", ".env.local"], { cwd: root, stdio: "ignore" });
  } catch {
    fail(".env.local is not ignored by Git");
    return;
  }

  const apiKey = values.OPENAI_API_KEY?.trim();
  if (!apiKey || placeholders.has(apiKey)) {
    fail("OPENAI_API_KEY is missing, blank, or a placeholder");
    return;
  }

  let models;
  try {
    const client = createClient({ url: values.DATABASE_URL?.trim() || "file:./data/booklets.db" });
    const result = await client.execute("select role, skill_id, provider, model_id from agent_versions where is_active = 1");
    await client.close();
    const managers = result.rows.filter((row) => row.role === "manager" && row.skill_id === null && row.provider === "openai");
    const specialists = result.rows.filter((row) => row.role === "specialist" && typeof row.skill_id === "string" && row.provider === "openai");
    if (managers.length !== 1 || specialists.length !== expectedSpecialistSkills.size || new Set(specialists.map((row) => String(row.skill_id))).size !== expectedSpecialistSkills.size || specialists.some((row) => !expectedSpecialistSkills.has(String(row.skill_id))) || result.rows.some((row) => !supportedTextModels.has(String(row.model_id)))) {
      throw new Error("invalid active coverage");
    }
    models = [...new Set([...result.rows.map((row) => String(row.model_id)), values.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2"])];
  } catch {
    fail("agent configuration is unavailable; run npm run db:migrate before preflight");
    return;
  }
  const unavailable = [];

  for (const model of models) {
    try {
      const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) unavailable.push(`${model}:${response.status}`);
    } catch {
      unavailable.push(`${model}:network-or-client-error`);
    }
  }

  if (unavailable.length > 0) {
    fail(`unavailable model aliases: ${unavailable.join(", ")}`);
    return;
  }

  console.log("PREFLIGHT_PASS: .env.local exists, is ignored, and migrated active OpenAI aliases resolved");
}

await main();
