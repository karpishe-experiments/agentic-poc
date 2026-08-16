import { randomUUID } from "node:crypto";
import { MongoServerError, type ClientSession } from "mongodb";
import { withMongoTransaction, type Database } from "@/db/client";
import type { AgentDefinitionDocument, AgentVersionDocument, AgentVersionEventDocument } from "@/db/documents";
import { agentDefinitionSchema, agentVersionEventSchema, agentVersionSchema, type AgentDefinition, type AgentVersion, type AgentVersionEvent } from "@/lib/contracts/agents";
import type { SkillId } from "@/lib/contracts/skills";

const iso = (timestamp: number) => new Date(timestamp).toISOString();
const parseMetadata = (value: string | null) => value ? JSON.parse(value) as Record<string, unknown> : null;

function toDefinition(row: AgentDefinitionDocument): AgentDefinition {
  return agentDefinitionSchema.parse({ id: row._id, createdAt: iso(row.createdAtMs), createdBy: row.createdBy });
}
function versionValue(row: AgentVersionDocument) {
  return { id: row._id, agentId: row.agentId, versionNumber: row.versionNumber, parentVersionId: row.parentVersionId, displayName: row.displayName, purpose: row.purpose, role: row.role, skillId: row.skillId, instructions: row.instructions, provider: row.provider, modelId: row.modelId, reasoningEffort: row.reasoningEffort, maxTurns: row.maxTurns, status: row.status, isActive: row.isActive, revision: row.revision, createdAt: iso(row.createdAtMs), updatedAt: iso(row.updatedAtMs), createdBy: row.createdBy, updatedBy: row.updatedBy };
}
const toVersion = (row: AgentVersionDocument) => agentVersionSchema.parse(versionValue(row));
const toAdminVersion = (row: AgentVersionDocument) => agentVersionSchema.safeParse(versionValue(row)).data ?? versionValue(row) as AgentVersion;
const toEvent = (row: AgentVersionEventDocument) => agentVersionEventSchema.parse({ id: row._id, agentId: row.agentId, agentVersionId: row.agentVersionId, action: row.action, actor: row.actor, metadata: parseMetadata(row.metadataJson), createdAt: iso(row.createdAtMs) });

export class AgentMutationError extends Error {
  public constructor(public readonly code: "agent_not_found" | "agent_conflict" | "agent_immutable" | "agent_delete_blocked", message: string) { super(message); }
}
export type AgentPersistenceSnapshot = { definitions: AgentDefinition[]; versions: AgentVersion[]; events: AgentVersionEvent[] };
export type AgentRepository = {
  getAdminSnapshot(): Promise<AgentPersistenceSnapshot>; getVersion(id: string): Promise<AgentVersion | null>; resolveActiveManager(): Promise<AgentVersion | null>; resolveActiveSpecialist(skillId: SkillId): Promise<AgentVersion | null>;
  create(input: { definitionId: string; versionId: string; configuration: Pick<AgentVersion, "displayName" | "purpose" | "role" | "skillId" | "instructions" | "provider" | "modelId" | "reasoningEffort" | "maxTurns">; actor: string; now: number }): Promise<AgentVersion>;
  updateDraft(input: { id: string; expectedRevision: number; configuration: Pick<AgentVersion, "displayName" | "purpose" | "role" | "skillId" | "instructions" | "provider" | "modelId" | "reasoningEffort" | "maxTurns">; actor: string; now: number }): Promise<AgentVersion>;
  fork(input: { id: string; expectedRevision: number; versionId: string; actor: string; now: number }): Promise<AgentVersion>; confirm(input: { id: string; expectedRevision: number; actor: string; now: number }): Promise<AgentVersion>;
  activate(input: { id: string; expectedRevision: number; observedSlotVersionId: string | null; observedLogicalActiveVersionId: string | null; actor: string; now: number }): Promise<AgentVersion>;
  retire(input: { id: string; expectedRevision: number; actor: string; now: number }): Promise<AgentVersion>; deleteDraft(input: { id: string; expectedRevision: number; actor: string; now: number }): Promise<void>;
};

const duplicate = (error: unknown) => error instanceof MongoServerError && error.code === 11000;

