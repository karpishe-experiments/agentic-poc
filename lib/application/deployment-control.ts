import { getDatabase } from "@/db/client";
import { getServerEnv } from "@/lib/config/env";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { MutationOwner } from "@/db/documents";
import { withCleanupBudget } from "@/lib/operations/budget";

const processKey = Symbol.for("booklet.mutation-process");
const processState = globalThis as typeof globalThis & { [processKey]?: string };
const processId = processState[processKey] ??= randomUUID();
const cleanupKey = Symbol.for("booklet.ended-mutations");
const cleanupState = globalThis as typeof globalThis & { [cleanupKey]?: Map<string, MutationOwner> };
const endedMutations = cleanupState[cleanupKey] ??= new Map<string, MutationOwner>();
type MutationOptions = { admitted?: boolean; runId?: string; operationId?: string };
const mutationContext = new AsyncLocalStorage<MutationOwner>();

export function currentMutationOwnerId(): string | undefined { return mutationContext.getStore()?.id; }

async function releaseEndedMutation(owner: MutationOwner): Promise<void> {
  await getDatabase().collections.deployment_control.updateOne({ environment: getServerEnv().DEPLOYMENT_ENV,
    mutationOwners: { $elemMatch: { id: owner.id, state: "active", processId: owner.processId } } },
  { $inc: { activeMutations: -1 }, $pull: { mutationOwners: { id: owner.id } }, $set: { updatedAtMs: Date.now() } });
  endedMutations.delete(owner.id);
}

export async function reconcileEndedMutations(): Promise<void> {
  // This process observed these exact mutation functions settle. Remote execution
  // remains tracked separately; a retry cannot decrement an already removed owner.
  for (const owner of endedMutations.values()) await withCleanupBudget(() => releaseEndedMutation(owner));
}

export async function bindTrackedMutationOperation(runId: string, operationId: string): Promise<void> {
  const owner = mutationContext.getStore();
  if (!owner || owner.runId !== runId) return;
  if (owner.operationId && owner.operationId !== operationId) throw new Error("Mutation operation identity changed.");
  const changed = await getDatabase().collections.deployment_control.updateOne({ environment: getServerEnv().DEPLOYMENT_ENV,
    mutationOwners: { $elemMatch: { id: owner.id, processId, state: "active" } } },
  { $set: { "mutationOwners.$.operationId": operationId, updatedAtMs: Date.now() } });
  if (!changed.matchedCount) throw new Error("Mutation ownership changed.");
  owner.operationId = operationId;
}

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

export async function assertMutationsAllowed(options: { admitted?: boolean } = {}): Promise<void> {
  if (getServerEnv().DEPLOYMENT_ENV === "local") return;
  const control = await readDeploymentControl();
  if (control.maintenance || (control.draining && !options.admitted)) throw new MaintenanceModeError(control.reason);
}

export async function runTrackedMutation<T>(operation: () => Promise<T>, options: MutationOptions = {}): Promise<T> {
  if (process.env.DEPLOYMENT_ENV === undefined || process.env.DEPLOYMENT_ENV === "local") return operation();
  const environment = getServerEnv().DEPLOYMENT_ENV;
  const database = getDatabase();
  await reconcileEndedMutations();
  const owner: MutationOwner = { id: randomUUID(), processId, startedAtMs: Date.now(), state: "active",
    ...(options.runId ? { runId: options.runId } : {}), ...(options.operationId ? { operationId: options.operationId } : {}) };
  const admitted = await database.collections.deployment_control.findOneAndUpdate(
    { environment, maintenance: false, ...(!options.admitted ? { draining: { $ne: true } } : {}) },
    { $inc: { activeMutations: 1 }, $push: { mutationOwners: owner }, $set: { updatedAtMs: Date.now() } },
    { returnDocument: "after" },
  );
  if (!admitted) throw new MaintenanceModeError((await readDeploymentControl()).reason);
  try { return await mutationContext.run(owner, operation); }
  finally {
    endedMutations.set(owner.id, owner);
    await withCleanupBudget(() => releaseEndedMutation(owner));
  }
}

