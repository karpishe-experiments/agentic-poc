import { randomUUID } from "node:crypto";
import { getDatabase, type Database } from "@/db/client";
import { AgentMutationError, type AgentPersistenceSnapshot } from "@/db/agent-repository";
import { createRepositories, type Repositories } from "@/db/repositories";
import { agentVersionConfigurationSchema, type AgentVersion } from "@/lib/contracts/agents";
import type { SkillId } from "@/lib/contracts/skills";
import { createDefaultSkillRegistry } from "@/lib/skills/default-registry";
import type { SkillRegistry } from "@/lib/skills/registry";

export type AgentManagementFailureCode = "agent_not_found" | "agent_invalid_configuration" | "agent_immutable" | "agent_coverage_conflict" | "agent_delete_blocked" | "agent_conflict";

export class AgentManagementError extends Error {
  public constructor(public readonly code: AgentManagementFailureCode, message: string) { super(message); }
}

type EditableConfiguration = Pick<AgentVersion, "displayName" | "purpose" | "role" | "skillId" | "instructions" | "provider" | "modelId" | "reasoningEffort" | "maxTurns">;

export type AgentCoverage = { key: "manager" | SkillId; role: "manager" | "specialist"; skillId: SkillId | null; activeVersionId: string | null; violation: string | null };

function toCoverage(snapshot: AgentPersistenceSnapshot, registry: SkillRegistry): AgentCoverage[] {
  const isValid = (version: AgentVersion) => agentVersionConfigurationSchema.safeParse(version).success;
  const manager = snapshot.versions.filter((version) => version.isActive && version.role === "manager");
  const expected = ["intake_readiness@1", "story_planning_revision@1", "quality_review_targeted_repair@1", "visual_direction_reference_planning@1", "booklet_specification@1", "page_planning_writing@1", "image_prompt_compilation@1"] as SkillId[];
  expected.forEach((id) => registry.get(id));
  return [
    { key: "manager", role: "manager", skillId: null, activeVersionId: manager.length === 1 ? manager[0].id : null, violation: manager.some((version) => !isValid(version)) ? "Malformed active manager configuration" : manager.length === 1 ? null : manager.length === 0 ? "Missing active manager" : "Multiple active managers" },
    ...expected.map((skillId) => {
      const matches = snapshot.versions.filter((version) => version.isActive && version.role === "specialist" && version.skillId === skillId);
      return { key: skillId, role: "specialist" as const, skillId, activeVersionId: matches.length === 1 ? matches[0].id : null, violation: matches.some((version) => !isValid(version)) ? "Malformed active specialist configuration" : matches.length === 1 ? null : matches.length === 0 ? "Missing active specialist" : "Multiple active specialists" };
    }),
  ];
}

function violationKeys(snapshot: AgentPersistenceSnapshot, registry: SkillRegistry): Set<string> {
  return new Set(toCoverage(snapshot, registry).filter((slot) => slot.violation).map((slot) => slot.key));
}

function simulateActivation(snapshot: AgentPersistenceSnapshot, target: AgentVersion): AgentPersistenceSnapshot {
  return {
    ...snapshot,
    versions: snapshot.versions.map((version) => ({
      ...version,
      isActive: version.id === target.id
        ? true
        : version.isActive && !((version.role === target.role && version.skillId === target.skillId) || version.agentId === target.agentId),
    })),
  };
}

