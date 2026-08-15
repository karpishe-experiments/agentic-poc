import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { agentDefinitions, agentVersionEvents, agentVersions, modelCalls } from "@/db/schema";
import { agentDefinitionSchema, agentVersionEventSchema, agentVersionSchema, type AgentDefinition, type AgentVersion, type AgentVersionEvent } from "@/lib/contracts/agents";
import type { SkillId } from "@/lib/contracts/skills";

const iso = (timestamp: number) => new Date(timestamp).toISOString();
const parseMetadata = (value: string | null) => value ? JSON.parse(value) as Record<string, unknown> : null;

function toDefinition(row: typeof agentDefinitions.$inferSelect): AgentDefinition {
  return agentDefinitionSchema.parse({ id: row.id, createdAt: iso(row.createdAtMs), createdBy: row.createdBy });
}

function versionValue(row: typeof agentVersions.$inferSelect) {
  return {
    id: row.id, agentId: row.agentId, versionNumber: row.versionNumber, parentVersionId: row.parentVersionId,
    displayName: row.displayName, purpose: row.purpose, role: row.role, skillId: row.skillId, instructions: row.instructions,
    provider: row.provider, modelId: row.modelId, reasoningEffort: row.reasoningEffort, maxTurns: row.maxTurns, status: row.status,
    isActive: row.isActive, revision: row.revision, createdAt: iso(row.createdAtMs), updatedAt: iso(row.updatedAtMs), createdBy: row.createdBy, updatedBy: row.updatedBy,
  };
}

function toVersion(row: typeof agentVersions.$inferSelect): AgentVersion {
  return agentVersionSchema.parse(versionValue(row));
}

function toAdminVersion(row: typeof agentVersions.$inferSelect): AgentVersion {
  // Admin inspection must remain available for a malformed persisted row so a
  // valid replacement can repair coverage. Runtime resolution remains strict.
  return agentVersionSchema.safeParse(versionValue(row)).data ?? versionValue(row) as AgentVersion;
}

function toEvent(row: typeof agentVersionEvents.$inferSelect): AgentVersionEvent {
  return agentVersionEventSchema.parse({ id: row.id, agentId: row.agentId, agentVersionId: row.agentVersionId, action: row.action, actor: row.actor, metadata: parseMetadata(row.metadataJson), createdAt: iso(row.createdAtMs) });
}

export class AgentMutationError extends Error {
  public constructor(public readonly code: "agent_not_found" | "agent_conflict" | "agent_immutable" | "agent_delete_blocked", message: string) { super(message); }
}

export type AgentPersistenceSnapshot = { definitions: AgentDefinition[]; versions: AgentVersion[]; events: AgentVersionEvent[] };
export type AgentRepository = {
  getAdminSnapshot(): Promise<AgentPersistenceSnapshot>;
  getVersion(id: string): Promise<AgentVersion | null>;
  resolveActiveManager(): Promise<AgentVersion | null>;
  resolveActiveSpecialist(skillId: SkillId): Promise<AgentVersion | null>;
  create(input: { definitionId: string; versionId: string; configuration: Pick<AgentVersion, "displayName" | "purpose" | "role" | "skillId" | "instructions" | "provider" | "modelId" | "reasoningEffort" | "maxTurns">; actor: string; now: number }): Promise<AgentVersion>;
  updateDraft(input: { id: string; expectedRevision: number; configuration: Pick<AgentVersion, "displayName" | "purpose" | "role" | "skillId" | "instructions" | "provider" | "modelId" | "reasoningEffort" | "maxTurns">; actor: string; now: number }): Promise<AgentVersion>;
  fork(input: { id: string; expectedRevision: number; versionId: string; actor: string; now: number }): Promise<AgentVersion>;
  confirm(input: { id: string; expectedRevision: number; actor: string; now: number }): Promise<AgentVersion>;
  activate(input: { id: string; expectedRevision: number; observedSlotVersionId: string | null; observedLogicalActiveVersionId: string | null; actor: string; now: number }): Promise<AgentVersion>;
  retire(input: { id: string; expectedRevision: number; actor: string; now: number }): Promise<AgentVersion>;
  deleteDraft(input: { id: string; expectedRevision: number; actor: string; now: number }): Promise<void>;
};

