import { afterEach, describe, expect, it } from "vitest";
import { withMongoTransaction, type MongoDatabaseContext } from "@/db/client";
import { resetMongoData } from "@/db/reset";
import { verifyMongoStructure } from "@/db/setup";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";

import { REQUIRED_INDEXES } from "@/db/indexes";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const databases: MongoDatabaseContext[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

describe("MongoDB foundation", () => {
  it("creates exact indexes from an empty database", async () => {
    const database = await createTestDatabase(); databases.push(database);
    await verifyMongoStructure(database);
    expect(await database.collections.agent_versions.countDocuments({ isActive: true })).toBe(10);
    expect(REQUIRED_INDEXES.length).toBeGreaterThan(20);
  });

  it("resets populated MongoDB and generated assets deterministically", async () => {
    const database = await createTestDatabase(); databases.push(database);
    const root = await mkdtemp(path.join(process.cwd(), "tmp-reset-"));
    try {
      await database.collections.booklets.insertOne({ _id: "old-booklet", schemaVersion: "1", workingTitle: "Old", lifecycle: "draft", currentStage: "audience_profile", coverAssetId: null, createdAtMs: 1, updatedAtMs: 1 });
      await writeFile(path.join(root, "old.txt"), "old");
      const first = await resetMongoData(database, root);
      expect(await database.collections.booklets.countDocuments()).toBe(0);
      expect(await database.collections.agent_versions.countDocuments({ isActive: true })).toBe(10);
      expect(first.unresolvedAssetUris).toEqual([]);
      const second = await resetMongoData(database, root);
      expect(second.counts).toEqual(first.counts);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("uses application string ids directly as _id and rolls back failed transactions", async () => {
    const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
    await database.collections.booklets.insertOne({ _id: "legacy-id", schemaVersion: "1", workingTitle: "Test", lifecycle: "draft", currentStage: "audience_profile", coverAssetId: null, createdAtMs: 1, updatedAtMs: 1 });
    expect(await database.collections.booklets.findOne({ _id: "legacy-id" })).toMatchObject({ _id: "legacy-id" });
    expect(await database.collections.booklets.findOne({ id: { $exists: true } } as never)).toBeNull();
    await expect(withMongoTransaction(database, async (session) => {
      await database.collections.booklets.insertOne({ _id: "rolled-back", schemaVersion: "1", workingTitle: "Rollback", lifecycle: "draft", currentStage: "audience_profile", coverAssetId: null, createdAtMs: 1, updatedAtMs: 1 }, { session });
      throw new Error("abort");
    })).rejects.toThrow("abort");
    expect(await database.collections.booklets.findOne({ _id: "rolled-back" })).toBeNull();
  });

  it("allows specialist candidates while active-manager partial indexes reject collisions", async () => {
    const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
    await database.collections.agent_definitions.insertMany([{ _id: "agent-a", createdAtMs: 1, createdBy: "test" }, { _id: "agent-b", createdAtMs: 1, createdBy: "test" }]);
    const version = (id: string, agentId: string, isActive: boolean) => ({ _id: id, agentId, versionNumber: 1, parentVersionId: null, displayName: id, purpose: "test", role: "manager", skillId: null, imageTarget: null, instructions: "test", provider: "openai", modelId: "gpt-5.6-terra", reasoningEffort: "medium", maxTurns: 1, profileId: null, profileVersion: null, imageQuality: null, imageResolution: null, status: isActive ? "confirmed" : "retired", isActive, revision: 1, createdAtMs: 1, updatedAtMs: 1, createdBy: "test", updatedBy: "test" });
    await database.collections.agent_versions.insertMany([version("inactive-a", "agent-a", false), version("inactive-b", "agent-b", false)]);
    await database.collections.agent_versions.updateOne({ _id: "inactive-a" }, { $set: { isActive: true, status: "confirmed" } });
    await expect(database.collections.agent_versions.updateOne({ _id: "inactive-b" }, { $set: { isActive: true, status: "confirmed" } })).rejects.toMatchObject({ code: 11000 });
  });
});
