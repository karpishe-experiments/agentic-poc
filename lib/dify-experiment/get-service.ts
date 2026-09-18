import "server-only";

import { getDatabase } from "@/db/client";
import { createAssetStore } from "@/lib/assets/create-asset-store";
import { getServerEnv } from "@/lib/config/env";
import { DifyExperimentService } from "@/lib/dify-experiment/service";
import { DifyExperimentAdapter } from "@/lib/dify-experiment/dify-adapter";
import { OpenAIExperimentImageAdapter } from "@/lib/dify-experiment/openai-image-adapter";
import { isDifyExperimentAvailable } from "@/lib/dify-experiment/availability";

export function getDifyExperimentService(): DifyExperimentService {
  const env = getServerEnv();
  return new DifyExperimentService({
    database: getDatabase(), assets: createAssetStore(),
    config: { enabled: isDifyExperimentAvailable(env), mode: env.DIFY_EXPERIMENT_MODE, imageEnabled: env.DIFY_IMAGE_ENABLED, imageMaxAttempts: env.DIFY_IMAGE_MAX_ATTEMPTS },
  });
}

export function getDifyExperimentAdapter(): DifyExperimentAdapter {
  const env = getServerEnv(); if (!env.DIFY_API_KEY) throw new Error("DIFY_API_KEY is required for real experiment mode.");
  return new DifyExperimentAdapter({ baseUrl: env.DIFY_BASE_URL, apiKey: env.DIFY_API_KEY });
}

export function getOpenAIExperimentImageAdapter(): OpenAIExperimentImageAdapter {
  const key = getServerEnv().DIFY_IMAGE_OPENAI_API_KEY;
  if (!key) throw new Error("DIFY_IMAGE_OPENAI_API_KEY is required for real experiment image generation.");
  return new OpenAIExperimentImageAdapter({ apiKey: key });
}
