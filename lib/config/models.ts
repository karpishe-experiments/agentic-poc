import "server-only";

import type { ServerEnv } from "@/lib/config/env";

export type ModelRole = "manager" | "skill" | "review" | "image";

export function configuredModels(env: ServerEnv): Record<ModelRole, string> {
  return {
    manager: env.OPENAI_MANAGER_MODEL,
    skill: env.OPENAI_SKILL_MODEL,
    review: env.OPENAI_REVIEW_MODEL,
    image: env.OPENAI_IMAGE_MODEL,
  };
}
