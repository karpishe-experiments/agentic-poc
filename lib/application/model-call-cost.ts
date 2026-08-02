import { estimateModelCostUsd, pricingVersion } from "@/lib/config/pricing";
import type { ModelRole } from "@/lib/config/models";

export function modelCallCost(input: {
  runtimeMode: "fake" | "real";
  role: ModelRole;
  usage: { inputTokens: number; outputTokens: number } | null;
}) {
  if (input.runtimeMode === "fake") {
    return { actualCostUsd: "0", estimatedCostUsd: "0", pricingVersion: "fake-runtime-v1" };
  }
  return {
    actualCostUsd: null,
    estimatedCostUsd: input.usage ? estimateModelCostUsd({ role: input.role, ...input.usage }).toFixed(6) : null,
    pricingVersion: input.usage ? pricingVersion : null,
  };
}
