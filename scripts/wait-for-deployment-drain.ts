import { getDatabase } from "@/db/client";
import { withMongoTransaction } from "@/db/client";
import { failTerminalPageBatchItems } from "@/db/experiment-page-batch-failure";
import { finishDraining, reconcileInterruptedMutations } from "@/lib/application/deployment-control";
import { withOperationBudget } from "@/lib/operations/budget";

if (process.env.RUNNER_ENABLED !== "false") throw new Error("Drain verification requires RUNNER_ENABLED=false.");
const database = getDatabase();
const requestedTimeout = Number(process.env.DRAIN_TIMEOUT_MS ?? 300_000);
if (!Number.isFinite(requestedTimeout) || requestedTimeout <= 0 || requestedTimeout > 300_000) throw new Error("Drain timeout must be within 300000ms.");
const deadline = Date.now() + requestedTimeout;
let lastProgressAt = 0;
try {
  await withOperationBudget(deadline, async () => {
  for (;;) {
    if (Date.now() >= deadline) throw new Error("Deployment drain deadline expired; inspect retained blockers.");
    await reconcileInterruptedMutations();
    const blocked = await database.collections.experiment_runs.find({ status: "blocked", safeFailure: "definite_failure" }).toArray();
    for (const run of blocked) await withMongoTransaction(database, async (session) => {
      const current = await database.collections.experiment_runs.findOne({ _id: run._id }, { session });
      if (current) await failTerminalPageBatchItems(database, current, session, Date.now());
    });
    const [generationItems, executionItems, modelCalls, followups, control] = await Promise.all([
      database.collections.generation_items.countDocuments({ status: "running" }),
      database.collections.execution_items.countDocuments({ status: "running" }),
      database.collections.model_calls.countDocuments({ status: "running" }),
      database.collections.card_responses.countDocuments({ followupStatus: "running" }),
      database.collections.deployment_control.findOne({ environment: process.env.DEPLOYMENT_ENV ?? "local" }),
    ]);
    const activeMutations = Math.max(0, control?.activeMutations ?? 0);
    if (!control?.draining || control.maintenance) throw new Error("Deployment is not in draining mode; inspect admission state.");
    const unresolved = await database.collections.experiment_operations.find({ $or: [
      { state: { $in: ["started", "unknown"] } },
      { state: "prepared" },
      { state: "succeeded", dispatchStartedAtMs: { $ne: null }, verifiedWorkflowId: null },
      { "lifecycle.unresolved": true },
    ] }, { projection: { _id: 1, runId: 1, state: 1, deadlineAtMs: 1 } }).toArray();
    const preparations = await database.collections.experiment_runs.find({
      preparation: { $ne: null }, $or: [{ "preparation.outcome": { $ne: "failed" } }, { "preparation.unresolved": true }],
    }, { projection: { _id: 1, preparation: 1 } }).toArray();
    const mutationBlockers = (control?.mutationOwners ?? []).filter(owner => owner.state === "interrupted");
    const interruptedMutations = (control?.interruptedMutations ?? 0) + mutationBlockers.length;
    const active = generationItems + executionItems + modelCalls + followups + activeMutations + interruptedMutations + unresolved.length + preparations.length;
    if (active === 0) {
      if (!await finishDraining()) { await new Promise((resolve) => setTimeout(resolve, Math.min(1000, Math.max(1, deadline - Date.now())))); continue; }
      console.log(JSON.stringify({ drained: true, generationItems, executionItems, modelCalls, followups, activeMutations })); break;
    }
    if (Date.now() - lastProgressAt >= 30_000) {
      console.log(JSON.stringify({ drained: false, generationItems, executionItems, modelCalls, followups, activeMutations, interruptedMutations, mutationBlockers, blockers: unresolved, preparationBlockers: preparations }));
      lastProgressAt = Date.now();
    }
    if (Date.now() >= deadline) throw new Error(`Deployment drain timed out with ${active} active operations.`);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  });
} finally { await database.close(); }