export function createAgentRepository(database: Database): AgentRepository {
  const versions = database.collections.agent_versions;
  async function requireVersion(id: string, session?: ClientSession) {
    const row = await versions.findOne({ _id: id }, { session });
    if (!row) throw new AgentMutationError("agent_not_found", "The selected agent version no longer exists.");
    return row;
  }
  const event = (input: { agentId: string; agentVersionId: string; action: AgentVersionEvent["action"]; actor: string; now: number; metadata?: Record<string, unknown> }): AgentVersionEventDocument => ({ _id: randomUUID(), agentId: input.agentId, agentVersionId: input.agentVersionId, action: input.action, actor: input.actor, metadataJson: input.metadata ? JSON.stringify({ schemaVersion: "1", ...input.metadata }) : null, createdAtMs: input.now });
  async function retryAllocation<T>(work: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) try { return await work(); } catch (error) { if (!duplicate(error) || attempt >= 2) throw error; }
  }
  const repository: AgentRepository = {
    async getAdminSnapshot() {
      return withMongoTransaction(database, async (session) => {
        // The driver does not support parallel operations in one transaction.
        const definitions = await database.collections.agent_definitions.find({}, { session }).sort({ createdAtMs: 1 }).toArray();
        const versionRows = await versions.find({}, { session }).sort({ agentId: 1, versionNumber: -1 }).toArray();
        const events = await database.collections.agent_version_events.find({}, { session }).sort({ createdAtMs: -1 }).toArray();
        return { definitions: definitions.map(toDefinition), versions: versionRows.map(toAdminVersion), events: events.map(toEvent) };
      });
    },
    async getVersion(id) { const row = await versions.findOne({ _id: id }); return row ? toVersion(row) : null; },
    async resolveActiveManager() { const rows = await versions.find({ isActive: true, role: "manager" }).limit(2).toArray(); return rows.length === 1 ? toVersion(rows[0]) : null; },
    async resolveActiveSpecialist(skillId) { const rows = await versions.find({ isActive: true, role: "specialist", skillId }).limit(2).toArray(); return rows.length === 1 ? toVersion(rows[0]) : null; },
    async create(input) {
      await withMongoTransaction(database, async (session) => {
        await database.collections.agent_definitions.insertOne({ _id: input.definitionId, createdAtMs: input.now, createdBy: input.actor }, { session });
        const document: AgentVersionDocument = { _id: input.versionId, agentId: input.definitionId, versionNumber: 1, parentVersionId: null, ...input.configuration, status: "draft", isActive: false, revision: 1, createdAtMs: input.now, updatedAtMs: input.now, createdBy: input.actor, updatedBy: input.actor };
        toVersion(document); await versions.insertOne(document, { session });
        await database.collections.agent_version_events.insertOne(event({ agentId: input.definitionId, agentVersionId: input.versionId, action: "create", actor: input.actor, now: input.now }), { session });
      });
      return (await repository.getVersion(input.versionId))!;
    },
    async updateDraft(input) {
      const current = await requireVersion(input.id);
      if (current.status !== "draft") throw new AgentMutationError("agent_immutable", "Only draft versions can be edited.");
      if (current.revision !== input.expectedRevision) throw new AgentMutationError("agent_conflict", "This draft changed elsewhere. Reload it before saving.");
      if (current.isActive && (current.role !== input.configuration.role || current.skillId !== input.configuration.skillId)) throw new AgentMutationError("agent_immutable", "An active draft cannot change its role or skill binding.");
      await withMongoTransaction(database, async (session) => {
        const result = await versions.updateOne({ _id: input.id, revision: input.expectedRevision, status: "draft" }, { $set: { ...input.configuration, revision: current.revision + 1, updatedAtMs: input.now, updatedBy: input.actor } }, { session });
        if (!result.matchedCount) throw new AgentMutationError("agent_conflict", "This draft changed elsewhere. Reload it before saving.");
        await database.collections.agent_version_events.insertOne(event({ agentId: current.agentId, agentVersionId: current._id, action: "edit", actor: input.actor, now: input.now, metadata: { previousRevision: current.revision, revision: current.revision + 1 } }), { session });
      });
      return (await repository.getVersion(input.id))!;
    },
    async fork(input) {
      const source = await requireVersion(input.id);
      if (source.revision !== input.expectedRevision) throw new AgentMutationError("agent_conflict", "This version changed elsewhere. Reload it before forking.");
      await retryAllocation(() => withMongoTransaction(database, async (session) => {
        const latest = await versions.find({ agentId: source.agentId }, { session }).sort({ versionNumber: -1 }).limit(1).next();
        const document: AgentVersionDocument = { ...source, _id: input.versionId, versionNumber: (latest?.versionNumber ?? 0) + 1, parentVersionId: source._id, status: "draft", isActive: false, revision: 1, createdAtMs: input.now, updatedAtMs: input.now, createdBy: input.actor, updatedBy: input.actor };
        await versions.insertOne(document, { session });
        await database.collections.agent_version_events.insertOne(event({ agentId: source.agentId, agentVersionId: input.versionId, action: "fork", actor: input.actor, now: input.now, metadata: { parentVersionId: source._id, sourceRevision: source.revision } }), { session });
      }));
      return (await repository.getVersion(input.versionId))!;
    },
    async confirm(input) {
      const current = await requireVersion(input.id);
      if (current.status !== "draft") throw new AgentMutationError("agent_immutable", "Only drafts can be confirmed.");
      if (current.revision !== input.expectedRevision) throw new AgentMutationError("agent_conflict", "This draft changed elsewhere. Reload it before confirming.");
      await withMongoTransaction(database, async (session) => {
        const result = await versions.updateOne({ _id: current._id, revision: current.revision, status: "draft" }, { $set: { status: "confirmed", revision: current.revision + 1, updatedAtMs: input.now, updatedBy: input.actor } }, { session });
        if (!result.matchedCount) throw new AgentMutationError("agent_conflict", "This draft changed elsewhere. Reload it before confirming.");
        await database.collections.agent_version_events.insertOne(event({ agentId: current.agentId, agentVersionId: current._id, action: "confirm", actor: input.actor, now: input.now }), { session });
      }); return (await repository.getVersion(input.id))!;
    },
    async activate(input) {
      const target = await requireVersion(input.id);
      if (target.status === "retired") throw new AgentMutationError("agent_immutable", "Retired versions cannot be activated.");
      if (target.revision !== input.expectedRevision) throw new AgentMutationError("agent_conflict", "This version changed elsewhere. Reload it before activating.");
      await withMongoTransaction(database, async (session) => {
        const slotFilter = target.role === "manager" ? { isActive: true, role: "manager" } : { isActive: true, role: "specialist", skillId: target.skillId };
        const slotRows = await versions.find(slotFilter, { session }).limit(2).toArray();
        const logicalRows = await versions.find({ isActive: true, agentId: target.agentId }, { session }).limit(2).toArray();
        if ((slotRows[0]?._id ?? null) !== input.observedSlotVersionId || (logicalRows[0]?._id ?? null) !== input.observedLogicalActiveVersionId) throw new AgentMutationError("agent_conflict", "Active coverage changed elsewhere. Reload the page before activating.");
        const deactivated = [...new Map([...slotRows, ...logicalRows].filter((row) => row._id !== target._id).map((row) => [row._id, row])).values()];
        for (const current of deactivated) {
          const result = await versions.updateOne({ _id: current._id, revision: current.revision }, { $set: { isActive: false, revision: current.revision + 1, updatedAtMs: input.now, updatedBy: input.actor } }, { session });
          if (!result.matchedCount) throw new AgentMutationError("agent_conflict", "Active coverage changed elsewhere. Reload the page before activating.");
          await database.collections.agent_version_events.insertOne(event({ agentId: current.agentId, agentVersionId: current._id, action: "deactivate", actor: input.actor, now: input.now, metadata: { replacementVersionId: target._id } }), { session });
        }
        const result = await versions.updateOne({ _id: target._id, revision: target.revision }, { $set: { isActive: true, revision: target.revision + 1, updatedAtMs: input.now, updatedBy: input.actor } }, { session });
        if (!result.matchedCount) throw new AgentMutationError("agent_conflict", "This version changed elsewhere. Reload it before activating.");
        await database.collections.agent_version_events.insertOne(event({ agentId: target.agentId, agentVersionId: target._id, action: "activate", actor: input.actor, now: input.now, metadata: { replacedVersionIds: deactivated.map((row) => row._id) } }), { session });
      }); return (await repository.getVersion(input.id))!;
    },
    async retire(input) {
      const current = await requireVersion(input.id);
      if (current.isActive || current.status === "retired") throw new AgentMutationError("agent_immutable", "Only inactive non-retired versions can be retired.");
      if (current.revision !== input.expectedRevision) throw new AgentMutationError("agent_conflict", "This version changed elsewhere. Reload it before retiring.");
      await withMongoTransaction(database, async (session) => {
        const result = await versions.updateOne({ _id: current._id, revision: current.revision, isActive: false }, { $set: { status: "retired", revision: current.revision + 1, updatedAtMs: input.now, updatedBy: input.actor } }, { session });
        if (!result.matchedCount) throw new AgentMutationError("agent_conflict", "This version changed elsewhere. Reload it before retiring.");
        await database.collections.agent_version_events.insertOne(event({ agentId: current.agentId, agentVersionId: current._id, action: "retire", actor: input.actor, now: input.now }), { session });
      }); return (await repository.getVersion(input.id))!;
    },
    async deleteDraft(input) {
      const current = await requireVersion(input.id);
      if (current.status !== "draft" || current.isActive) throw new AgentMutationError("agent_delete_blocked", "Only inactive draft versions can be deleted.");
      if (current.revision !== input.expectedRevision) throw new AgentMutationError("agent_conflict", "This version changed elsewhere. Reload it before deleting.");
      await withMongoTransaction(database, async (session) => {
        const child = await versions.findOne({ parentVersionId: current._id }, { session });
        const evidence = await database.collections.model_calls.findOne({ agentVersionId: current._id }, { session });
        const siblings = await versions.countDocuments({ agentId: current.agentId }, { session });
        if (child || evidence) throw new AgentMutationError("agent_delete_blocked", "This draft has child versions or model-call evidence and must be retained.");
        await database.collections.agent_version_events.insertOne(event({ agentId: current.agentId, agentVersionId: current._id, action: "delete", actor: input.actor, now: input.now }), { session });
        const result = await versions.deleteOne({ _id: current._id, revision: current.revision }, { session });
        if (!result.deletedCount) throw new AgentMutationError("agent_conflict", "This draft changed elsewhere. Reload it before deleting.");
        if (siblings === 1) await database.collections.agent_definitions.deleteOne({ _id: current.agentId }, { session });
      });
    },
  };
  return repository;
}
