import { Runner } from "@openai/agents";
import { z } from "zod";
import { createSpecialistAgent } from "@/lib/agents/specialist";
import { getServerEnv } from "@/lib/config/env";
import type { ResolvedAgentConfiguration } from "@/lib/application/agent-resolver";
import type { SkillContext } from "@/lib/contracts/skills";
import type { SkillDefinition } from "@/lib/skills/registry";
import { extractAgentRunMetadata, type AgentRunMetadata } from "@/lib/agents/run-metadata";

export type SpecialistRunResult = { output: unknown; runMetadata: AgentRunMetadata };

/** Real-provider adapter used only when MODEL_RUNTIME=real. */
export class OpenAISpecialistRuntime {
  private readonly runner = new Runner({ traceIncludeSensitiveData: getServerEnv().OPENAI_TRACE_INCLUDE_SENSITIVE_DATA });

  public constructor() {}

  public async run(definition: SkillDefinition, input: unknown, context: SkillContext, configuration: ResolvedAgentConfiguration): Promise<unknown> {
    return (await this.runWithMetadata(definition, input, context, configuration)).output;
  }

  public async runWithMetadata(definition: SkillDefinition, input: unknown, context: SkillContext, configuration: ResolvedAgentConfiguration): Promise<SpecialistRunResult> {
    const agent = createSpecialistAgent(definition, input, context, { name: configuration.version.displayName, instructions: configuration.version.instructions, model: configuration.version.modelId, reasoning: configuration.version.reasoningEffort });
    const outputEnvelope = z.object({ result: definition.outputSchema });
    const result = await this.runner.run(agent, JSON.stringify({
      skillId: definition.id,
      stage: context.stage,
      operation: context.operation,
      intent: context.intent,
      input,
      context: {
        knownFacts: context.knownFacts,
        recentMessages: context.recentMessages,
        approvedArtifactVersionIds: context.approvedArtifactVersionIds,
      },
    }), { maxTurns: configuration.version.maxTurns });
    return {
      output: definition.outputSchema.parse(outputEnvelope.parse(result.finalOutput).result),
      runMetadata: extractAgentRunMetadata(result),
    };
  }
}
