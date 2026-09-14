import { getDatabase } from "@/db/client";

if (process.env.RUNNER_ENABLED !== "false") throw new Error("Drain verification requires RUNNER_ENABLED=false.");
const database = getDatabase();
const deadline = Date.now() + Number(process.env.DRAIN_TIMEOUT_MS ?? 900_000);
try {
  for (;;) {
    const [generationItems, executionItems, modelCalls, followups, control] = await Promise.all([
      database.collections.generation_items.countDocuments({ status: "running" }),
      database.collections.execution_items.countDocuments({ status: "running" }),
      database.collections.model_calls.countDocuments({ status: "running" }),
      database.collections.card_responses.countDocuments({ followupStatus: "running" }),
      database.collections.deployment_control.findOne({ environment: process.env.DEPLOYMENT_ENV ?? "local" }),
    ]);
    const activeMutations = Math.max(0, control?.activeMutations ?? 0);
    const active = generationItems + executionItems + modelCalls + followups + activeMutations;
    if (active === 0) { console.log(JSON.stringify({ drained: true, generationItems, executionItems, modelCalls, followups, activeMutations })); break; }
    if (Date.now() >= deadline) throw new Error(`Deployment drain timed out with ${active} active operations.`);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
} finally { await database.close(); }
