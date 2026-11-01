import { z } from "zod";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { savedConfigurationItemSchema } from "@/lib/experiment-runner/config";
import { personaSchema, specialistTaskSchema } from "@/lib/contracts/experiment-runner";
import { m4PolicySchema, m4PolicySnapshot, m4TokenPolicySchema, m4TokenPolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { realExecutionPolicyFromM4TechnicalProfile } from "@/lib/experiment-runner/execution-policy";

// These are reviewed local package candidates, not an assertion of installed
// Dify state or model permissions. A later candidate needs an explicit update.
export const REAL_TEXT_PACKAGE_SHA256 = "a4eb441d0ac3ca84ccbe18b0f0be93b20c088ed6740a486dc490e66f14d24d53";
export const REAL_TEXT_PLUGIN_IDENTITY = "langgenius/openai:1.0.7-dev7@aa245c63d95bee61fbd250e86b5ab7da4accec08144e075e4a4d8dd94bf5eba2";
export const REAL_IMAGE_PACKAGE_SHA256 = "5f34caaee4b58e672eb3117ad0eb39fb4905049487844609c0b60d681a3a68ef";
export const REAL_IMAGE_PLUGIN_IDENTITY = "langgenius/openai_tool:0.2.2-dev3@8a7f865a47ce9e25260bd7d7cade70d4712506d945a7a2a66607f9f324160f05";

const publication = savedConfigurationItemSchema.extend({ taskId: specialistTaskSchema.nullable(), persona: personaSchema.nullable() });
export const realReadinessManifestSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("disabled") }),
  z.strictObject({ state: z.literal("ready"), schemaVersion: z.literal("booklet_real_readiness_v1"),
    sourcePolicy: m4PolicySchema, tokenPolicy: m4TokenPolicySchema,
    executionVersion: z.enum(["execution_v1", "execution_v2"]).optional(),
    textPluginIdentity: z.literal(REAL_TEXT_PLUGIN_IDENTITY), textPackageSha256: z.literal(REAL_TEXT_PACKAGE_SHA256),
    imagePluginIdentity: z.literal(REAL_IMAGE_PLUGIN_IDENTITY), imagePackageSha256: z.literal(REAL_IMAGE_PACKAGE_SHA256),
    nativeFileFormat: z.literal("base64"), publications: z.array(publication).length(18),
  }),
]);

/** Non-secret publication evidence borrows existing protected per-app API keys. */
export function realReadinessFromManifest(base: BookletRunnerConfig, raw: unknown): BookletRunnerConfig["real"] | undefined {
  const parsed = realReadinessManifestSchema.safeParse(raw);
  if (!parsed.success || parsed.data.state !== "ready" || base.bindings.length !== 18) return undefined;
  const ready = parsed.data;
  const source = m4PolicySnapshot(ready.sourcePolicy);
  if (ready.tokenPolicy.amendment.basePolicyHash !== source.hash ||
      ready.tokenPolicy.hash !== m4TokenPolicySnapshot(ready.tokenPolicy.amendment).hash) return undefined;
  const byApp = new Map(base.bindings.map(item => [item.appId, item]));
  if (byApp.size !== 18 || new Set(ready.publications.map(item => item.appId)).size !== 18 ||
      new Set(ready.publications.map(item => item.publishedWorkflowId)).size !== 18) return undefined;
  const bindings: BookletRunnerConfig["bindings"] = [];
  for (const item of ready.publications) {
    const prior = byApp.get(item.appId);
    if (!prior || prior.role !== item.role || prior.taskId !== item.taskId || prior.persona !== item.persona ||
        prior.finalPageIllustration !== item.finalPageIllustration || !prior.apiKey) return undefined;
    bindings.push({ ...item, apiKey: prior.apiKey });
  }
  try {
    realExecutionPolicyFromM4TechnicalProfile(source.policy, ready.tokenPolicy, ready.publications, ready);
  } catch { return undefined; }
  return { state: "ready", bindings,
    ...(ready.executionVersion ? { executionVersion: ready.executionVersion } : {}),
    sourcePolicy: source.policy, tokenPolicy: ready.tokenPolicy,
    textPluginIdentity: ready.textPluginIdentity, textPackageSha256: ready.textPackageSha256,
    imagePluginIdentity: ready.imagePluginIdentity, imagePackageSha256: ready.imagePackageSha256,
    nativeFileFormat: ready.nativeFileFormat };
}
