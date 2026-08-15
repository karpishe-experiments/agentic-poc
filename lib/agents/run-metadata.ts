export type AgentRunMetadata = {
  usage: { inputTokens: number; outputTokens: number };
  providerRequestId: string | null;
};

/**
 * Keep the SDK-specific result shape at the provider boundary and persist only
 * the normalized fields required by the local evidence ledger.
 */
export function extractAgentRunMetadata(result: {
  state: { usage: { inputTokens: number; outputTokens: number } };
  lastResponseId: string | undefined;
}): AgentRunMetadata {
  return {
    usage: {
      inputTokens: result.state.usage.inputTokens,
      outputTokens: result.state.usage.outputTokens,
    },
    providerRequestId: result.lastResponseId ?? null,
  };
}

export function classifyModelError(error: unknown): string {
  const candidate = error as { status?: number; code?: string; name?: string } | undefined;
  if (candidate?.code === "credit_balance_exhausted") return "blocked";
  if (candidate?.status === 429 || candidate?.code === "rate_limit_exceeded") return "rate_limit";
  if (candidate?.status === 401 || candidate?.status === 403) return "authentication";
  if (candidate?.status && candidate.status >= 500) return "unavailable";
  if (candidate?.name === "ZodError") return "validation";
  return "unknown";
}
