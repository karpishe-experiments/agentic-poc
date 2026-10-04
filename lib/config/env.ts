import path from "node:path";
import { z } from "zod";
import { readBookletRunnerConfig } from "@/lib/experiment-runner/config";

export const serverEnvSchema = z.object({
  DEPLOYMENT_ENV: z.enum(["local", "_staging", "_prod"]).default("local"),
  ASSET_STORAGE: z.enum(["filesystem", "s3"]).default("filesystem"),
  // The AWS SDK is also the S3-compatible R2 client. `auto` is R2's region.
  AWS_REGION: z.string().default("auto"),
  OBJECT_STORE_ENDPOINT: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
  ASSETS_BUCKET: z.string().min(1).optional(),
  DIAGNOSTICS_BUCKET: z.string().min(1).optional(),
  RECOVERY_BUCKET: z.string().min(1).optional(),
  ACCESS_GATE_PASSWORD: z.string().min(16).optional(),
  RUNNER_ENABLED: z.enum(["true", "false"]).default("true"),
  OPENAI_API_KEY: z.string().optional().transform((value) => value ?? ""),
  DIFY_BOOKLET_RUNNER_ENABLED: z.enum(["true", "false"]).default("false"),
  DIFY_BOOKLET_BASE_URL: z.string().optional(),
  DIFY_BOOKLET_PUBLIC_ORIGIN: z.string().optional(),
  DIFY_BOOKLET_TOOL_KEY: z.string().optional(),
  DIFY_BOOKLET_BINDINGS_JSON: z.string().optional(),
  MODEL_RUNTIME: z.enum(["fake", "real"]).default("fake"),
  IMAGE_PROVIDER_MODE: z.enum(["fake", "real"]).default("fake"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  BFL_API_KEY: z.string().min(1).optional(),
  DIFY_EXPERIMENT_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  DIFY_EXPERIMENT_MODE: z.enum(["fake", "real"]).default("fake"),
  DIFY_IMAGE_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  DIFY_IMAGE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(2).default(2),
  DIFY_BASE_URL: z.string().url().default("https://api.dify.ai/v1"),
  DIFY_API_KEY: z.string().min(1).optional(),
  DIFY_TOOL_KEY: z.string().refine((value) => Buffer.byteLength(value, "utf8") >= 32, "DIFY_TOOL_KEY must contain at least 32 bytes.").optional(),
  DIFY_IMAGE_OPENAI_API_KEY: z.string().min(1).optional(),
  DIFY_COMMUNITY_PROBE_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  DIFY_COMMUNITY_BASE_URL: z.string().url().optional(),
  DIFY_COMMUNITY_WORKFLOW_API_KEY: z.string().min(1).optional(),
  DIFY_COMMUNITY_CALLBACK_KEY: z.string().min(32).optional(),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/?replicaSet=rs0"),
  MONGODB_DATABASE: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/).default("kids_booklet"),
  DATA_ROOT: z.string().min(1).default("./data/assets"),
  COMIC_COPY_MODE: z.enum(["creative", "exact"]).default("creative"),
  OPENAI_TRACE_INCLUDE_SENSITIVE_DATA: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
}).superRefine((env, context) => {
  if (env.DIFY_BOOKLET_RUNNER_ENABLED === "true") {
    const state = readBookletRunnerConfig({
      DEPLOYMENT_ENV: env.DEPLOYMENT_ENV, DIFY_BOOKLET_RUNNER_ENABLED: env.DIFY_BOOKLET_RUNNER_ENABLED,
      DIFY_BOOKLET_BASE_URL: env.DIFY_BOOKLET_BASE_URL, DIFY_BOOKLET_PUBLIC_ORIGIN: env.DIFY_BOOKLET_PUBLIC_ORIGIN,
      DIFY_BOOKLET_TOOL_KEY: env.DIFY_BOOKLET_TOOL_KEY, DIFY_BOOKLET_BINDINGS_JSON: env.DIFY_BOOKLET_BINDINGS_JSON,
    });
    if (!state.enabled) context.addIssue({ code: "custom", path: ["DIFY_BOOKLET_RUNNER_ENABLED"], message: "Booklet runner requires valid non-production bindings." });
  } else if (!env.OPENAI_API_KEY) {
    context.addIssue({ code: "custom", path: ["OPENAI_API_KEY"], message: "Required for the legacy execution profile." });
  }
  if (env.DIFY_COMMUNITY_PROBE_ENABLED) {
    if (env.DEPLOYMENT_ENV !== "_staging") context.addIssue({ code: "custom", path: ["DIFY_COMMUNITY_PROBE_ENABLED"], message: "Community probe is staging-only." });
    for (const key of ["DIFY_COMMUNITY_BASE_URL", "DIFY_COMMUNITY_WORKFLOW_API_KEY", "DIFY_COMMUNITY_CALLBACK_KEY"] as const) {
      if (!env[key]) context.addIssue({ code: "custom", path: [key], message: "Required when the Community probe is enabled." });
    }
    if (env.DIFY_COMMUNITY_BASE_URL && (new URL(env.DIFY_COMMUNITY_BASE_URL).protocol !== "https:" || new URL(env.DIFY_COMMUNITY_BASE_URL).pathname !== "/")) context.addIssue({ code: "custom", path: ["DIFY_COMMUNITY_BASE_URL"], message: "Use an HTTPS origin without a path." });
  }
  if (env.ASSET_STORAGE === "s3" && !env.ASSETS_BUCKET) context.addIssue({ code: "custom", path: ["ASSETS_BUCKET"], message: "S3 storage requires ASSETS_BUCKET." });
  if (env.DEPLOYMENT_ENV !== "local") {
    for (const key of ["ASSETS_BUCKET", "DIAGNOSTICS_BUCKET", "RECOVERY_BUCKET", "ACCESS_GATE_PASSWORD"] as const) {
      if (!env[key]) context.addIssue({ code: "custom", path: [key], message: "Required in deployed environments." });
    }
    if (env.ASSET_STORAGE !== "s3") context.addIssue({ code: "custom", path: ["ASSET_STORAGE"], message: "Deployed environments require S3." });
    if (!env.OBJECT_STORE_ENDPOINT) context.addIssue({ code: "custom", path: ["OBJECT_STORE_ENDPOINT"], message: "Deployed environments require OBJECT_STORE_ENDPOINT." });
    const expected = env.DEPLOYMENT_ENV === "_staging" ? "kids_booklet" : "kids_booklet_prod";
    if (env.MONGODB_DATABASE !== expected) context.addIssue({ code: "custom", path: ["MONGODB_DATABASE"], message: `Expected ${expected}.` });
  }
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
