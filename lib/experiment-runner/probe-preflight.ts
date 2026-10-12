import { z } from "zod";
import type { Database } from "@/db/client";
import { opaqueIdSchema } from "@/lib/contracts/common";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";

export const probeIdentitySchema = z.strictObject({ appId: opaqueIdSchema, publication: opaqueIdSchema });
export const probeReadinessSchema = z.strictObject({ ready: z.literal(true), schemaVersion: z.literal("1"),
  appId: opaqueIdSchema, publication: opaqueIdSchema, callbackConfigured: z.literal(true), idle: z.literal(true),
  difySecretPresence: z.literal("verify_through_workspace_control") });

/** Read-only preflight. Workspace-only secret presence is not inferred from a runtime key. */
export async function checkProbeReadiness(database: Database, config: BookletRunnerConfig, identity: z.infer<typeof probeIdentitySchema>) {
  const manager = config.bindings.find(binding => binding.role === "manager");
  if (!manager || manager.appId !== identity.appId || manager.publishedWorkflowId !== identity.publication ||
      !manager.apiKey || !config.callbackKey) throw new Error("Probe binding differs.");
  const environment = process.env.DEPLOYMENT_ENV ?? "local";
  const [control, operations, preparations, runs, generation, execution, model, followups] = await Promise.all([
    database.collections.deployment_control.findOne({ environment }),
    database.collections.experiment_operations.countDocuments({ $or: [{ state: { $in: ["prepared", "started", "unknown"] } },
      { state: "succeeded", dispatchStartedAtMs: { $ne: null }, verifiedWorkflowId: null }, { "lifecycle.unresolved": true }] }),
    database.collections.experiment_runs.countDocuments({ preparation: { $ne: null }, $or: [
      { "preparation.outcome": { $ne: "failed" } }, { "preparation.unresolved": true }] }),
    database.collections.experiment_runs.countDocuments({ status: { $in: ["queued", "running"] } }),
    database.collections.generation_items.countDocuments({ status: "running" }),
    database.collections.execution_items.countDocuments({ status: "running" }),
    database.collections.model_calls.countDocuments({ status: "running" }),
    database.collections.card_responses.countDocuments({ followupStatus: "running" }),
  ]);
  if (!control || control.maintenance || control.draining || control.activeMutations || control.interruptedMutations ||
      control.mutationOwners?.length || operations || preparations || runs || generation || execution || model || followups) {
    throw new Error("Probe requires idle admission and resolved work.");
  }
  return probeReadinessSchema.parse({ ready: true, schemaVersion: "1", ...identity, callbackConfigured: true, idle: true,
    difySecretPresence: "verify_through_workspace_control" });
}
