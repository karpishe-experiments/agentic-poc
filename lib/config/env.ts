import path from "node:path";
import { z } from "zod";

const reasoningSchema = z.enum(["low", "medium", "high"]);

export const serverEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MANAGER_MODEL: z.string().min(1).default("gpt-5.6-luna"),
  OPENAI_MANAGER_REASONING: reasoningSchema.default("low"),
  OPENAI_SKILL_MODEL: z.string().min(1).default("gpt-5.6-terra"),
  OPENAI_SKILL_REASONING: reasoningSchema.default("medium"),
  OPENAI_REVIEW_MODEL: z.string().min(1).default("gpt-5.6-sol"),
  OPENAI_REVIEW_REASONING: reasoningSchema.default("medium"),
  OPENAI_IMAGE_MODEL: z.string().min(1).default("gpt-image-2"),
  DATABASE_URL: z.string().min(1).default("file:./data/booklets.db"),
  DATA_ROOT: z.string().min(1).default("./data/assets"),
  IMAGE_QUALITY: z.enum(["low", "medium", "high", "balanced"]).default("balanced"),
  OPENAI_TRACE_INCLUDE_SENSITIVE_DATA: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse(source);
}

export function resolveDataRoot(env: Pick<ServerEnv, "DATA_ROOT">): string {
  return path.resolve(process.cwd(), env.DATA_ROOT);
}
