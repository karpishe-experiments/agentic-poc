import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentRunDocument } from "@/db/documents";

// Close bookkeeping only. A saved provider result is not successful page
// materialization, and an uncertain provider operation must remain uncertain.
export async function failTerminalPageBatchItems(database: Database, run: ExperimentRunDocument, session: ClientSession, nowMs: number) {
  if (run.status !== "blocked" || run.safeFailure !== "definite_failure") return;
  const options = { session };
  const jobs = await database.collections.generation_jobs.find({ bookletId: run.bookletId, jobType: "dify_pages" }, options).toArray();
  for (const job of jobs) {
    let owner: unknown;
    try { owner = JSON.parse(job.inputJson).runId; } catch { continue; }
    if (owner !== run._id) continue;
    const items = await database.collections.generation_items.find({ jobId: job._id, status: "running" }, options).toArray();
    for (const item of items) {
      let operationId: unknown;
      try { operationId = JSON.parse(item.resultJson ?? "null")?.operationId; } catch { continue; }
      if (typeof operationId !== "string") continue;
      const operation = await database.collections.experiment_operations.findOne({ _id: operationId, runId: run._id,
        role: "image", taskId: "J13", subjectKind: "page", subjectId: item.itemKey,
        state: { $in: ["succeeded", "failed"] } }, options);
      if (!operation) continue;
      const errorJson = JSON.stringify({ code: "experiment_run_blocked", runId: run._id, operationId });
      await database.collections.generation_items.updateOne({ _id: item._id, jobId: job._id, status: "running" },
        { $set: { status: "failed", errorJson, finishedAtMs: nowMs } }, options);
      await database.collections.generation_jobs.updateOne({ _id: job._id, jobType: "dify_pages" },
        { $set: { status: "failed", errorJson, finishedAtMs: nowMs, updatedAtMs: nowMs } }, options);
    }
  }
}
