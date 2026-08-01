import "server-only";

export const PRICING_VERSION = "unconfigured";

export type ModelPricing = {
  model: string;
  effectiveAt: string;
  inputUsdPerMillionTokens?: number;
  outputUsdPerMillionTokens?: number;
  imageUsdPerUnit?: number;
};

// Populated from verified provider pricing during the retained real-provider evaluation slice.
export const modelPricing: readonly ModelPricing[] = [];