export function createAgentRepository(database: Database): AgentRepository {
  async function requireVersion(id: string) {
    const rows = await database.select().from(agentVersions).where(eq(agentVersions.id, id)).limit(1);
    if (!rows[0]) throw new AgentMutationError("agent_not_found", "The selected agent version no longer exists.");
    return rows[0];
  }
  const event = (input: { agentId: string; agentVersionId: string; action: AgentVersionEvent["action"]; actor: string; now: number; metadata?: Record<string, unknown> }) => ({
    id: randomUUID(), agentId: input.agentId, agentVersionId: input.agentVersionId, action: input.action, actor: input.actor,
    metadataJson: input.metadata ? JSON.stringify({ schemaVersion: "1", ...input.metadata }) : null, createdAtMs: input.now,
  });

  return {
    async getAdminSnapshot() {
      const [definitions, versions, events] = await Promise.all([
        database.select().from(agentDefinitions).orderBy(asc(agentDefinitions.createdAtMs)),
        database.select().from(agentVersions).orderBy(asc(agentVersions.agentId), desc(agentVersions.versionNumber)),
        database.select().from(agentVersionEvents).orderBy(desc(agentVersionEvents.createdAtMs)),
      ]);
      return { definitions: definitions.map(toDefinition), versions: versions.map(toAdminVersion), events: events.map(toEvent) };
    },
    async getVersion(id) {
      const rows = await database.select().from(agentVersions).where(eq(agentVersions.id, id)).limit(1);
      return rows[0] ? toVersion(rows[0]) : null;
    },
    async resolveActiveManager() {
      const rows = await database.select().from(agentVersions).where(and(eq(agentVersions.isActive, true), eq(agentVersions.role, "manager"))).limit(2);
      return rows.length === 1 ? toVersion(rows[0]) : null;
    },
    async resolveActiveSpecialist(skillId) {
      const rows = await database.select().from(agentVersions).where(and(eq(agentVersions.isActive, true), eq(agentVersions.role, "specialist"), eq(agentVersions.skillId, skillId))).limit(2);
      return rows.length === 1 ? toVersion(rows[0]) : null;
    },
    async create(input) {
      await database.transaction(async (transaction) => {
        await transaction.insert(agentDefinitions).values({ id: input.definitionId, createdAtMs: input.now, createdBy: input.actor });
        await transaction.insert(agentVersions).values({ id: input.versionId, agentId: input.definitionId, versionNumber: 1, parentVersionId: null, ...input.configuration, status: "draft", isActive: false, revision: 1, createdAtMs: input.now, updatedAtMs: input.now, createdBy: input.actor, updatedBy: input.actor });
        await transaction.insert(agentVersionEvents).values(event({ agentId: input.definitionId, agentVersionId: input.versionId, action: "create", actor: input.actor, now: input.now }));
      });
      return (await this.getVersion(input.versionId))!;
    },
    async updateDraft(input) {
      const current = await requireVersion(input.id);
      if (current.status !== "draft") throw new AgentMutationError("agent_immutable", "Only draft versions can be edited.");
      if (current.revision !== input.expectedRevision) throw new AgentMutationError("agent_conflict", "This draft changed elsewhere. Reload it before saving.");
      if (current.isActive && (current.role !== input.configuration.role || current.skillId !== input.configuration.skillId)) throw new AgentMutationError("agent_immutable", "An active draft cannot change its role or skill binding.");
      await database.transaction(async (transaction) => {
        const updated = await transaction.update(agentVersions).set({ ...input.configuration, revision: current.revision + 1, updatedAtMs: input.now, updatedBy: input.actor })
          .where(and(eq(agentVersions.id, input.id), eq(agentVersions.revision, input.expectedRevision), eq(agentVersions.status, "draft"))).returning({ id: agentVersions.id });
        if (!updated.length) throw new AgentMutationError("agent_conflict", "This draft changed elsewhere. Reload it before saving.");
        await transaction.insert(agentVersionEvents).values(event({ agentId: current.agentId, agentVersionId: current.id, action: "edit", actor: input.actor, now: input.now, metadata: { previousRevision: current.revision, revision: current.revision + 1 } }));
      });
      return (await this.getVersion(input.id))!;
    },
    async fork(input) {
      const source = await requireVersion(input.id);
      if (source.revision !== input.expectedRevision) throw new AgentMutationError("agent_conflict", "This version changed elsewhere. Reload it before forking.");
      await database.transaction(async (transaction) => {
        const maximum = await transaction.select({ version: sql<number>`max(${agentVersions.versionNumber})` }).from(agentVersions).where(eq(agentVersions.agentId, source.agentId));
        await transaction.insert(agentVersions).values({ ...source, id: input.versionId, versionNumber: Number(maximum[0]?.version ?? 0) + 1, parentVersionId: source.id, status: "draft", isActive: false, revision: 1, createdAtMs: input.now, updatedAtMs: input.now, createdBy: input.actor, updatedBy: input.actor });
        await transaction.insert(agentVersionEvents).values(event({ agentId: source.agentId, agentVersionId: input.versionId, action: "fork", actor: input.actor, now: input.now, metadata: { parentVersionId: source.id, sourceRevision: source.revision } }));
      });
      return (await this.getVersion(input.versionId))!;
    },
    async confirm(input) {
      const current = await requireVersion(input.id);
      if (current.status !== "draft") throw new AgentMutationError("agent_immutable", "Only drafts can be confirmed.");
      if (current.revision !== input.expectedRevision) throw new AgentMutationError("agent_conflict", "This draft changed elsewhere. Reload it before confirming.");
      await database.transaction(async (transaction) => {
        const updated = await transaction.update(agentVersions).set({ status: "confirmed", revision: current.revision + 1, updatedAtMs: input.now, updatedBy: input.actor })
          .where(and(eq(agentVersions.id, current.id), eq(agentVersions.revision, current.revision), eq(agentVersions.status, "draft"))).returning({ id: agentVersions.id });
        if (!updated.length) throw new AgentMutationError("agent_conflict", "This draft changed elsewhere. Reload it before confirming.");
        await transaction.insert(agentVersionEvents).values(event({ agentId: current.agentId, agentVersionId: current.id, action: "confirm", actor: input.actor, now: input.now }));
      });
      return (await this.getVersion(input.id))!;
    },
    async activate(input) {
      const target = await requireVersion(input.id);
      if (target.status === "retired") throw new AgentMutationError("agent_immutable", "Retired versions cannot be activated.");
      if (target.revision !== input.expectedRevision) throw new AgentMutationError("agent_conflict", "This version changed elsewhere. Reload it before activating.");
      await database.transaction(async (transaction) => {
        const slotRows = await transaction.select().from(agentVersions).where(target.role === "manager" ? and(eq(agentVersions.isActive, true), eq(agentVersions.role, "manager")) : and(eq(agentVersions.isActive, true), eq(agentVersions.role, "specialist"), eq(agentVersions.skillId, target.skillId!))).limit(2);
        const logicalRows = await transaction.select().from(agentVersions).where(and(eq(agentVersions.isActive, true), eq(agentVersions.agentId, target.agentId))).limit(2);
        if ((slotRows[0]?.id ?? null) !== input.observedSlotVersionId || (logicalRows[0]?.id ?? null) !== input.observedLogicalActiveVersionId) throw new AgentMutationError("agent_conflict", "Active coverage changed elsewhere. Reload the page before activating.");
        const deactivated = [...new Map([...slotRows, ...logicalRows].filter((row) => row.id !== target.id).map((row) => [row.id, row])).values()];
        for (const current of deactivated) {
          const updated = await transaction.update(agentVersions).set({ isActive: false, revision: current.revision + 1, updatedAtMs: input.now, updatedBy: input.actor })
            .where(and(eq(agentVersions.id, current.id), eq(agentVersions.revision, current.revision))).returning({ id: agentVersions.id });
          if (!updated.length) throw new AgentMutationError("agent_conflict", "Active coverage changed elsewhere. Reload the page before activating.");
          await transaction.insert(agentVersionEvents).values(event({ agentId: current.agentId, agentVersionId: current.id, action: "deactivate", actor: input.actor, now: input.now, metadata: { replacementVersionId: target.id } }));
        }
        const activated = await transaction.update(agentVersions).set({ isActive: true, revision: target.revision + 1, updatedAtMs: input.now, updatedBy: input.actor })
          .where(and(eq(agentVersions.id, target.id), eq(agentVersions.revision, target.revision))).returning({ id: agentVersions.id });
        if (!activated.length) throw new AgentMutationError("agent_conflict", "This version changed elsewhere. Reload it before activating.");
        await transaction.insert(agentVersionEvents).values(event({ agentId: target.agentId, agentVersionId: target.id, action: "activate", actor: input.actor, now: input.now, metadata: { replacedVersionIds: deactivated.map((row) => row.id) } }));
      });
      return (await this.getVersion(input.id))!;
    },
    async retire(input) {
      const current = await requireVersion(input.id);
      if (current.isActive || current.status === "retired") throw new AgentMutationError("agent_immutable", "Only inactive non-retired versions can be retired.");
      if (current.revision !== input.expectedRevision) throw new AgentMutationError("agent_conflict", "This version changed elsewhere. Reload it before retiring.");
      await database.transaction(async (transaction) => {
        const updated = await transaction.update(agentVersions).set({ status: "retired", revision: current.revision + 1, updatedAtMs: input.now, updatedBy: input.actor })
          .where(and(eq(agentVersions.id, current.id), eq(agentVersions.revision, current.revision))).returning({ id: agentVersions.id });
        if (!updated.length) throw new AgentMutationError("agent_conflict", "This version changed elsewhere. Reload it before retiring.");
        await transaction.insert(agentVersionEvents).values(event({ agentId: current.agentId, agentVersionId: current.id, action: "retire", actor: input.actor, now: input.now }));
      });
      return (await this.getVersion(input.id))!;
    },
    async deleteDraft(input) {
      const current = await requireVersion(input.id);
      if (current.status !== "draft" || current.isActive) throw new AgentMutationError("agent_delete_blocked", "Only inactive draft versions can be deleted.");
      if (current.revision !== input.expectedRevision) throw new AgentMutationError("agent_conflict", "This version changed elsewhere. Reload it before deleting.");
      await database.transaction(async (transaction) => {
        const [children, evidence, siblings] = await Promise.all([
          transaction.select({ id: agentVersions.id }).from(agentVersions).where(eq(agentVersions.parentVersionId, current.id)).limit(1),
          transaction.select({ id: modelCalls.id }).from(modelCalls).where(eq(modelCalls.agentVersionId, current.id)).limit(1),
          transaction.select({ id: agentVersions.id }).from(agentVersions).where(eq(agentVersions.agentId, current.agentId)),
        ]);
        if (children[0] || evidence[0]) throw new AgentMutationError("agent_delete_blocked", "This draft has child versions or model-call evidence and must be retained.");
        await transaction.insert(agentVersionEvents).values(event({ agentId: current.agentId, agentVersionId: current.id, action: "delete", actor: input.actor, now: input.now }));
        const deleted = await transaction.delete(agentVersions).where(and(eq(agentVersions.id, current.id), eq(agentVersions.revision, current.revision))).returning({ id: agentVersions.id });
        if (!deleted.length) throw new AgentMutationError("agent_conflict", "This draft changed elsewhere. Reload it before deleting.");
        if (siblings.length === 1) await transaction.delete(agentDefinitions).where(eq(agentDefinitions.id, current.agentId));
      });
    },
  };
}
