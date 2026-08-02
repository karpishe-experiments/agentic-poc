import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import { managerRouteResultSchema, type ManagerRouteResult } from "@/lib/contracts/skills";
import type { SkillRegistry } from "@/lib/skills/registry";

const toolParameters = z.object({ intent: z.string().min(1) });

export function createManagerAgent(registry: SkillRegistry, stage: Parameters<SkillRegistry["getAllowed"]>[0], options: { model?: string; reasoning?: "low" | "medium" | "high" } = {}) {
  const tools = registry.getAllowed(stage).map((definition) => tool({
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
    name: "Kids Booklet manager",
    instructions: "Choose exactly one registered specialist tool. Never write data or perform workflow transitions.",
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
