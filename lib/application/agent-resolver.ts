import { getDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import { effectiveAgentConfigurationSnapshotSchema, agentVersionConfigurationSchema, type AgentVersion, type EffectiveAgentConfigurationSnapshot } from "@/lib/contracts/agents";
import type { SkillId } from "@/lib/contracts/skills";
import { createDefaultSkillRegistry } from "@/lib/skills/default-registry";
import type { SkillRegistry } from "@/lib/skills/registry";

export class AgentConfigurationUnavailableError extends Error {
  public readonly code = "agent_configuration_unavailable";
  public readonly status = 503;
  public constructor(public readonly target: "manager" | SkillId, message?: string) {
    super(message ?? `Active ${target === "manager" ? "manager" : `specialist for ${target}`} configuration is unavailable. Open /admin/agents to repair it.`);
  }
}

export type ResolvedAgentConfiguration = Readonly<{ version: AgentVersion; snapshot: EffectiveAgentConfigurationSnapshot }>;
export type PreparedActiveAgentSet = Readonly<{ manager: ResolvedAgentConfiguration; specialists: ReadonlyMap<SkillId, ResolvedAgentConfiguration>; fingerprint: string }>;

function resolveVersion(version: AgentVersion, runtimeMode: "fake" | "real", registry: SkillRegistry): ResolvedAgentConfiguration {
  const configuration = agentVersionConfigurationSchema.parse(version);
  if (!version.isActive || version.status === "retired") throw new AgentConfigurationUnavailableError(version.skillId ?? "manager");
  if (configuration.role === "specialist") registry.get(configuration.skillId!);
  const snapshot = effectiveAgentConfigurationSnapshotSchema.parse({
    ...version, schemaVersion: "1", runtimeMode,
    execution: { toolChoiceRequired: configuration.role === "manager", parallelToolCalls: false, outputSchemaOwnedByCode: true },
  });
  return Object.freeze({ version: Object.freeze(version), snapshot: Object.freeze(snapshot) });
}

export class AgentResolver {
  private readonly repositories: Repositories;
  private readonly registry: SkillRegistry;
  public constructor(dependencies: { database?: Database; repositories?: Repositories; registry?: SkillRegistry } = {}) {
    const database = dependencies.database ?? dependencies.repositories?.database ?? getDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.registry = dependencies.registry ?? createDefaultSkillRegistry();
  }

  public async resolveManager(runtimeMode: "fake" | "real") {
    try {
      const version = await this.repositories.agents.resolveActiveManager();
      if (!version) throw new AgentConfigurationUnavailableError("manager");
      return resolveVersion(version, runtimeMode, this.registry);
    }
    catch (error) { if (error instanceof AgentConfigurationUnavailableError) throw error; throw new AgentConfigurationUnavailableError("manager"); }
  }

  public async resolveSpecialist(skillId: SkillId, runtimeMode: "fake" | "real") {
    try {
      const version = await this.repositories.agents.resolveActiveSpecialist(skillId);
      if (!version) throw new AgentConfigurationUnavailableError(skillId);
      const resolved = resolveVersion(version, runtimeMode, this.registry);
      if (resolved.version.role !== "specialist" || resolved.version.skillId !== skillId) throw new AgentConfigurationUnavailableError(skillId);
      return resolved;
    } catch (error) { if (error instanceof AgentConfigurationUnavailableError) throw error; throw new AgentConfigurationUnavailableError(skillId); }
  }

  public async prepareCompleteActiveSet(runtimeMode: "fake" | "real"): Promise<PreparedActiveAgentSet> {
    try {
      const snapshot = await this.repositories.agents.getAdminSnapshot();
      const manager = snapshot.versions.filter((version) => version.isActive && version.role === "manager");
      if (manager.length !== 1) throw new AgentConfigurationUnavailableError("manager");
      const resolvedManager = resolveVersion(manager[0], runtimeMode, this.registry);
      const ids = ["intake_readiness@1", "story_planning_revision@1", "quality_review_targeted_repair@1", "visual_direction_reference_planning@1", "booklet_specification@1", "page_planning_writing@1", "image_prompt_compilation@1"] as SkillId[];
      const specialists = new Map<SkillId, ResolvedAgentConfiguration>();
      for (const skillId of ids) {
        const matching = snapshot.versions.filter((version) => version.isActive && version.role === "specialist" && version.skillId === skillId);
        if (matching.length !== 1) throw new AgentConfigurationUnavailableError(skillId);
        try {
          specialists.set(skillId, resolveVersion(matching[0], runtimeMode, this.registry));
        } catch (error) {
          if (error instanceof AgentConfigurationUnavailableError) throw error;
          throw new AgentConfigurationUnavailableError(skillId);
        }
      }
      const fingerprint = [resolvedManager.version.id, ...ids.map((id) => specialists.get(id)!.version.id)].join(":");
      return Object.freeze({ manager: resolvedManager, specialists, fingerprint });
    }
    catch (error) { if (error instanceof AgentConfigurationUnavailableError) throw error; throw new AgentConfigurationUnavailableError("manager"); }
  }
}
