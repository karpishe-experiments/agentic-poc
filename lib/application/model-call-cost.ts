import { estimateModelCostUsd, pricingVersion } from "@/lib/config/pricing";
import type { AgentModelId } from "@/lib/config/agent-models";

export function modelCallCost(input: {
  runtimeMode: "fake" | "real";
  modelId: string;
  usage: { inputTokens: number; outputTokens: number } | null;
}) {
  if (input.runtimeMode === "fake") {
    return { actualCostUsd: "0", estimatedCostUsd: "0", pricingVersion: "fake-runtime-v1" };
  }
  return {
    actualCostUsd: null,
    estimatedCostUsd: input.usage ? estimateModelCostUsd({ modelId: input.modelId as AgentModelId, ...input.usage })?.toFixed(6) ?? null : null,
    pricingVersion: input.usage && estimateModelCostUsd({ modelId: input.modelId as AgentModelId, ...input.usage }) !== null ? pricingVersion : null,
  };
}
