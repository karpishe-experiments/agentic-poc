import { randomUUID } from "node:crypto";
import { getDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import { createDefaultSkillRegistry } from "@/lib/skills/default-registry";
import { FakeModelRuntime } from "@/lib/testing/fake-model-runtime";
import { OpenAIManagerRuntime } from "@/lib/agents/openai-manager-runtime";
import { AgentResolver, type PreparedActiveAgentSet } from "@/lib/application/agent-resolver";
import { skillContextSchema, type SkillContext, type SkillId } from "@/lib/contracts/skills";
import { classifyModelError, type AgentRunMetadata } from "@/lib/agents/run-metadata";
import { modelCallCost } from "@/lib/application/model-call-cost";
import { RecoverableApplicationError } from "@/lib/application/application-error";


const fakeRunMetadata: AgentRunMetadata = { usage: { inputTokens: 0, outputTokens: 0 }, providerRequestId: null };

function allowedSkillsForContext(context: SkillContext, registry: ReturnType<typeof createDefaultSkillRegistry>) {
  const stageSkills = registry.getAllowed(context.stage);
  if (context.stage !== "story_plan") return stageSkills;
  return stageSkills.filter((skill) => context.operation === "story_quality"
    ? skill.id === "quality_review_targeted_repair@1"
    : skill.id === "story_planning_revision@1");
}

export class ManagerService {
  private readonly repositories: Repositories;
  private readonly runtime: Pick<FakeModelRuntime, "route"> | Pick<OpenAIManagerRuntime, "route">;
  private readonly runtimeMode: "fake" | "real";
  private readonly resolver: AgentResolver;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; runtime?: Pick<FakeModelRuntime, "route"> | Pick<OpenAIManagerRuntime, "route">; runtimeMode?: "fake" | "real"; resolver?: AgentResolver } = {}) {
    const database = dependencies.database ?? dependencies.repositories?.database ?? getDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.runtimeMode = dependencies.runtimeMode ?? (process.env.MODEL_RUNTIME === "real" ? "real" : "fake");
    this.runtime = dependencies.runtime ?? (this.runtimeMode === "real" ? new OpenAIManagerRuntime(createDefaultSkillRegistry()) : new FakeModelRuntime());
    this.resolver = dependencies.resolver ?? new AgentResolver({ repositories: this.repositories });
  }

  /** Route exactly one stage-valid skill. Candidate execution is owned by ExecutionService. */
  public async route(contextInput: SkillContext, input: { cardId: string; skillInput?: unknown }, preparedInput?: PreparedActiveAgentSet): Promise<{ traceId: string; skillId: SkillId; rawInput: unknown; prepared: PreparedActiveAgentSet }> {
    const context = skillContextSchema.parse(contextInput);
    const registry = createDefaultSkillRegistry();
    const allowed = allowedSkillsForContext(context, registry);
    const prepared = preparedInput ?? await this.resolver.prepareCompleteActiveSet(this.runtimeMode);
    const startedAtMs = Date.now();
    try {
      const routeInput = { stage: context.stage, operation: context.operation, intent: context.intent, availableSkills: allowed.map((skill) => ({ id: skill.id, description: skill.description })) };
      const route = this.runtimeMode === "real" ? await (this.runtime as OpenAIManagerRuntime).route(routeInput, prepared.manager) : await (this.runtime as FakeModelRuntime).route(routeInput);
      if (!allowed.some((skill) => skill.id === route.skillId)) throw new RecoverableApplicationError({ code: "skill_contract_mismatch", message: "The selected step is not valid for the saved booklet state. Retry this step.", status: 409 });
      const metadata: AgentRunMetadata | null = "runMetadata" in route ? route.runMetadata as AgentRunMetadata : this.runtimeMode === "fake" ? fakeRunMetadata : null;
      await this.repositories.evidence.recordModelCall({ id: randomUUID(), bookletId: context.bookletId, operation: "manager", skillId: null, provider: this.runtimeMode === "real" ? "openai" : "fake", model: this.runtimeMode === "real" ? prepared.manager.version.modelId : "fake-manager-v1", traceId: context.traceId, status: "succeeded", attempt: 1, startedAtMs, latencyMs: Math.max(0, Date.now() - startedAtMs), inputReference: { stage: context.stage, operation: context.operation }, outputReference: { skillId: route.skillId, arguments: route.arguments, explanation: route.explanation }, usage: metadata?.usage ?? null, providerRequestId: metadata?.providerRequestId ?? null, ...modelCallCost({ runtimeMode: this.runtimeMode, modelId: prepared.manager.version.modelId, usage: metadata?.usage ?? null }), agentDefinitionId: prepared.manager.version.agentId, agentVersionId: prepared.manager.version.id, agentConfigSnapshot: prepared.manager.snapshot });
      const skill = registry.get(route.skillId);
      const rawInput = input.skillInput ?? (route.skillId === "intake_readiness@1" ? { cardId: input.cardId } : { intent: context.intent });
      return { traceId: context.traceId, skillId: skill.id, rawInput: skill.inputSchema.parse(rawInput), prepared };
    } catch (error) {
      await this.repositories.evidence.recordModelCall({ id: randomUUID(), bookletId: context.bookletId, operation: "manager", skillId: null, provider: this.runtimeMode === "real" ? "openai" : "fake", model: this.runtimeMode === "real" ? prepared.manager.version.modelId : "fake-manager-v1", traceId: context.traceId, status: "failed", attempt: 1, startedAtMs, latencyMs: Math.max(0, Date.now() - startedAtMs), inputReference: { stage: context.stage, operation: context.operation }, errorMessage: error instanceof Error ? error.message : "Manager routing failed.", errorKind: classifyModelError(error), ...modelCallCost({ runtimeMode: this.runtimeMode, modelId: prepared.manager.version.modelId, usage: null }), agentDefinitionId: prepared.manager.version.agentId, agentVersionId: prepared.manager.version.id, agentConfigSnapshot: prepared.manager.snapshot });
      throw error;
    }
  }
  /** Verify complete persisted coverage before a caller persists a follow-up. */
  public async preflight() {
    return this.resolver.prepareCompleteActiveSet(this.runtimeMode);
  }

}
