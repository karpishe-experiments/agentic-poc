import type { getServerEnv } from "@/lib/config/env";

export function isDifyExperimentAvailable(env: ReturnType<typeof getServerEnv>): boolean {
  return env.DIFY_EXPERIMENT_ENABLED && (env.DEPLOYMENT_ENV === "_staging" ||
    (env.DEPLOYMENT_ENV === "local" && env.DIFY_EXPERIMENT_MODE === "fake" && process.env.NODE_ENV === "development"));
}
