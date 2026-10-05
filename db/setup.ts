import { MongoServerError, type Document, type IndexDescriptionInfo } from "mongodb";
import type { MongoDatabaseContext } from "@/db/client";
import { COLLECTION_NAMES } from "@/db/documents";
import { LEGACY_ARTIFACT_INDEX, REQUIRED_INDEXES } from "@/db/indexes";
import { AGENT_SEED_ACTOR, AGENT_SEED_TIMESTAMP, agentSeedDefaults } from "@/db/agent-defaults";

const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
});

function indexMatches(actual: IndexDescriptionInfo, key: Document, options: { unique?: boolean; sparse?: boolean; partialFilterExpression?: Document } = {}): boolean {
  return canonical(actual.key) === canonical(key)
    && Boolean(actual.unique) === Boolean(options.unique)
    && Boolean(actual.sparse) === Boolean(options.sparse)
    && canonical(actual.partialFilterExpression ?? null) === canonical(options.partialFilterExpression ?? null);
}

async function verifyRetainedArtifactIndex(context: MongoDatabaseContext): Promise<void> {
  const indexes = await context.collections.artifacts.listIndexes().toArray();
  const retained = indexes.find((index) => index.name === LEGACY_ARTIFACT_INDEX.name);
  if (retained && !indexMatches(retained, LEGACY_ARTIFACT_INDEX.key as Document, LEGACY_ARTIFACT_INDEX.options))
    throw new Error(`MongoDB index ${LEGACY_ARTIFACT_INDEX.name} exists with incompatible keys or options.`);
}

export async function verifyMongoStructure(context: MongoDatabaseContext): Promise<void> {
  const existingCollections = new Set((await context.database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name));
  for (const name of COLLECTION_NAMES) if (!existingCollections.has(name)) throw new Error(`MongoDB collection ${name} is missing.`);
  await verifyRetainedArtifactIndex(context);
  for (const required of REQUIRED_INDEXES) {
    const indexes = await context.database.collection(required.collection).listIndexes().toArray();
    const named = indexes.find((index) => index.name === required.name);
    if (!named || !indexMatches(named, required.key as Document, required.options)) throw new Error(`MongoDB index ${required.name} is missing or incompatible.`);
  }
}

export async function setupMongoStructure(context: MongoDatabaseContext): Promise<void> {
  await context.database.command({ ping: 1 });
  const existingCollections = new Set((await context.database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name));
  for (const name of COLLECTION_NAMES) {
    if (existingCollections.has(name)) continue;
    try { await context.database.createCollection(name); } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 48)) throw error;
    }
  }
  await verifyRetainedArtifactIndex(context);
  for (const required of REQUIRED_INDEXES) {
    const collection = context.database.collection(required.collection);
    const indexes = await collection.listIndexes().toArray();
    const named = indexes.find((index) => index.name === required.name);
    if (named) {
      if (!indexMatches(named, required.key as Document, required.options)) throw new Error(`MongoDB index ${required.name} exists with incompatible keys or options.`);
      continue;
    }
    const sameKey = indexes.find((index) => canonical(index.key) === canonical(required.key));
    if (sameKey) throw new Error(`MongoDB index ${sameKey.name} conflicts with required index ${required.name}.`);
    await collection.createIndex(required.key, { name: required.name, ...required.options });
  }
  const probeId = "__mongodb_setup_transaction_probe__";
  if (await context.collections.booklets.findOne({ _id: probeId })) throw new Error(`Reserved setup probe ${probeId} already exists.`);
  const session = context.client.startSession();
  try {
    await session.withTransaction(async () => {
      await context.collections.booklets.insertOne({ _id: probeId, schemaVersion: "probe", workingTitle: "probe", lifecycle: "draft", currentStage: "audience_profile", coverAssetId: null, createdAtMs: 0, updatedAtMs: 0 }, { session });
      await context.collections.booklets.deleteOne({ _id: probeId }, { session });
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
  } finally { await session.endSession(); }
  if (await context.collections.booklets.findOne({ _id: probeId })) throw new Error("MongoDB transaction probe left an unexpected record.");
  await verifyMongoStructure(context);
}

function seedDocuments() {
  const definitions = agentSeedDefaults.map((version) => ({ _id: version.agentId, createdAtMs: AGENT_SEED_TIMESTAMP, createdBy: AGENT_SEED_ACTOR }));
  const versions = agentSeedDefaults.map((version) => ({
    _id: version.id, agentId: version.agentId, versionNumber: version.versionNumber, parentVersionId: version.parentVersionId,
    displayName: version.displayName, purpose: version.purpose, role: version.role, skillId: version.skillId, imageTarget: version.imageTarget, instructions: version.instructions,
    provider: version.provider, modelId: version.modelId, reasoningEffort: version.reasoningEffort, maxTurns: version.maxTurns, profileId: version.profileId, profileVersion: version.profileVersion, imageQuality: version.imageQuality, imageResolution: version.imageResolution, status: version.status,
    isActive: version.isActive, revision: version.revision, createdAtMs: AGENT_SEED_TIMESTAMP, updatedAtMs: AGENT_SEED_TIMESTAMP, createdBy: version.createdBy, updatedBy: version.updatedBy,
  }));
  const events = agentSeedDefaults.flatMap((version) => (["create", "confirm", "activate"] as const).map((action) => ({
    _id: version.id.replace("00000000b", `00000000${action === "create" ? "c" : action === "confirm" ? "d" : "e"}`),
    agentId: version.agentId, agentVersionId: version.id, action, actor: AGENT_SEED_ACTOR,
    metadataJson: JSON.stringify({ schemaVersion: "1", seed: true }), createdAtMs: AGENT_SEED_TIMESTAMP,
  })));
  return { definitions, versions, events };
}


export async function seedDefaultAgents(context: MongoDatabaseContext): Promise<void> {
  const { definitions, versions, events } = seedDocuments();
  await context.collections.agent_definitions.insertMany(definitions);
  await context.collections.agent_versions.insertMany(versions);
  await context.collections.agent_version_events.insertMany(events);
  const managers = await context.collections.agent_versions.countDocuments({ isActive: true, role: "manager" });
  const specialists = await context.collections.agent_versions.countDocuments({ isActive: true, role: "specialist" });
  if (managers !== 1 || specialists < 7) throw new Error("Default runtime-agent coverage is incomplete or conflicting.");
}
