import type { MongoDatabaseContext } from "@/db/client";
import type { AssetStore } from "@/lib/assets/asset-store";
import { verifyMongoStructure, assertActiveAgentCoverage, type ActiveAgentMetadata } from "@/db/setup";
import { readBookletRunnerConfig } from "@/lib/experiment-runner/config";
import { operationBudgetRemainingMs, remainingOperationMs } from "@/lib/operations/budget";

const errorKinds = new Set(["MongoOperationTimeoutError", "MongoNetworkError", "MongoServerSelectionError", "MongoServerError", "OperationBudgetExpired", "AbortError"]);
/** Maintenance diagnostics contain fixed identifiers and counts, never database content. */
export async function deploymentRead<T>(phase: "connection" | "structure" | "admission" | "seed" | "target" | "cleanup", operation: string, action: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const value = await action();
    console.error(JSON.stringify({ diagnostic: "deployment_read", phase, operation, outcome: "completed", elapsedMs: Date.now() - started,
      remainingBudgetMs: operationBudgetRemainingMs(), returnedRows: Array.isArray(value) ? value.length : value === null ? 0 : 1 }));
    return value;
  } catch (error) {
    console.error(JSON.stringify({ diagnostic: "deployment_read", phase, operation, outcome: "failed", elapsedMs: Date.now() - started,
      remainingBudgetMs: operationBudgetRemainingMs(), errorKind: error instanceof Error && errorKinds.has(error.name) ? error.name : "read_failed" }));
    throw error;
  }
}

/** Availability checks are bounded by required metadata, independent of retained experiment history. */
export async function verifyDeploymentState(context: MongoDatabaseContext, assets?: AssetStore): Promise<void> {
  await deploymentRead("connection", "ping", () => context.database.command({ ping: 1 }, { timeoutMS: remainingOperationMs() }));
  const profile = readBookletRunnerConfig();
  if (!profile.enabled && profile.reason === "invalid") throw new Error("Booklet runner configuration is invalid.");
  await deploymentRead("structure", "collections_and_indexes", () => verifyMongoStructure(context));
  const environment = process.env.DEPLOYMENT_ENV ?? "local";
  const control = await deploymentRead("admission", "deployment_control", () => context.collections.deployment_control.findOne({ _id: `environment:${environment}`, environment }));
  if (!control || control.schemaVersion !== "1" || typeof control.maintenance !== "boolean" || !Number.isSafeInteger(control.activeMutations) || control.activeMutations < 0 ||
    (control.draining !== undefined && typeof control.draining !== "boolean") || !Number.isSafeInteger(control.interruptedMutations ?? 0) || (control.interruptedMutations ?? 0) < 0 ||
    (control.mutationOwners !== undefined && !Array.isArray(control.mutationOwners))) throw new Error("Deployment admission metadata is incompatible.");
  const styles = await deploymentRead("seed", "style_catalog", () => context.collections.style_catalog.find({ _id: { $in: ["soft-watercolor", "cut-paper-collage", "colored-pencil"] } }, { projection: { _id: 1, previewAssetId: 1 } }).limit(3).toArray());
  for (const id of ["soft-watercolor", "cut-paper-collage", "colored-pencil"]) {
    const style = styles.find(row => row._id === id);
    if (!style) throw new Error("Required style seed is missing.");
    const asset = await deploymentRead("seed", "style_asset", () => context.collections.assets.findOne({ _id: style.previewAssetId }, { projection: { uri: 1, kind: 1, mimeType: 1 } }));
    if (!asset || asset.kind !== "style_preview" || asset.mimeType !== "image/png" || (assets && !await assets.exists(asset.uri))) throw new Error("Required style asset is unavailable.");
  }
  if (!profile.enabled) {
    const active = await deploymentRead("seed", "active_agent_coverage", () => context.collections.agent_versions.find<ActiveAgentMetadata>({ isActive: true }, {
      projection: { _id: 0, isActive: 1, role: 1, skillId: 1, imageTarget: 1, profileId: 1, profileVersion: 1 },
    }).toArray());
    assertActiveAgentCoverage(active);
  }
}
