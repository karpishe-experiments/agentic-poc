import type { ModelRole } from "@/lib/config/models";

export const pricingVersion = "poc-estimate-2026-08-02";

export function estimateModelCostUsd(input: { role: ModelRole; inputTokens: number; outputTokens: number }): number {
  // Standard OpenAI API rates checked 2026-08-02. Roles map to the defaults in
  // lib/config/models: Luna (manager), Terra (skill), and Sol (review).
  const rate = input.role === "manager"
    ? { input: 0.0000002, output: 0.0000012 }
    : input.role === "review"
      ? { input: 0.000005, output: 0.00003 }
      : { input: 0.000002, output: 0.000012 };
  return Number((input.inputTokens * rate.input + input.outputTokens * rate.output).toFixed(6));
}

export function estimateImageCostUsd(usage: { inputTokens: number; outputTokens: number } | null): number | null {
  if (!usage) return null;
  // GPT Image 2 image-token standard rates: $8/M input and $30/M output.
  return Number((usage.inputTokens * 0.000008 + usage.outputTokens * 0.00003).toFixed(6));
}
