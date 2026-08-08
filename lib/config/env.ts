import path from "node:path";
import { z } from "zod";

const reasoningSchema = z.enum(["low", "medium", "high"]);
const imageQualitySchema = z.enum(["low", "medium", "high", "balanced"]);

export const serverEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  MODEL_RUNTIME: z.enum(["fake", "real"]).default("fake"),
  IMAGE_PROVIDER_MODE: z.enum(["fake", "real", "fast"]).default("fake"),
  OPENAI_MANAGER_MODEL: z.string().min(1).default("gpt-5.6-luna"),
  OPENAI_MANAGER_REASONING: reasoningSchema.default("low"),
  OPENAI_SKILL_MODEL: z.string().min(1).default("gpt-5.6-terra"),
  OPENAI_SKILL_REASONING: reasoningSchema.default("medium"),
  OPENAI_REVIEW_MODEL: z.string().min(1).default("gpt-5.6-sol"),
  OPENAI_REVIEW_REASONING: reasoningSchema.default("medium"),
  OPENAI_IMAGE_MODEL: z.string().min(1).default("gpt-image-2"),
  DATABASE_URL: z.string().min(1).default("file:./data/booklets.db"),
  DATA_ROOT: z.string().min(1).default("./data/assets"),
  IMAGE_QUALITY: imageQualitySchema.default("balanced"),
  OPENAI_TRACE_INCLUDE_SENSITIVE_DATA: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse(source);
}

export function resolveDataRoot(env: Pick<ServerEnv, "DATA_ROOT">): string {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), env.DATA_ROOT);
}

export function resolveImageProviderProfile(env: Pick<ServerEnv, "IMAGE_PROVIDER_MODE" | "IMAGE_QUALITY">) {
  if (env.IMAGE_PROVIDER_MODE === "fake") {
    return { runtime: "fake", quality: env.IMAGE_QUALITY, fastOutput: false } as const;
  }

  if (env.IMAGE_PROVIDER_MODE === "fast") {
    return { runtime: "real", quality: "low", fastOutput: true } as const;
  }

  return { runtime: "real", quality: env.IMAGE_QUALITY, fastOutput: false } as const;
}
