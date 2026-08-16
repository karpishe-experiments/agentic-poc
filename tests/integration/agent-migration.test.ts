import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createLegacyDatabase } from "@/db/legacy/client";
import { agentDefinitions, agentVersionEvents, agentVersions, modelCalls } from "@/db/legacy/sqlite-schema";
import { agentSeedDefaults } from "@/db/agent-defaults";

async function migratedDatabase() {
  const database = createLegacyDatabase("file::memory:");
  await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "legacy", "migrations") });
  return database;
}

describe("agent-management migration", () => {
  it("creates exact active seeded coverage on an empty database", async () => {
    const database = await migratedDatabase();
    const [definitions, versions, events] = await Promise.all([
      database.select().from(agentDefinitions),
      database.select().from(agentVersions),
      database.select().from(agentVersionEvents),
    ]);

    expect(definitions).toHaveLength(8);
    expect(versions).toHaveLength(8);
    expect(events).toHaveLength(24);
    expect(versions.filter((version) => version.isActive)).toHaveLength(8);
    expect(versions.filter((version) => version.role === "manager")).toHaveLength(1);
    expect(new Set(versions.filter((version) => version.skillId).map((version) => version.skillId)).size).toBe(7);
    expect(versions.map((version) => ({ id: version.id, modelId: version.modelId, status: version.status, revision: version.revision })).sort((left, right) => left.id.localeCompare(right.id))).toEqual(
      agentSeedDefaults.map((agent) => ({ id: agent.id, modelId: agent.modelId, status: agent.status, revision: agent.revision })).sort((left, right) => left.id.localeCompare(right.id)),
    );
  });

  it("retains legacy model-call rows with null agent attribution", async () => {
    const database = await migratedDatabase();
    const rows = await database.select({ definitionId: modelCalls.agentDefinitionId, versionId: modelCalls.agentVersionId, snapshot: modelCalls.agentConfigSnapshotJson }).from(modelCalls);
    expect(rows).toEqual([]);
  });

  it("upgrades a representative pre-agent database without rewriting legacy evidence", async () => {
    const staging = await mkdtemp(path.join(os.tmpdir(), "kids-pre-agent-migrations-"));
    const priorMigrations = path.join(staging, "migrations");
    await mkdir(path.join(priorMigrations, "meta"), { recursive: true });
    const sourceMigrations = path.join(process.cwd(), "db", "legacy", "migrations");
    await copyFile(path.join(sourceMigrations, "0000_left_sleepwalker.sql"), path.join(priorMigrations, "0000_left_sleepwalker.sql"));
    const journal = JSON.parse(await readFile(path.join(sourceMigrations, "meta", "_journal.json"), "utf8")) as { version: string; dialect: string; entries: unknown[] };
    await writeFile(path.join(priorMigrations, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }, null, 2));
    const database = createLegacyDatabase(`file:${path.join(staging, "legacy.db").replaceAll("\\", "/")}`);
    await migrate(database, { migrationsFolder: priorMigrations });
    const bookletId = "00000000-0000-4000-8000-000000009000";
    await database.$client.execute({
      sql: "insert into booklets (id, schema_version, working_title, lifecycle, current_stage, cover_asset_id, created_at_ms, updated_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [bookletId, "1", "A robin shares rainwater", "draft", "audience_profile", null, 1, 1],
    });
    await database.$client.execute({
      sql: "insert into model_calls (id, booklet_id, operation, skill_id, artifact_version_id, job_id, provider, model, trace_id, provider_request_id, status, attempt, started_at_ms, latency_ms, input_ref_json, output_ref_json, usage_json, actual_cost_usd, estimated_cost_usd, pricing_version, error_kind, error_message) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: ["00000000-0000-4000-8000-000000009001", bookletId, "manager", null, null, null, "fake", "fake-manager-v1", "legacy-trace", null, "succeeded", 1, 1, 1, "{}", null, "{}", "0", "0", "fake-runtime-v1", null, null],
    });

    await migrate(database, { migrationsFolder: sourceMigrations });

    await expect(database.select({ definitionId: modelCalls.agentDefinitionId, versionId: modelCalls.agentVersionId, snapshot: modelCalls.agentConfigSnapshotJson }).from(modelCalls)).resolves.toContainEqual({ definitionId: null, versionId: null, snapshot: null });
    await expect(database.select().from(agentVersions)).resolves.toHaveLength(8);
    database.$client.close();
  });
});
