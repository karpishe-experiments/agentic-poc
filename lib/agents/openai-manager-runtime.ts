import { Runner } from "@openai/agents";
import { createManagerAgent } from "@/lib/agents/manager";
import { getModelRoleConfig } from "@/lib/config/models";
import { getServerEnv } from "@/lib/config/env";
import { managerRouteInputSchema, managerRouteResultSchema, type ManagerRouteInput, type ManagerRouteResult } from "@/lib/contracts/skills";
import type { SkillRegistry } from "@/lib/skills/registry";
import { extractAgentRunMetadata, type AgentRunMetadata } from "@/lib/agents/run-metadata";

export type RoutedManagerResult = ManagerRouteResult & { runMetadata: AgentRunMetadata };

/**
 * Explicitly invoked real-manager seam. Automated tests construct FakeModelRuntime instead.
 */
export class OpenAIManagerRuntime {
  private readonly runner = new Runner({ traceIncludeSensitiveData: getServerEnv().OPENAI_TRACE_INCLUDE_SENSITIVE_DATA });

  public constructor(private readonly registry: SkillRegistry) {}

  public async route(input: ManagerRouteInput): Promise<RoutedManagerResult> {
    const parsed = managerRouteInputSchema.parse(input);
    const model = getModelRoleConfig("manager");
    const result = await this.runner.run(createManagerAgent(this.registry, parsed.stage, { model: model.model, reasoning: model.reasoning }), JSON.stringify({
      stage: parsed.stage,
      operation: parsed.operation,
      intent: parsed.intent,
      availableSkills: parsed.availableSkills,
    }), {
      maxTurns: 2,
    });
    const route = managerRouteResultSchema.parse(result.finalOutput);
    if (!parsed.availableSkills.some((skill) => skill.id === route.skillId)) throw new Error("The manager selected a skill that is not allowed for this stage.");
    return { ...route, runMetadata: extractAgentRunMetadata(result) };
  }
}
