import { describe, expect, it, vi } from "vitest";
import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentRunDocument } from "@/db/documents";
import { failTerminalPageBatchItems } from "@/db/experiment-page-batch-failure";

function fixture() {
  const job = { _id: "job", inputJson: JSON.stringify({ runId: "run" }) };
  const item = { _id: "item", jobId: "job", itemKey: "page", resultJson: JSON.stringify({ operationId: "operation" }) };
  const jobs = { find: vi.fn(() => ({ toArray: async () => [job] })), updateOne: vi.fn() };
  const items = { find: vi.fn(() => ({ toArray: async () => [item] })), updateOne: vi.fn() };
  const operations = { findOne: vi.fn(async () => ({ _id: "operation" })) };
  const database = { collections: { generation_jobs: jobs, generation_items: items, experiment_operations: operations } } as unknown as Database;
  const run = { _id: "run", bookletId: "book", status: "blocked", safeFailure: "definite_failure" } as ExperimentRunDocument;
  const session = {} as ClientSession;
  return { database, run, session, jobs, items, operations, job, item };
}

describe("terminal blocked page batch bookkeeping", () => {
  it("fails only item/job bookkeeping and keeps the operation/result untouched", async () => {
    const f = fixture();
    await failTerminalPageBatchItems(f.database, f.run, f.session, 123);
    expect(f.operations.findOne).toHaveBeenCalledWith(expect.objectContaining({ runId: "run", taskId: "J13",
      subjectId: "page", state: { $in: ["succeeded", "failed"] } }), { session: f.session });
    expect(f.items.updateOne).toHaveBeenCalledWith({ _id: "item", jobId: "job", status: "running" },
      { $set: { status: "failed", errorJson: expect.any(String), finishedAtMs: 123 } }, { session: f.session });
    expect(f.jobs.updateOne).toHaveBeenCalledOnce();
  });
  it.each(["unknown_outcome", null] as const)("does not close uncertain or non-failed runs (%s)", async (safeFailure) => {
    const f = fixture();
    await failTerminalPageBatchItems(f.database, { ...f.run, safeFailure }, f.session, 123);
    expect(f.jobs.find).not.toHaveBeenCalled();
  });
  it("does not close an item whose provider operation is not terminal", async () => {
    const f = fixture();
    f.operations.findOne.mockResolvedValue(null as never);
    await failTerminalPageBatchItems(f.database, f.run, f.session, 123);
    expect(f.items.updateOne).not.toHaveBeenCalled();
  });
  it("does not close another run's job", async () => {
    const f = fixture(); f.job.inputJson = JSON.stringify({ runId: "other" });
    await failTerminalPageBatchItems(f.database, f.run, f.session, 123);
    expect(f.items.find).not.toHaveBeenCalled();
  });
  it("does not guess missing item operation evidence", async () => {
    const f = fixture(); f.item.resultJson = "null";
    await failTerminalPageBatchItems(f.database, f.run, f.session, 123);
    expect(f.operations.findOne).not.toHaveBeenCalled();
    expect(f.items.updateOne).not.toHaveBeenCalled();
  });
});
