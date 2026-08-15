import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import { managerRouteResultSchema, type ManagerRouteResult } from "@/lib/contracts/skills";
import type { ArtifactType } from "@/lib/contracts/domain";
import type { SkillDefinition } from "@/lib/skills/registry";

const toolParameters = z.object({ intent: z.string().min(1) });

export function createManagerAgent(allowedSkills: SkillDefinition[], stage: ArtifactType, options: { name: string; instructions: string; model: string; reasoning: "low" | "medium" | "high" }) {
  const tools = allowedSkills.map((definition) => tool({
    name: definition.id.replaceAll("@", "_").replaceAll("-", "_"),
    description: definition.description,
    parameters: toolParameters,
    execute: ({ intent }): ManagerRouteResult => managerRouteResultSchema.parse({
      skillId: definition.id,
      arguments: { intent },
      explanation: `Selected ${definition.id} for the requested ${stage.replaceAll("_", " ")} work.`,
    }),
  }));
  return new Agent({
    name: options.name,
    instructions: options.instructions,
    model: options.model,
    modelSettings: {
      toolChoice: "required",
      parallelToolCalls: false,
      ...(options.reasoning ? { reasoning: { effort: options.reasoning } } : {}),
    },
    tools,
    outputType: managerRouteResultSchema,
    toolUseBehavior: "stop_on_first_tool",
  });
}
