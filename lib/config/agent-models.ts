import { z } from "zod";

export const agentProviderSchema = z.literal("openai");
export const agentReasoningEffortSchema = z.enum(["low", "medium", "high"]);
export const agentModelIdSchema = z.enum(["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]);

export type AgentModelId = z.infer<typeof agentModelIdSchema>;
export type AgentRoleForModel = "manager" | "specialist";

export type AgentModelCatalogEntry = {
  id: AgentModelId;
  provider: "openai";
  allowedRoles: readonly AgentRoleForModel[];
  allowedReasoning: readonly z.infer<typeof agentReasoningEffortSchema>[];
  supportsFunctionCalling: true;
  supportsStructuredOutputs: true;
  pricing: { inputPerToken: number; outputPerToken: number; version: string } | null;
};

export const agentModelCatalog: Record<AgentModelId, AgentModelCatalogEntry> = {
  "gpt-5.6-luna": {
    id: "gpt-5.6-luna", provider: "openai", allowedRoles: ["manager", "specialist"], allowedReasoning: ["low", "medium", "high"],
    supportsFunctionCalling: true, supportsStructuredOutputs: true,
    pricing: { inputPerToken: 0.0000002, outputPerToken: 0.0000012, version: "poc-estimate-2026-08-15" },
  },
  "gpt-5.6-terra": {
    id: "gpt-5.6-terra", provider: "openai", allowedRoles: ["manager", "specialist"], allowedReasoning: ["low", "medium", "high"],
    supportsFunctionCalling: true, supportsStructuredOutputs: true,
    pricing: { inputPerToken: 0.000002, outputPerToken: 0.000012, version: "poc-estimate-2026-08-15" },
  },
  "gpt-5.6-sol": {
    id: "gpt-5.6-sol", provider: "openai", allowedRoles: ["manager", "specialist"], allowedReasoning: ["low", "medium", "high"],
    supportsFunctionCalling: true, supportsStructuredOutputs: true,
    pricing: { inputPerToken: 0.000005, outputPerToken: 0.00003, version: "poc-estimate-2026-08-15" },
  },
};

export function getAgentModel(id: AgentModelId): AgentModelCatalogEntry {
  return agentModelCatalog[id];
}

export function isCompatibleAgentModel(input: { modelId: AgentModelId; role: AgentRoleForModel; reasoning: z.infer<typeof agentReasoningEffortSchema> }): boolean {
  const model = getAgentModel(input.modelId);
  return model.allowedRoles.includes(input.role) && model.allowedReasoning.includes(input.reasoning);
}
