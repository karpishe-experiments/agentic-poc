import { Runner } from "@openai/agents";
import { createManagerAgent } from "@/lib/agents/manager";
import { getServerEnv } from "@/lib/config/env";
import type { ResolvedAgentConfiguration } from "@/lib/application/agent-resolver";
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

  public async route(input: ManagerRouteInput, configuration: ResolvedAgentConfiguration): Promise<RoutedManagerResult> {
    const parsed = managerRouteInputSchema.parse(input);
    const allowedSkills = parsed.availableSkills.map((skill) => this.registry.get(skill.id));
    const result = await this.runner.run(createManagerAgent(allowedSkills, parsed.stage, { name: configuration.version.displayName, instructions: configuration.version.instructions!, model: configuration.version.modelId, reasoning: configuration.version.reasoningEffort! }), JSON.stringify({
      stage: parsed.stage,
      operation: parsed.operation,
      intent: parsed.intent,
      availableSkills: parsed.availableSkills,
    }), {
      maxTurns: configuration.version.maxTurns!,
    });
    const route = managerRouteResultSchema.parse(result.finalOutput);
    if (!parsed.availableSkills.some((skill) => skill.id === route.skillId)) throw new Error("The manager selected a skill that is not allowed for this stage.");
    return { ...route, runMetadata: extractAgentRunMetadata(result) };
  }
}
