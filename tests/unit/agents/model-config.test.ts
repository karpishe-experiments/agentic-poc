import { describe, expect, it } from "vitest";
import { agentModelCatalog, isCompatibleAgentModel } from "@/lib/config/agent-models";
import { estimateImageCostUsd, estimateModelCostUsd } from "@/lib/config/pricing";

describe("model role configuration", () => {
  it("keeps the text model catalog closed and role compatible", () => {
    expect(Object.keys(agentModelCatalog)).toEqual(["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]);
    expect(isCompatibleAgentModel({ modelId: "gpt-5.6-luna", role: "manager", reasoning: "low" })).toBe(true);
  });

  it("calculates deterministic non-negative estimates", () => {
    expect(estimateModelCostUsd({ modelId: "gpt-5.6-terra", inputTokens: 1_000, outputTokens: 500 })).toBeGreaterThan(0);
    expect(estimateImageCostUsd({ inputTokens: 1_000, outputTokens: 500 })).toBe(0.023);
    expect(estimateImageCostUsd(null)).toBeNull();
  });
});
