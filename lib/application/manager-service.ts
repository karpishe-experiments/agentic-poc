import { randomUUID } from "node:crypto";
import { getDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import { createDefaultSkillRegistry } from "@/lib/skills/default-registry";
import { FakeModelRuntime } from "@/lib/testing/fake-model-runtime";
import { OpenAIManagerRuntime } from "@/lib/agents/openai-manager-runtime";
import { OpenAISpecialistRuntime } from "@/lib/agents/openai-specialist-runtime";
import { AgentResolver, type PreparedActiveAgentSet } from "@/lib/application/agent-resolver";
import { skillContextSchema, type SkillContext, type SkillId } from "@/lib/contracts/skills";
import { classifyModelError, type AgentRunMetadata } from "@/lib/agents/run-metadata";
import { modelCallCost } from "@/lib/application/model-call-cost";
import { RecoverableApplicationError } from "@/lib/application/application-error";
import { withTrace } from "@openai/agents";
import { ZodError } from "zod";

type SpecialistRuntime = Pick<OpenAISpecialistRuntime, "run"> & Partial<Pick<OpenAISpecialistRuntime, "runWithMetadata">>;
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
  private readonly specialistRuntime?: SpecialistRuntime;
  private readonly runtimeMode: "fake" | "real";
  private readonly resolver: AgentResolver;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; runtime?: Pick<FakeModelRuntime, "route"> | Pick<OpenAIManagerRuntime, "route">; specialistRuntime?: SpecialistRuntime; runtimeMode?: "fake" | "real"; resolver?: AgentResolver } = {}) {
    const database = dependencies.database ?? dependencies.repositories?.database ?? getDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.runtimeMode = dependencies.runtimeMode ?? (process.env.MODEL_RUNTIME === "real" ? "real" : "fake");
    this.runtime = dependencies.runtime ?? (this.runtimeMode === "real" ? new OpenAIManagerRuntime(createDefaultSkillRegistry()) : new FakeModelRuntime());
    this.specialistRuntime = dependencies.specialistRuntime ?? (this.runtimeMode === "real" ? new OpenAISpecialistRuntime() : undefined);
    this.resolver = dependencies.resolver ?? new AgentResolver({ repositories: this.repositories });
  }

  public async run(contextInput: SkillContext, input: { cardId: string; skillInput?: unknown }, prepared?: PreparedActiveAgentSet): Promise<{ traceId: string; route: string; output: unknown }> {
    const context = skillContextSchema.parse(contextInput);
    const execute = () => this.runWithContext(context, input, prepared);
    if (this.runtimeMode === "real") {
      return withTrace("kids-booklet-poc", (trace) => this.runWithContext({ ...context, traceId: trace.traceId }, input, prepared), {
        groupId: context.bookletId,
        metadata: {
          bookletId: context.bookletId,
          stage: context.stage,
          operation: context.operation,
          applicationCallId: input.cardId,
        },
      });
    }
    return execute();
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

  private async runWithContext(context: SkillContext, input: { cardId: string; skillInput?: unknown }, preparedInput?: PreparedActiveAgentSet): Promise<{ traceId: string; route: string; output: unknown }> {
    const registry = createDefaultSkillRegistry();
    const allowed = allowedSkillsForContext(context, registry);
    const prepared = preparedInput ?? await this.resolver.prepareCompleteActiveSet(this.runtimeMode);
    const managerEvidence = { agentDefinitionId: prepared.manager.version.agentId, agentVersionId: prepared.manager.version.id, agentConfigSnapshot: prepared.manager.snapshot };
    const startedAtMs = Date.now();
    let route: Awaited<ReturnType<typeof this.runtime.route>>;
    try {
      const routeInput = {
        stage: context.stage,
        operation: context.operation,
        intent: context.intent,
        availableSkills: allowed.map((skill) => ({ id: skill.id, description: skill.description })),
      };
      route = this.runtimeMode === "real"
        ? await (this.runtime as OpenAIManagerRuntime).route(routeInput, prepared.manager)
        : await (this.runtime as FakeModelRuntime).route(routeInput);
    } catch (error) {
      await this.repositories.evidence.recordModelCall({
        id: randomUUID(), bookletId: context.bookletId, operation: "manager", skillId: null,
        provider: this.runtimeMode === "real" ? "openai" : "fake", model: this.runtimeMode === "real" ? prepared.manager.version.modelId : "fake-manager-v1",
        traceId: context.traceId, status: "failed", attempt: 1, startedAtMs, latencyMs: Math.max(0, Date.now() - startedAtMs),
        inputReference: { stage: context.stage, operation: context.operation }, errorMessage: error instanceof Error ? error.message : "Manager routing failed.", errorKind: classifyModelError(error),
        ...modelCallCost({ runtimeMode: this.runtimeMode, modelId: prepared.manager.version.modelId, usage: this.runtimeMode === "fake" ? fakeRunMetadata.usage : null }),
        ...managerEvidence,
      });
      if (error instanceof ZodError) {
        throw new RecoverableApplicationError({ code: "skill_contract_mismatch", message: "This step returned an incompatible result. Your booklet work is unchanged; retry this step.", status: 409 });
      }
      throw error;
    }
    if (!allowed.some((skill) => skill.id === route.skillId)) {
      const error = new RecoverableApplicationError({ code: "skill_contract_mismatch", message: "The selected step is not valid for the saved booklet state. Retry this step.", status: 409 });
      await this.repositories.evidence.recordModelCall({
        id: randomUUID(), bookletId: context.bookletId, operation: "manager", skillId: null,
        provider: this.runtimeMode === "real" ? "openai" : "fake", model: this.runtimeMode === "real" ? prepared.manager.version.modelId : "fake-manager-v1",
        traceId: context.traceId, status: "failed", attempt: 1, startedAtMs, latencyMs: Math.max(0, Date.now() - startedAtMs),
        inputReference: { stage: context.stage, operation: context.operation }, outputReference: { skillId: route.skillId }, errorMessage: error.message, errorKind: "validation",
        ...modelCallCost({ runtimeMode: this.runtimeMode, modelId: prepared.manager.version.modelId, usage: this.runtimeMode === "fake" ? fakeRunMetadata.usage : null }),
        ...managerEvidence,
      });
      throw error;
    }
    const managerRunMetadata: AgentRunMetadata | null = "runMetadata" in route ? route.runMetadata as AgentRunMetadata : this.runtimeMode === "fake" ? fakeRunMetadata : null;
    const managerLatencyMs = Math.max(0, Date.now() - startedAtMs);
    await this.repositories.evidence.recordModelCall({
      id: randomUUID(),
      bookletId: context.bookletId,
      operation: "manager",
      skillId: null,
      provider: this.runtimeMode === "real" ? "openai" : "fake",
      model: this.runtimeMode === "real" ? prepared.manager.version.modelId : "fake-manager-v1",
      traceId: context.traceId,
      status: "succeeded",
      attempt: 1,
      startedAtMs,
      latencyMs: managerLatencyMs,
      inputReference: { stage: context.stage, operation: context.operation },
      outputReference: { skillId: route.skillId, arguments: route.arguments, explanation: route.explanation },
      usage: managerRunMetadata?.usage ?? null,
      providerRequestId: managerRunMetadata?.providerRequestId ?? null,
      ...modelCallCost({ runtimeMode: this.runtimeMode, modelId: prepared.manager.version.modelId, usage: managerRunMetadata?.usage ?? null }),
      ...managerEvidence,
    });
    const skill = registry.get(route.skillId);
    const specialistConfiguration = prepared.specialists.get(skill.id)!;
    const specialistEvidence = { agentDefinitionId: specialistConfiguration.version.agentId, agentVersionId: specialistConfiguration.version.id, agentConfigSnapshot: specialistConfiguration.snapshot };
    const rawInput = input.skillInput ?? (route.skillId === "intake_readiness@1" ? { cardId: input.cardId } : { intent: context.intent });
    const specialistStartedAtMs = Date.now();
    let specialistRunMetadata: AgentRunMetadata | null = this.runtimeMode === "fake" ? fakeRunMetadata : null;
    let parsedInput: unknown;
    try {
      parsedInput = skill.inputSchema.parse(rawInput);
    } catch (error) {
      await this.repositories.evidence.recordModelCall({
        id: randomUUID(), bookletId: context.bookletId, operation: "skill", skillId: skill.id,
        provider: this.runtimeMode === "real" ? "openai" : "fake", model: this.runtimeMode === "real" ? specialistConfiguration.version.modelId : "fake-skill-v1",
        traceId: context.traceId, status: "failed", attempt: 1, startedAtMs: specialistStartedAtMs, latencyMs: Math.max(0, Date.now() - specialistStartedAtMs),
        inputReference: rawInput, errorMessage: error instanceof Error ? error.message : "Skill input validation failed.", errorKind: classifyModelError(error),
        ...modelCallCost({ runtimeMode: this.runtimeMode, modelId: specialistConfiguration.version.modelId, usage: specialistRunMetadata?.usage ?? null }),
        ...specialistEvidence,
      });
      throw new RecoverableApplicationError({ code: "skill_contract_mismatch", message: "The saved step could not be prepared. Your booklet work is unchanged; retry this step.", status: 409 });
    }
    let rawOutput: unknown;
    try {
      if (this.specialistRuntime?.runWithMetadata) {
        const result = await this.specialistRuntime.runWithMetadata(skill, parsedInput, context, specialistConfiguration);
        rawOutput = result.output;
        specialistRunMetadata = result.runMetadata;
      } else {
        rawOutput = this.specialistRuntime
          ? await this.specialistRuntime.run(skill, parsedInput, context, specialistConfiguration)
          : await skill.run(parsedInput, context);
      }
    } catch (error) {
      await this.repositories.evidence.recordModelCall({
        id: randomUUID(), bookletId: context.bookletId, operation: "skill", skillId: skill.id,
        provider: this.runtimeMode === "real" ? "openai" : "fake", model: this.runtimeMode === "real" ? specialistConfiguration.version.modelId : "fake-skill-v1",
        traceId: context.traceId, status: "failed", attempt: 1, startedAtMs: specialistStartedAtMs, latencyMs: Math.max(0, Date.now() - specialistStartedAtMs),
        inputReference: rawInput, errorMessage: error instanceof Error ? error.message : "Specialist execution failed.", errorKind: classifyModelError(error),
        ...modelCallCost({ runtimeMode: this.runtimeMode, modelId: specialistConfiguration.version.modelId, usage: specialistRunMetadata?.usage ?? null }),
        ...specialistEvidence,
      });
      if (error instanceof ZodError) {
        throw new RecoverableApplicationError({ code: "skill_contract_mismatch", message: "This step returned an incompatible result. Your booklet work is unchanged; retry this step.", status: 409 });
      }
      throw error;
    }
    let output: unknown;
    try {
      output = skill.outputSchema.parse(rawOutput);
    } catch (error) {
      await this.repositories.evidence.recordModelCall({
        id: randomUUID(), bookletId: context.bookletId, operation: "skill", skillId: skill.id,
        provider: this.runtimeMode === "real" ? "openai" : "fake", model: this.runtimeMode === "real" ? specialistConfiguration.version.modelId : "fake-skill-v1",
        traceId: context.traceId, status: "failed", attempt: 1, startedAtMs: specialistStartedAtMs, latencyMs: Math.max(0, Date.now() - specialistStartedAtMs),
        inputReference: rawInput, errorMessage: error instanceof Error ? error.message : "Skill output validation failed.", errorKind: classifyModelError(error),
        ...modelCallCost({ runtimeMode: this.runtimeMode, modelId: specialistConfiguration.version.modelId, usage: specialistRunMetadata?.usage ?? null }),
        ...specialistEvidence,
      });
      throw new RecoverableApplicationError({ code: "skill_contract_mismatch", message: "This step returned an incompatible result. Your booklet work is unchanged; retry this step.", status: 409 });
    }
    await this.repositories.evidence.recordModelCall({
      id: randomUUID(),
      bookletId: context.bookletId,
      operation: "skill",
      skillId: skill.id,
      provider: this.runtimeMode === "real" ? "openai" : "fake",
      model: this.runtimeMode === "real" ? specialistConfiguration.version.modelId : "fake-skill-v1",
      traceId: context.traceId,
      status: "succeeded",
      attempt: 1,
      startedAtMs: specialistStartedAtMs,
      latencyMs: Math.max(0, Date.now() - specialistStartedAtMs),
      inputReference: rawInput,
      outputReference: output,
      usage: specialistRunMetadata?.usage ?? null,
      providerRequestId: specialistRunMetadata?.providerRequestId ?? null,
      ...modelCallCost({ runtimeMode: this.runtimeMode, modelId: specialistConfiguration.version.modelId, usage: specialistRunMetadata?.usage ?? null }),
      ...specialistEvidence,
    });
    return { traceId: context.traceId, route: route.skillId, output };
  }
}
