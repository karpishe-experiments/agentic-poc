import { getServerEnv } from "@/lib/config/env";

export type ModelRole = "manager" | "skill" | "review";

export function getModelRoleConfig(role: ModelRole, source: NodeJS.ProcessEnv = process.env) {
  const env = getServerEnv(source);
  if (role === "manager") return { provider: "openai", model: env.OPENAI_MANAGER_MODEL, reasoning: env.OPENAI_MANAGER_REASONING } as const;
  if (role === "review") return { provider: "openai", model: env.OPENAI_REVIEW_MODEL, reasoning: env.OPENAI_REVIEW_REASONING } as const;
  return { provider: "openai", model: env.OPENAI_SKILL_MODEL, reasoning: env.OPENAI_SKILL_REASONING } as const;
}
