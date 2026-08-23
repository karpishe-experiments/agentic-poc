import path from "node:path";
import { z } from "zod";

export const serverEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  MODEL_RUNTIME: z.enum(["fake", "real"]).default("fake"),
  IMAGE_PROVIDER_MODE: z.enum(["fake", "real"]).default("fake"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  BFL_API_KEY: z.string().min(1).optional(),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/?replicaSet=rs0"),
  MONGODB_DATABASE: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/).default("kids_booklet"),
  DATA_ROOT: z.string().min(1).default("./data/assets"),
  COMIC_COPY_MODE: z.enum(["creative", "exact"]).default("creative"),
  OPENAI_TRACE_INCLUDE_SENSITIVE_DATA: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse(source);
}

export function resolveDataRoot(env: Pick<ServerEnv, "DATA_ROOT">): string {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), env.DATA_ROOT);
}


export function resolveComicCopyMode(source: Record<string, string | undefined> = process.env) {
  return source.COMIC_COPY_MODE === "exact" ? "exact" as const : "creative" as const;
}
