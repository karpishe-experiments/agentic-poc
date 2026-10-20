import { setupMongoStructure, seedDefaultAgents } from "@/db/setup";
import { seedVisualAssets } from "@/db/seed";
import type { MongoDatabaseContext } from "@/db/client";
import type { AssetStore } from "@/lib/assets/asset-store";
import { verifyDeploymentState, deploymentRead } from "@/db/deployment-readiness";
import { readBookletRunnerConfig } from "@/lib/experiment-runner/config";

export async function initializeMongoData(context: MongoDatabaseContext, assets: AssetStore): Promise<void> {
  await deploymentRead("structure", "setup_structure", () => setupMongoStructure(context));
  const environment = process.env.DEPLOYMENT_ENV ?? "local";
  await context.collections.deployment_control.updateOne(
    { environment },
    { $setOnInsert: { _id: `environment:${environment}`, schemaVersion: "1", environment, maintenance: false, reason: null, activeMutations: 0, updatedAtMs: Date.now() } },
    { upsert: true },
  );
  const profile = readBookletRunnerConfig();
  if (!profile.enabled && profile.reason === "invalid") throw new Error("Booklet runner configuration is invalid.");
  if (!profile.enabled) {
    const definitions = await context.collections.agent_definitions.countDocuments();
    const versions = await context.collections.agent_versions.countDocuments();
    const events = await context.collections.agent_version_events.countDocuments();
    if (definitions === 0 && versions === 0 && events === 0) await seedDefaultAgents(context);
    else if (definitions === 0 || versions === 0 || events === 0) throw new Error("Runtime-agent seed collections are partially initialized.");
  }
  await deploymentRead("seed", "prepare_assets", () => seedVisualAssets(context, assets, Date.now(), true));
  await verifyDeploymentState(context, assets);
}
