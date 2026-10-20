import { MongoServerError, type Document, type IndexDescriptionInfo } from "mongodb";
import type { MongoDatabaseContext } from "@/db/client";
import { COLLECTION_NAMES } from "@/db/documents";
import { LEGACY_ARTIFACT_INDEX, REQUIRED_INDEXES } from "@/db/indexes";
import { AGENT_SEED_ACTOR, AGENT_SEED_TIMESTAMP, AGENT_SEED_SKILL_IDS, agentSeedDefaults } from "@/db/agent-defaults";
import type { AgentVersionDocument } from "@/db/documents";

export type ActiveAgentMetadata = Pick<AgentVersionDocument, "role" | "isActive" | "skillId" | "imageTarget" | "profileId" | "profileVersion">;
/** Shared availability predicate; historical integrity auditing uses the same rule. */
export function assertActiveAgentCoverage(versions: ActiveAgentMetadata[]): void {
  const managers = versions.filter(x => x.isActive && x.role === "manager");
  const specialists = versions.filter(x => x.isActive && x.role === "specialist");
  const imageTargets = new Set(versions.filter(x => x.isActive && x.role === "image" && x.profileId && x.profileVersion).map(x => x.imageTarget));
  if (managers.length !== 1 || new Set(specialists.map(x => x.skillId)).size !== AGENT_SEED_SKILL_IDS.length || specialists.some(x => !x.skillId || !AGENT_SEED_SKILL_IDS.includes(x.skillId as never) || !x.profileId || !x.profileVersion) || !imageTargets.has("reference") || !imageTargets.has("page"))
    throw new Error("Active runtime-agent coverage must contain one manager and at least one profiled candidate for every registered specialist and image target.");
}

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

// Catalog checks cannot run inside a Mongo transaction. Admission calls this
// before preparing sheet work; it never changes or removes an index.
export async function verifySheetStorageReady(context: MongoDatabaseContext): Promise<void> {
  const indexes = await context.collections.artifacts.listIndexes().toArray();
  const required = REQUIRED_INDEXES.find((item) => item.name === "artifacts_booklet_type_subject_unique")!;
  const current = indexes.find((item) => item.name === required.name);
  if (!current || !indexMatches(current, required.key as Document, required.options)) throw new Error("Sheet storage requires the verified subject-aware artifact index.");
  if (indexes.some((item) => item.name === LEGACY_ARTIFACT_INDEX.name)) throw new Error("Sheet storage is blocked by the retained legacy artifact index; use authorized maintenance.");
}

// Call only after the caller has verified the target environment, closed admission,
// drained work, stopped the application, and completed a verified backup.
// This catalog helper owns none of those maintenance or authorization gates.
export async function inspectArtifactIndexRetirement(context: MongoDatabaseContext): Promise<"ready" | "already_absent"> {
  const indexes = await context.collections.artifacts.listIndexes().toArray();
  const replacement = REQUIRED_INDEXES.find((item) => item.name === "artifacts_booklet_type_subject_unique")!;
  const exact = (actual: IndexDescriptionInfo | undefined, expected: typeof replacement): boolean => {
    if (!actual) return false;
    const entries = (key: Document) => JSON.stringify(Object.entries(key));
    const catalog = actual as Document;
    const allowed = new Set(["v", "key", "name", "unique", "ns", "collation"]);
    const collation = catalog.collation as Document | undefined;
    return entries(actual.key) === entries(expected.key as Document)
      && actual.unique === true
      && !Object.keys(catalog).some((key) => !allowed.has(key))
      && (collation === undefined || (Object.keys(collation).length === 1 && collation.locale === "simple"));
  };
  if (!exact(indexes.find((index) => index.name === replacement.name), replacement))
    throw new Error(`MongoDB index ${replacement.name} is missing or incompatible for retirement.`);
  const legacy = indexes.find((index) => index.name === LEGACY_ARTIFACT_INDEX.name);
  if (legacy && !exact(legacy, LEGACY_ARTIFACT_INDEX))
    throw new Error(`MongoDB index ${LEGACY_ARTIFACT_INDEX.name} is incompatible for retirement.`);
  return legacy ? "ready" : "already_absent";
}

export async function retireLegacyArtifactIndex(context: MongoDatabaseContext): Promise<"removed" | "already_absent"> {
  const state = await inspectArtifactIndexRetirement(context);
  await verifyMongoStructure(context);
  if (state === "ready") await context.collections.artifacts.dropIndex(LEGACY_ARTIFACT_INDEX.name);
  await verifySheetStorageReady(context);
  await verifyMongoStructure(context);
  return state === "ready" ? "removed" : "already_absent";
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
