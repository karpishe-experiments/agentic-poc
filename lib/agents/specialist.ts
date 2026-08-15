import { Agent } from "@openai/agents";
import { z } from "zod";
import type { SkillContext } from "@/lib/contracts/skills";
import type { SkillDefinition } from "@/lib/skills/registry";

/**
 * A specialist authors only a validated, transient result. Application services
 * remain the sole owners of persistence, IDs, approvals, and workflow state.
 */
export function createSpecialistAgent(definition: SkillDefinition, input: unknown, context: SkillContext, options: { name: string; instructions: string; model: string; reasoning: "low" | "medium" | "high" }) {
  void input;
  // The Agents SDK accepts a Zod object as the top-level output type. Wrapping
  // each registered schema also supports the visual-direction discriminated
  // union while preserving the original skill schema for application validation.
  const outputEnvelope = z.object({ result: definition.outputSchema });

  return new Agent({
    name: options.name,
    instructions: options.instructions,
    model: options.model,
    modelSettings: {
      ...(options.reasoning ? { reasoning: { effort: options.reasoning } } : {}),
    },
    outputType: outputEnvelope,
  });
}
