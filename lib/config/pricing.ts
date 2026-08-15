import { getAgentModel, type AgentModelId } from "@/lib/config/agent-models";

export const pricingVersion = "poc-estimate-2026-08-02";

export function estimateModelCostUsd(input: { modelId: AgentModelId; inputTokens: number; outputTokens: number }): number | null {
  const rate = getAgentModel(input.modelId).pricing;
  if (!rate) return null;
  return Number((input.inputTokens * rate.inputPerToken + input.outputTokens * rate.outputPerToken).toFixed(6));
}

export function estimateImageCostUsd(usage: { inputTokens: number; outputTokens: number } | null): number | null {
  if (!usage) return null;
  // GPT Image 2 image-token standard rates: $8/M input and $30/M output.
  return Number((usage.inputTokens * 0.000008 + usage.outputTokens * 0.00003).toFixed(6));
}
