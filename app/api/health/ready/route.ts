import { getDatabase } from "@/db/client";
import { createAssetStore } from "@/lib/assets/create-asset-store";
import { readDeploymentControl } from "@/lib/application/deployment-control";
import { getRunnerStatus } from "@/lib/jobs/runner-bootstrap";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await getDatabase().database.command({ ping: 1 });
    const seedAsset = await getDatabase().collections.assets.findOne({ _id: "00000000-0000-4000-8000-000000000001" });
    const assets = Boolean(seedAsset && await createAssetStore().exists(seedAsset.uri));
    const [control, runner] = await Promise.all([readDeploymentControl(), Promise.resolve(getRunnerStatus())]);
    const runnerReady = runner.started && runner.initialized && !runner.fatalError && Boolean(runner.heartbeatAtMs && Date.now() - runner.heartbeatAtMs < 30_000);
    const ready = assets && (process.env.RUNNER_ENABLED === "false" || runnerReady);
    return Response.json({ status: ready ? "ready" : "not_ready", checks: { mongodb: true, assets, maintenance: control.maintenance, runner } }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Readiness check failed", error);
    return Response.json({ status: "not_ready", checks: { mongodb: false } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
