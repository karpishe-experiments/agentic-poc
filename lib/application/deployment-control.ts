import { getDatabase } from "@/db/client";
import { getServerEnv } from "@/lib/config/env";

export class MaintenanceModeError extends Error {
  public readonly code = "deployment_maintenance";
  public readonly status = 503;
  public constructor(reason: string | null) {
    super(reason ? `Deployment maintenance is active: ${reason}` : "Deployment maintenance is active.");
  }
}

export async function readDeploymentControl() {
  const environment = getServerEnv().DEPLOYMENT_ENV;
  return (await getDatabase().collections.deployment_control.findOne({ environment })) ?? {
    _id: `environment:${environment}`, schemaVersion: "1" as const, environment, maintenance: false, reason: null, activeMutations: 0, updatedAtMs: 0,
  };
}

export async function assertMutationsAllowed(): Promise<void> {
  if (getServerEnv().DEPLOYMENT_ENV === "local") return;
  const control = await readDeploymentControl();
  if (control.maintenance) throw new MaintenanceModeError(control.reason);
}

export async function runTrackedMutation<T>(operation: () => Promise<T>): Promise<T> {
  if (process.env.DEPLOYMENT_ENV === undefined || process.env.DEPLOYMENT_ENV === "local") return operation();
  const environment = getServerEnv().DEPLOYMENT_ENV;
  const database = getDatabase();
  const admitted = await database.collections.deployment_control.findOneAndUpdate(
    { environment, maintenance: false },
    { $inc: { activeMutations: 1 }, $set: { updatedAtMs: Date.now() } },
    { returnDocument: "after" },
  );
  if (!admitted) throw new MaintenanceModeError((await readDeploymentControl()).reason);
  try { return await operation(); }
  finally { await database.collections.deployment_control.updateOne({ environment }, { $inc: { activeMutations: -1 }, $set: { updatedAtMs: Date.now() } }); }
}

export async function resetActiveMutationsForSingleTaskStartup(): Promise<void> {
  if (process.env.DEPLOYMENT_ENV === undefined || process.env.DEPLOYMENT_ENV === "local") return;
  const environment = getServerEnv().DEPLOYMENT_ENV;
  await getDatabase().collections.deployment_control.updateOne({ environment }, { $set: { activeMutations: 0, updatedAtMs: Date.now() } });
}

export async function setMaintenanceMode(maintenance: boolean, reason: string | null): Promise<void> {
  const environment = getServerEnv().DEPLOYMENT_ENV;
  await getDatabase().collections.deployment_control.updateOne(
    { environment },
    { $set: { schemaVersion: "1", environment, maintenance, reason, updatedAtMs: Date.now() }, $setOnInsert: { _id: `environment:${environment}`, activeMutations: 0 } },
    { upsert: true },
  );
}