export class AgentManagementService {
  private readonly repositories: Repositories;
  private readonly registry: SkillRegistry;
  private readonly now: () => number;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; registry?: SkillRegistry; now?: () => number } = {}) {
    const database = dependencies.database ?? dependencies.repositories?.database ?? getDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.registry = dependencies.registry ?? createDefaultSkillRegistry();
    this.now = dependencies.now ?? Date.now;
  }

  public async getAdminSnapshot() {
    const snapshot = await this.repositories.agents.getAdminSnapshot();
    return { ...snapshot, coverage: toCoverage(snapshot, this.registry), skillChoices: this.allSkills() };
  }

  public async create(configuration: EditableConfiguration) {
    const parsed = this.validate(configuration);
    return this.call(() => this.repositories.agents.create({ definitionId: randomUUID(), versionId: randomUUID(), configuration: parsed, actor: "local-admin", now: this.now() }));
  }

  public async updateDraft(input: EditableConfiguration & { id: string; expectedRevision: number }) {
    const parsed = this.validate(input);
    return this.call(() => this.repositories.agents.updateDraft({ id: input.id, expectedRevision: input.expectedRevision, configuration: parsed, actor: "local-admin", now: this.now() }));
  }

  public async fork(input: { id: string; expectedRevision: number }) {
    return this.call(() => this.repositories.agents.fork({ ...input, versionId: randomUUID(), actor: "local-admin", now: this.now() }));
  }

  public async confirm(input: { id: string; expectedRevision: number }) {
    return this.call(() => this.repositories.agents.confirm({ ...input, actor: "local-admin", now: this.now() }));
  }

  public async activate(input: { id: string; expectedRevision: number; observedSlotVersionId: string | null; observedLogicalActiveVersionId: string | null }) {
    const target = await this.repositories.agents.getVersion(input.id);
    if (!target) throw new AgentManagementError("agent_not_found", "The selected agent version no longer exists.");
    this.validate(target);
    const before = await this.repositories.agents.getAdminSnapshot();
    const activeSameLogical = before.versions.find((version) => version.isActive && version.agentId === target.agentId && version.id !== target.id);
    if (activeSameLogical && (activeSameLogical.role !== target.role || activeSameLogical.skillId !== target.skillId)) {
      throw new AgentManagementError("agent_coverage_conflict", "Activating this version would leave the current logical agent's slot uncovered.");
    }
    const beforeViolations = violationKeys(before, this.registry);
    const afterViolations = violationKeys(simulateActivation(before, target), this.registry);
    const preservesExactCoverage = beforeViolations.size === 0 && afterViolations.size === 0;
    const strictlyRepairsCoverage = beforeViolations.size > 0
      && afterViolations.size < beforeViolations.size
      && [...afterViolations].every((key) => beforeViolations.has(key));
    if (!preservesExactCoverage && !strictlyRepairsCoverage) {
      throw new AgentManagementError("agent_coverage_conflict", "This activation must preserve exact coverage or repair at least one missing active slot. Repair the missing slot first.");
    }
    return this.call(() => this.repositories.agents.activate({ ...input, actor: "local-admin", now: this.now() }));
  }

  public async retire(input: { id: string; expectedRevision: number }) {
    return this.call(() => this.repositories.agents.retire({ ...input, actor: "local-admin", now: this.now() }));
  }

  public async deleteDraft(input: { id: string; expectedRevision: number }) {
    return this.call(() => this.repositories.agents.deleteDraft({ ...input, actor: "local-admin", now: this.now() }));
  }

  private allSkills(): SkillId[] {
    // The registry intentionally owns this closed identifier list. Calling get
    // against known IDs makes an accidental deletion fail during development.
    const ids = ["intake_readiness@1", "story_planning_revision@1", "quality_review_targeted_repair@1", "visual_direction_reference_planning@1", "booklet_specification@1", "page_planning_writing@1", "image_prompt_compilation@1"] as SkillId[];
    ids.forEach((id) => this.registry.get(id));
    return ids;
  }

  private validate(value: EditableConfiguration): EditableConfiguration {
    const parsed = agentVersionConfigurationSchema.safeParse(value);
    if (!parsed.success) throw new AgentManagementError("agent_invalid_configuration", parsed.error.issues[0]?.message ?? "The agent configuration is invalid.");
    if (parsed.data.skillId) {
      try { this.registry.get(parsed.data.skillId); } catch { throw new AgentManagementError("agent_invalid_configuration", "Choose a registered specialist skill."); }
    }
    return parsed.data;
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof AgentManagementError) throw error;
      if (error instanceof AgentMutationError) {
        const code = error.code === "agent_not_found" || error.code === "agent_conflict" || error.code === "agent_immutable" || error.code === "agent_delete_blocked" ? error.code : "agent_conflict";
        throw new AgentManagementError(code, error.message);
      }
      throw new AgentManagementError("agent_conflict", "The agent change could not be saved. Reload and try again.");
    }
  }
}

let service: AgentManagementService | null = null;
export function getAgentManagementService() {
  service ??= new AgentManagementService();
  return service;
}
