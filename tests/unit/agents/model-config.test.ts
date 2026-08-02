import { describe, expect, it } from "vitest";
import { getModelRoleConfig } from "@/lib/config/models";
import { estimateImageCostUsd, estimateModelCostUsd } from "@/lib/config/pricing";

describe("model role configuration", () => {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    OPENAI_API_KEY: "test-key",
    OPENAI_MANAGER_MODEL: "manager-model",
    OPENAI_MANAGER_REASONING: "low",
    OPENAI_SKILL_MODEL: "skill-model",
    OPENAI_SKILL_REASONING: "medium",
    OPENAI_REVIEW_MODEL: "review-model",
    OPENAI_REVIEW_REASONING: "high",
    OPENAI_IMAGE_MODEL: "image-model",
    DATABASE_URL: "file:./test.db",
    DATA_ROOT: "./test-assets",
    IMAGE_QUALITY: "balanced",
    OPENAI_TRACE_INCLUDE_SENSITIVE_DATA: "false",
  };

  it("keeps manager, skill, and review roles explicit", () => {
    expect(getModelRoleConfig("manager", environment).model).toBe("manager-model");
    expect(getModelRoleConfig("skill", environment).model).toBe("skill-model");
    expect(getModelRoleConfig("review", environment).reasoning).toBe("high");
  });

  it("calculates deterministic non-negative estimates", () => {
    expect(estimateModelCostUsd({ role: "skill", inputTokens: 1_000, outputTokens: 500 })).toBeGreaterThan(0);
    expect(estimateImageCostUsd({ inputTokens: 1_000, outputTokens: 500 })).toBe(0.023);
    expect(estimateImageCostUsd(null)).toBeNull();
  });
});
