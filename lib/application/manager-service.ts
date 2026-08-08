import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import { createDefaultSkillRegistry } from "@/lib/skills/default-registry";
import { FakeModelRuntime } from "@/lib/testing/fake-model-runtime";
import { OpenAIManagerRuntime } from "@/lib/agents/openai-manager-runtime";
import { OpenAISpecialistRuntime } from "@/lib/agents/openai-specialist-runtime";
import { getModelRoleConfig } from "@/lib/config/models";
import { skillContextSchema, type SkillContext } from "@/lib/contracts/skills";
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

  public constructor(dependencies: { database?: Database; repositories?: Repositories; runtime?: Pick<FakeModelRuntime, "route"> | Pick<OpenAIManagerRuntime, "route">; specialistRuntime?: SpecialistRuntime; runtimeMode?: "fake" | "real" } = {}) {
    const database = dependencies.database ?? createDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.runtimeMode = dependencies.runtimeMode ?? (process.env.MODEL_RUNTIME === "real" ? "real" : "fake");
    this.runtime = dependencies.runtime ?? (this.runtimeMode === "real" ? new OpenAIManagerRuntime(createDefaultSkillRegistry()) : new FakeModelRuntime());
    this.specialistRuntime = dependencies.specialistRuntime ?? (this.runtimeMode === "real" ? new OpenAISpecialistRuntime() : undefined);
  }

  public async run(contextInput: SkillContext, input: { cardId: string; skillInput?: unknown }): Promise<{ traceId: string; route: string; output: unknown }> {
    const context = skillContextSchema.parse(contextInput);
    const execute = () => this.runWithContext(context, input);
    if (this.runtimeMode === "real") {
      return withTrace("kids-booklet-poc", (trace) => this.runWithContext({ ...context, traceId: trace.traceId }, input), {
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

  private async runWithContext(context: SkillContext, input: { cardId: string; skillInput?: unknown }): Promise<{ traceId: string; route: string; output: unknown }> {
    const registry = createDefaultSkillRegistry();
    const allowed = allowedSkillsForContext(context, registry);
    const startedAtMs = Date.now();
    let route: Awaited<ReturnType<typeof this.runtime.route>>;
    try {
      route = await this.runtime.route({
        stage: context.stage,
        operation: context.operation,
        intent: context.intent,
        availableSkills: allowed.map((skill) => ({ id: skill.id, description: skill.description })),
      });
    } catch (error) {
      await this.repositories.evidence.recordModelCall({
        id: randomUUID(), bookletId: context.bookletId, operation: "manager", skillId: null,
        provider: this.runtimeMode === "real" ? "openai" : "fake", model: this.runtimeMode === "real" ? getModelRoleConfig("manager").model : "fake-manager-v1",
        traceId: context.traceId, status: "failed", attempt: 1, startedAtMs, latencyMs: Math.max(0, Date.now() - startedAtMs),
        inputReference: { stage: context.stage, operation: context.operation }, errorMessage: error instanceof Error ? error.message : "Manager routing failed.", errorKind: classifyModelError(error),
        ...modelCallCost({ runtimeMode: this.runtimeMode, role: "manager", usage: this.runtimeMode === "fake" ? fakeRunMetadata.usage : null }),
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
        provider: this.runtimeMode === "real" ? "openai" : "fake", model: this.runtimeMode === "real" ? getModelRoleConfig("manager").model : "fake-manager-v1",
        traceId: context.traceId, status: "failed", attempt: 1, startedAtMs, latencyMs: Math.max(0, Date.now() - startedAtMs),
        inputReference: { stage: context.stage, operation: context.operation }, outputReference: { skillId: route.skillId }, errorMessage: error.message, errorKind: "validation",
        ...modelCallCost({ runtimeMode: this.runtimeMode, role: "manager", usage: this.runtimeMode === "fake" ? fakeRunMetadata.usage : null }),
      });
      throw error;
    }
    const managerRunMetadata = "runMetadata" in route ? route.runMetadata : this.runtimeMode === "fake" ? fakeRunMetadata : null;
    const managerLatencyMs = Math.max(0, Date.now() - startedAtMs);
    await this.repositories.evidence.recordModelCall({
      id: randomUUID(),
      bookletId: context.bookletId,
      operation: "manager",
      skillId: null,
      provider: this.runtimeMode === "real" ? "openai" : "fake",
      model: this.runtimeMode === "real" ? getModelRoleConfig("manager").model : "fake-manager-v1",
      traceId: context.traceId,
      status: "succeeded",
      attempt: 1,
      startedAtMs,
      latencyMs: managerLatencyMs,
      inputReference: { stage: context.stage, operation: context.operation },
      outputReference: { skillId: route.skillId, arguments: route.arguments, explanation: route.explanation },
      usage: managerRunMetadata?.usage ?? null,
      providerRequestId: managerRunMetadata?.providerRequestId ?? null,
      ...modelCallCost({ runtimeMode: this.runtimeMode, role: "manager", usage: managerRunMetadata?.usage ?? null }),
    });
    const skill = registry.get(route.skillId);
    const rawInput = input.skillInput ?? (route.skillId === "intake_readiness@1" ? { cardId: input.cardId } : { intent: context.intent });
    const specialistStartedAtMs = Date.now();
    let specialistRunMetadata: AgentRunMetadata | null = this.runtimeMode === "fake" ? fakeRunMetadata : null;
    let parsedInput: unknown;
    try {
      parsedInput = skill.inputSchema.parse(rawInput);
    } catch (error) {
      await this.repositories.evidence.recordModelCall({
        id: randomUUID(), bookletId: context.bookletId, operation: "skill", skillId: skill.id,
        provider: this.runtimeMode === "real" ? "openai" : "fake", model: this.runtimeMode === "real" ? getModelRoleConfig("skill").model : "fake-skill-v1",
        traceId: context.traceId, status: "failed", attempt: 1, startedAtMs: specialistStartedAtMs, latencyMs: Math.max(0, Date.now() - specialistStartedAtMs),
        inputReference: rawInput, errorMessage: error instanceof Error ? error.message : "Skill input validation failed.", errorKind: classifyModelError(error),
        ...modelCallCost({ runtimeMode: this.runtimeMode, role: "skill", usage: specialistRunMetadata?.usage ?? null }),
      });
      throw new RecoverableApplicationError({ code: "skill_contract_mismatch", message: "The saved step could not be prepared. Your booklet work is unchanged; retry this step.", status: 409 });
    }
    let rawOutput: unknown;
    try {
      if (this.specialistRuntime?.runWithMetadata) {
        const result = await this.specialistRuntime.runWithMetadata(skill, parsedInput, context);
        rawOutput = result.output;
        specialistRunMetadata = result.runMetadata;
      } else {
        rawOutput = this.specialistRuntime
          ? await this.specialistRuntime.run(skill, parsedInput, context)
          : await skill.run(parsedInput, context);
      }
    } catch (error) {
      await this.repositories.evidence.recordModelCall({
        id: randomUUID(), bookletId: context.bookletId, operation: "skill", skillId: skill.id,
        provider: this.runtimeMode === "real" ? "openai" : "fake", model: this.runtimeMode === "real" ? getModelRoleConfig("skill").model : "fake-skill-v1",
        traceId: context.traceId, status: "failed", attempt: 1, startedAtMs: specialistStartedAtMs, latencyMs: Math.max(0, Date.now() - specialistStartedAtMs),
        inputReference: rawInput, errorMessage: error instanceof Error ? error.message : "Specialist execution failed.", errorKind: classifyModelError(error),
        ...modelCallCost({ runtimeMode: this.runtimeMode, role: "skill", usage: specialistRunMetadata?.usage ?? null }),
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
        provider: this.runtimeMode === "real" ? "openai" : "fake", model: this.runtimeMode === "real" ? getModelRoleConfig("skill").model : "fake-skill-v1",
        traceId: context.traceId, status: "failed", attempt: 1, startedAtMs: specialistStartedAtMs, latencyMs: Math.max(0, Date.now() - specialistStartedAtMs),
        inputReference: rawInput, errorMessage: error instanceof Error ? error.message : "Skill output validation failed.", errorKind: classifyModelError(error),
        ...modelCallCost({ runtimeMode: this.runtimeMode, role: "skill", usage: specialistRunMetadata?.usage ?? null }),
      });
      throw new RecoverableApplicationError({ code: "skill_contract_mismatch", message: "This step returned an incompatible result. Your booklet work is unchanged; retry this step.", status: 409 });
    }
    await this.repositories.evidence.recordModelCall({
      id: randomUUID(),
      bookletId: context.bookletId,
      operation: "skill",
      skillId: skill.id,
      provider: this.runtimeMode === "real" ? "openai" : "fake",
      model: this.runtimeMode === "real" ? getModelRoleConfig("skill").model : "fake-skill-v1",
      traceId: context.traceId,
      status: "succeeded",
      attempt: 1,
      startedAtMs: specialistStartedAtMs,
      latencyMs: Math.max(0, Date.now() - specialistStartedAtMs),
      inputReference: rawInput,
      outputReference: output,
      usage: specialistRunMetadata?.usage ?? null,
      providerRequestId: specialistRunMetadata?.providerRequestId ?? null,
      ...modelCallCost({ runtimeMode: this.runtimeMode, role: "skill", usage: specialistRunMetadata?.usage ?? null }),
    });
    return { traceId: context.traceId, route: route.skillId, output };
  }
}
