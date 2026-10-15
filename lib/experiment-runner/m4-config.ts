import { z } from "zod";
import manifest from "@/lib/experiment-runner/m4-campaign-manifest.json";
import { readBookletRunnerConfig, type ConfigState } from "@/lib/experiment-runner/config";
import { m4GrantSchema, m4PolicySchema, m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { m4RequestBundleHash } from "@/lib/experiment-runner/m4-request";

// Non-secret reviewed release input. Ready records technical configuration;
// granted additionally records the user's later explicit campaign instruction.
// No HTTP input, environment variable or unused allowance can create a grant.
export const m4CampaignManifestSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("disabled") }),
  z.strictObject({ state: z.literal("ready"), policy: m4PolicySchema }),
  z.strictObject({ state: z.literal("granted"), policy: m4PolicySchema, grant: m4GrantSchema }),
]);

export function readM4RunnerConfig(env: Record<string, string | undefined> = process.env, rawManifest: unknown = manifest): ConfigState {
  const base = readBookletRunnerConfig(env);
  if (!base.enabled) return base;
  const unavailable = () => ({ ...base, config: { ...base.config, m4: { state: "invalid" as const } } });
  const parsed = m4CampaignManifestSchema.safeParse(rawManifest);
  if (!parsed.success) return unavailable();
  if (parsed.data.state === "disabled") return { ...base, config: { ...base.config, m4: { state: "disabled" } } };
  // The campaign is staging-only; local focused cases use explicitly injected
  // private authority, rather than enabling this production entry point.
  if (env.DEPLOYMENT_ENV !== "_staging") return unavailable();
  const snapshot = m4PolicySnapshot(parsed.data.policy);
  if (snapshot.policy.requestDefinitionHash !== m4RequestBundleHash() ||
      snapshot.policy.publications.length !== base.config.bindings.length || snapshot.policy.publications.some((expected) =>
        !base.config.bindings.some((actual) => actual.role === expected.role && actual.taskId === expected.taskId &&
          actual.persona === expected.persona && actual.appId === expected.appId &&
          actual.publishedWorkflowId === expected.publishedWorkflowId && actual.toolProviderId === expected.toolProviderId &&
          actual.finalPageIllustration === expected.finalPageIllustration))) return unavailable();
  return { ...base, config: { ...base.config, m4: parsed.data.state === "ready" ? { state: "ready" } : {
    state: "granted", authority: { policy: snapshot.policy, grant: Object.freeze({ ...parsed.data.grant }) },
  } } };
}
