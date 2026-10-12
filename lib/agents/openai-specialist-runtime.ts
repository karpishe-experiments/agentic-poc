import { OpenAIProvider, Runner } from "@openai/agents";
import OpenAI from "openai";
import { z } from "zod";
import { createSpecialistAgent } from "@/lib/agents/specialist";
import { getServerEnv } from "@/lib/config/env";
import type { ResolvedAgentConfiguration } from "@/lib/application/agent-resolver";
import type { SkillContext } from "@/lib/contracts/skills";
import type { SkillDefinition } from "@/lib/skills/registry";
import { extractAgentRunMetadata, type AgentRunMetadata } from "@/lib/agents/run-metadata";
import { operationSignal } from "@/lib/operations/budget";

export type SpecialistRunResult = { output: unknown; runMetadata: AgentRunMetadata };

/** Real-provider adapter used only when MODEL_RUNTIME=real. */
export class OpenAISpecialistRuntime {
  private readonly runner: Runner;

  public constructor() {
    const env = getServerEnv();
    this.runner = new Runner({
      traceIncludeSensitiveData: env.OPENAI_TRACE_INCLUDE_SENSITIVE_DATA,
      modelProvider: new OpenAIProvider({
        openAIClient: new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0 }),
      }),
    });
  }

  public async run(definition: SkillDefinition, input: unknown, context: SkillContext, configuration: ResolvedAgentConfiguration): Promise<unknown> {
    return (await this.runWithMetadata(definition, input, context, configuration)).output;
  }

  public async runWithMetadata(definition: SkillDefinition, input: unknown, context: SkillContext, configuration: ResolvedAgentConfiguration): Promise<SpecialistRunResult> {
    const agent = createSpecialistAgent(definition, input, context, { name: configuration.version.displayName, instructions: configuration.version.instructions!, model: configuration.version.modelId, reasoning: configuration.version.reasoningEffort! });
    const outputEnvelope = z.object({ result: definition.outputSchema });
    const signal = operationSignal();
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
    }), { maxTurns: configuration.version.maxTurns, ...(signal ? { signal } : {}) });
    return {
      output: definition.outputSchema.parse(outputEnvelope.parse(result.finalOutput).result),
      runMetadata: extractAgentRunMetadata(result),
    };
  }
}
