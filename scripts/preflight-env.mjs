import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parse } from "dotenv";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const placeholders = new Set(["", "replace-me", "your-api-key", "sk-..."]);

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

  const models = [
    values.OPENAI_MANAGER_MODEL?.trim() || "gpt-5.6-luna",
    values.OPENAI_SKILL_MODEL?.trim() || "gpt-5.6-terra",
    values.OPENAI_REVIEW_MODEL?.trim() || "gpt-5.6-sol",
    values.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2",
  ];
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

  console.log("PREFLIGHT_PASS: .env.local exists, is ignored, and all configured OpenAI aliases resolved");
}

await main();