export async function resetActiveMutationsForSingleTaskStartup(): Promise<void> {
  if (process.env.DEPLOYMENT_ENV === undefined || process.env.DEPLOYMENT_ENV === "local") return;
  const environment = getServerEnv().DEPLOYMENT_ENV;
  // The previous process is gone, but its writes may have reached a provider.
  // Retain that uncertainty instead of making restart look like a clean drain.
  const collection = getDatabase().collections.deployment_control;
  const previous = await collection.findOne({ environment });
  if (previous && previous.activeMutations > 0) {
    const owners = previous.mutationOwners ?? [];
    const interrupted = owners.filter(owner => owner.state === "active" && owner.processId !== processId);
    const legacy = Math.max(0, previous.activeMutations - owners.filter(owner => owner.state === "active").length);
    if (!interrupted.length && !legacy) return;
    await collection.updateOne(
    { environment, activeMutations: previous.activeMutations, updatedAtMs: previous.updatedAtMs },
    { $inc: { interruptedMutations: legacy, activeMutations: -(interrupted.length + legacy) },
      $set: { mutationOwners: owners.map(owner => interrupted.some(item => item.id === owner.id) ? { ...owner, state: "interrupted" as const, interruptedAtMs: Date.now() } : owner), updatedAtMs: Date.now() } },
  );
  }
}

/** Only proven terminal, published outputs or definite failures release dead owners. */
export async function reconcileInterruptedMutations(): Promise<void> {
  await reconcileEndedMutations();
  const control = await readDeploymentControl();
  const database = getDatabase();
  for (const owner of control.mutationOwners ?? []) {
    if (owner.state !== "interrupted" || !owner.runId) continue;
    let operationId = owner.operationId;
    if (!operationId) {
      if (!owner.interruptedAtMs) continue;
      // The process can die after prepareOperation commits but before its owner
      // binding write. Only one operation created during this exact mutation is
      // recoverable evidence; zero or multiple candidates stay explicit blockers.
      const candidates = await database.collections.experiment_operations.find({ runId: owner.runId,
        createdAtMs: { $gte: owner.startedAtMs, $lte: owner.interruptedAtMs } }, { projection: { _id: 1 } }).limit(2).toArray();
      if (candidates.length !== 1) continue;
      operationId = candidates[0]._id;
    }
    const operation = await database.collections.experiment_operations.findOne({ _id: operationId, runId: owner.runId });
    // Delivery history remains retained, but later verified terminal evidence
    // can resolve the operation even when the stop acknowledgement was lost.
    if (!operation || operation.lifecycle?.unresolved) continue;
    const resolved = operation.state === "succeeded" && !!operation.verifiedWorkflowId && !!operation.resultJson && !!operation.materializationJson ||
      operation.state === "failed" && operation.safeFailure === "definite_failure" &&
        (operation.dispatchStartedAtMs == null || operation.remoteStatus === "failed" || operation.remoteStatus === "stopped");
    if (!resolved) continue;
    await database.collections.deployment_control.updateOne({ environment: control.environment,
      mutationOwners: { $elemMatch: { id: owner.id, processId: owner.processId, state: "interrupted" } } },
    { $pull: { mutationOwners: { id: owner.id } }, $set: { updatedAtMs: Date.now() } });
  }
}

export async function setDrainingMode(reason: string): Promise<void> {
  const environment = getServerEnv().DEPLOYMENT_ENV;
  await getDatabase().collections.deployment_control.updateOne(
    { environment },
    { $set: { schemaVersion: "1", environment, draining: true, reason, updatedAtMs: Date.now() },
      $setOnInsert: { _id: `environment:${environment}`, activeMutations: 0, maintenance: false } },
    { upsert: true },
  );
}

export async function finishDraining(): Promise<boolean> {
  const environment = getServerEnv().DEPLOYMENT_ENV;
  const changed = await getDatabase().collections.deployment_control.updateOne(
    { environment, draining: true, maintenance: false, activeMutations: 0, "mutationOwners.0": { $exists: false }, $or: [{ interruptedMutations: 0 }, { interruptedMutations: { $exists: false } }] },
    { $set: { maintenance: true, draining: false, reason: "deployment drained", updatedAtMs: Date.now() } },
  );
  return changed.modifiedCount === 1;
}

export async function setMaintenanceMode(maintenance: boolean, reason: string | null): Promise<void> {
  const environment = getServerEnv().DEPLOYMENT_ENV;
  await getDatabase().collections.deployment_control.updateOne(
    { environment },
    { $set: { schemaVersion: "1", environment, maintenance, draining: false, reason, updatedAtMs: Date.now() }, $setOnInsert: { _id: `environment:${environment}`, activeMutations: 0 } },
    { upsert: true },
  );
}
