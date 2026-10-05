import { afterEach, describe, expect, it } from "vitest";
import type { MongoDatabaseContext } from "@/db/client";
import { LEGACY_ARTIFACT_INDEX } from "@/db/indexes";
import { inspectArtifactIndexRetirement, retireLegacyArtifactIndex, setupMongoStructure } from "@/db/setup";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const databases: MongoDatabaseContext[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
const subjectName = "artifacts_booklet_type_subject_unique";
const replacementKey = { bookletId: 1, artifactType: 1, subjectKind: 1, subjectId: 1 };
async function database() {
  const value = await createTestDatabase({ seedAgents: false });
  databases.push(value);
  return value;
}
async function legacy(context: MongoDatabaseContext, options: Record<string, unknown> = { unique: true }) {
  await context.collections.artifacts.createIndex(LEGACY_ARTIFACT_INDEX.key, { name: LEGACY_ARTIFACT_INDEX.name, ...options });
}

describe("artifact index retirement catalog", () => {
  it("drops only the exact legacy index and preserves documents; repeat is idempotent", async () => {
    const context = await database();
    await legacy(context);
    const document = { _id: "saved", bookletId: "book", artifactType: "character_sheet", state: "draft", currentVersionId: null, createdAtMs: 1, updatedAtMs: 1 } as const;
    await context.collections.artifacts.insertOne(document);
    expect(await inspectArtifactIndexRetirement(context)).toBe("ready");
    expect(await retireLegacyArtifactIndex(context)).toBe("removed");
    expect(await retireLegacyArtifactIndex(context)).toBe("already_absent");
    expect(await context.collections.artifacts.findOne({ _id: "saved" })).toMatchObject(document);
    expect((await context.collections.artifacts.listIndexes().toArray()).map((index) => index.name)).toContain(subjectName);
  });

  it("accepts an already absent legacy index and startup never drops one", async () => {
    const context = await database();
    expect(await retireLegacyArtifactIndex(context)).toBe("already_absent");
    await legacy(context);
    await setupMongoStructure(context);
    expect(await inspectArtifactIndexRetirement(context)).toBe("ready");
  });

  it.each([
    ["missing", null, {}],
    ["reordered", { artifactType: 1, bookletId: 1, subjectKind: 1, subjectId: 1 }, { unique: true }],
    ["nonunique", replacementKey, {}],
    ["sparse", replacementKey, { unique: true, sparse: true }],
    ["partial", replacementKey, { unique: true, partialFilterExpression: { subjectId: { $exists: true } } }],
    ["hidden", replacementKey, { unique: true, hidden: true }],
    ["collation", replacementKey, { unique: true, collation: { locale: "en" } }],
  ])("rejects %s replacement before removal", async (_case, key, options) => {
    const context = await database();
    await context.collections.artifacts.dropIndex(subjectName);
    if (key) await context.collections.artifacts.createIndex(key, { name: subjectName, ...options });
    await legacy(context);
    await expect(retireLegacyArtifactIndex(context)).rejects.toThrow(subjectName);
    expect((await context.collections.artifacts.listIndexes().toArray()).some((index) => index.name === LEGACY_ARTIFACT_INDEX.name)).toBe(true);
  });

  it.each([
    ["nonunique", {}],
    ["sparse", { unique: true, sparse: true }],
    ["partial", { unique: true, partialFilterExpression: { artifactType: { $exists: true } } }],
    ["collation", { unique: true, collation: { locale: "en" } }],
  ])("rejects %s legacy drift", async (_case, options) => {
    const context = await database();
    await legacy(context, options);
    await expect(retireLegacyArtifactIndex(context)).rejects.toThrow(LEGACY_ARTIFACT_INDEX.name);
    expect((await context.collections.artifacts.listIndexes().toArray()).some((index) => index.name === LEGACY_ARTIFACT_INDEX.name)).toBe(true);
  });
});
