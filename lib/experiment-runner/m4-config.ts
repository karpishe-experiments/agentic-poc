import { z } from "zod";
import manifest from "@/lib/experiment-runner/m4-campaign-manifest.json";
import realManifest from "@/lib/experiment-runner/real-readiness-manifest.json";
import { readBookletRunnerConfig, type ConfigState } from "@/lib/experiment-runner/config";
import { realReadinessFromManifest } from "@/lib/experiment-runner/real-config";
import { m4AdmittedTokenPolicy, m4GrantSchema, m4PolicySchema, m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { m4RequestBundleMatches } from "@/lib/experiment-runner/m4-request";

// Non-secret reviewed release input. Ready records technical configuration;
// granted additionally records the user's later explicit campaign instruction.
// No HTTP input, environment variable or unused allowance can create a grant.
export const m4CampaignManifestSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("disabled") }),
  z.strictObject({ state: z.literal("ready"), policy: m4PolicySchema }),
  z.strictObject({ state: z.literal("granted"), policy: m4PolicySchema, grant: m4GrantSchema }),
]);

export function readM4RunnerConfig(env: Record<string, string | undefined> = process.env,
  rawManifest: unknown = manifest, rawRealManifest: unknown = realManifest): ConfigState {
  const baseState = readBookletRunnerConfig(env);
  if (!baseState.enabled) return baseState;
  const real = env.DEPLOYMENT_ENV === "_staging" ? realReadinessFromManifest(baseState.config, rawRealManifest) : undefined;
  const base = real ? { ...baseState, config: { ...baseState.config, real } } : baseState;
  const unavailable = () => ({ ...base, config: { ...base.config, m4: { state: "invalid" as const } } });
  const parsed = m4CampaignManifestSchema.safeParse(rawManifest);
  if (!parsed.success) return unavailable();
  if (parsed.data.state === "disabled") return { ...base, config: { ...base.config, m4: { state: "disabled" } } };
  // The campaign is staging-only; local focused cases use explicitly injected
  // private authority, rather than enabling this production entry point.
  if (env.DEPLOYMENT_ENV !== "_staging") return unavailable();
  const snapshot = m4PolicySnapshot(parsed.data.policy);
  const adapterUpdate = parsed.data.state === "granted" ? parsed.data.grant.providerAdapterUpdate : undefined;
  if (adapterUpdate && adapterUpdate.fromIdentity !== snapshot.policy.pluginIdentity) return unavailable();
  try { if (parsed.data.state === "granted") m4AdmittedTokenPolicy(snapshot.policy, parsed.data.grant); }
  catch { return unavailable(); }
  if (!m4RequestBundleMatches(snapshot.policy, parsed.data.state === "granted" ? parsed.data.grant : undefined) ||
      snapshot.policy.publications.length !== base.config.bindings.length || snapshot.policy.publications.some((expected) =>
        !base.config.bindings.some((actual) => actual.role === expected.role && actual.taskId === expected.taskId &&
          actual.persona === expected.persona && actual.appId === expected.appId &&
          actual.publishedWorkflowId === expected.publishedWorkflowId && actual.toolProviderId === expected.toolProviderId &&
          actual.finalPageIllustration === expected.finalPageIllustration))) return unavailable();
  return { ...base, config: { ...base.config, m4: parsed.data.state === "ready" ? { state: "ready" } : {
    state: "granted", authority: { policy: snapshot.policy, grant: Object.freeze({ ...parsed.data.grant }) },
  } } };
}
