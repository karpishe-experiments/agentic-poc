import { Runner } from "@openai/agents";
import { createSpecialistAgent } from "@/lib/agents/specialist";
import { getModelRoleConfig, type ModelRole } from "@/lib/config/models";
import { getServerEnv } from "@/lib/config/env";
import type { SkillContext } from "@/lib/contracts/skills";
import type { SkillDefinition } from "@/lib/skills/registry";
import { extractAgentRunMetadata, type AgentRunMetadata } from "@/lib/agents/run-metadata";

export type SpecialistRunResult = { output: unknown; runMetadata: AgentRunMetadata };

/** Real-provider adapter used only when MODEL_RUNTIME=real. */
export class OpenAISpecialistRuntime {
  private readonly runner = new Runner({ traceIncludeSensitiveData: getServerEnv().OPENAI_TRACE_INCLUDE_SENSITIVE_DATA });

  public constructor(private readonly role: Extract<ModelRole, "skill" | "review"> = "skill") {}

  public async run(definition: SkillDefinition, input: unknown, context: SkillContext): Promise<unknown> {
    return (await this.runWithMetadata(definition, input, context)).output;
  }

  public async runWithMetadata(definition: SkillDefinition, input: unknown, context: SkillContext): Promise<SpecialistRunResult> {
    const role = getModelRoleConfig(this.role);
    const agent = createSpecialistAgent(definition, input, context, role);
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
    }), { maxTurns: 2 });
    return {
      output: definition.outputSchema.parse(result.finalOutput),
      runMetadata: extractAgentRunMetadata(result),
    };
  }
}
