import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import type { SkillContext } from "@/lib/contracts/skills";
import type { SkillDefinition } from "@/lib/skills/registry";

/**
 * The model is deliberately constrained to one application-owned function tool.
 * It makes the specialist invocation observable without allowing the model to
 * manufacture persistent IDs, bypass artifact validation, or alter workflow state.
 */
export function createSpecialistAgent(definition: SkillDefinition, input: unknown, context: SkillContext, options: { model?: string; reasoning?: "low" | "medium" | "high" } = {}) {
  const executeSkill = tool({
    name: `execute_${definition.id.replaceAll("@", "_").replaceAll("-", "_")}`,
    description: `Execute the validated ${definition.id} specialist contract exactly once.`,
    parameters: z.object({}),
    execute: async () => definition.outputSchema.parse(await definition.run(definition.inputSchema.parse(input), context)),
  });

  return new Agent({
    name: `Kids Booklet ${definition.id} specialist`,
    instructions: [
      "You are a bounded Kids Booklet specialist.",
      "Call the single provided specialist tool exactly once for every request.",
      "Do not write workflow state, create IDs, or return prose instead of the tool result.",
    ].join(" "),
    model: options.model,
    modelSettings: {
      toolChoice: "required",
      parallelToolCalls: false,
      ...(options.reasoning ? { reasoning: { effort: options.reasoning } } : {}),
    },
    tools: [executeSkill],
    toolUseBehavior: "stop_on_first_tool",
  });
}
