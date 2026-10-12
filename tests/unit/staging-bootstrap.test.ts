import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("scripts/deploy/vps-deployment.sh", "utf8")
  .split("legacy_staging_node() {")[1].split("<<'NODE'\n")[1].split("\nNODE\n")[0];
const runId = "92272a97-f96d-4634-8cba-3524a3fa2b51";
const operationId = "c8c0e121-d3cf-41bc-8023-79cfdae8e291";
function fixture() {
  const data = {
    experiment_runs: { _id: runId, mode: "simulated", status: "blocked", safeFailure: "definite_failure", activeOperationId: null,
      bookletId: "book", counters: { payableText: 0, payableImage: 0 }, configurationJson: JSON.stringify([{ role: "image", appId: "app", publishedWorkflowId: "publication" }]) },
    experiment_operations: { _id: operationId, runId, subjectId: "page", subjectKind: "page", role: "image", taskId: "J13", state: "failed",
      safeFailure: "definite_failure", reservationCount: 0, workflowRunId: "bbd3a736-6777-4088-8627-557999d7f001" },
    generation_items: { _id: "354d337a-4e9f-42ab-a8ec-0c327a45748a", jobId: "1a258e4b-aa34-454c-8f04-ada32b4c808f", itemKey: "page",
      status: "running", resultJson: JSON.stringify({ operationId }) },
    generation_jobs: { _id: "1a258e4b-aa34-454c-8f04-ada32b4c808f", bookletId: "book", jobType: "dify_pages", status: "running", inputJson: JSON.stringify({ runId }) },
    deployment_control: { environment: "_staging", maintenance: false, activeMutations: 0, updatedAtMs: 1, reason: null as string | null },
  };
  let blocker = false, race = false, transactionRace = false;
  const writes: string[] = [], logs: string[] = [];
  const collections = Object.fromEntries(Object.entries(data).map(([name, row]) => [name, {
    findOne: vi.fn(async () => row), countDocuments: vi.fn(async () => blocker ? 1 : 0),
    updateOne: vi.fn(async (_query: unknown, update: { $set: object }) => {
      writes.push(name); Object.assign(row, update.$set);
      if (race && name === "deployment_control" && data.deployment_control.maintenance) data.deployment_control.activeMutations = 1;
      return { modifiedCount: 1 };
    }),
  }]));
  for (const name of ["execution_items", "model_calls", "card_responses"]) collections[name] = { countDocuments: vi.fn(async () => 0) } as never;
  const close = vi.fn(), retrieve = vi.fn(async () => ({ kind: "execution", execution: { id: data.experiment_operations.workflowRunId,
    status: "failed", workflow_id: "publication", total_tokens: 0 } }));
  const verify = vi.fn(async () => ({ backupId: "backup", assets: [] }));
  const db = { collections, close };
  const modules: Record<string, unknown> = {
    "./db/client.ts": { getDatabase: () => db, withMongoTransaction: async (_db: unknown, fn: (session: object) => Promise<void>) => {
      if (transactionRace) data.experiment_operations.state = "succeeded";
      await fn({ transaction: true });
    } },
    "./lib/experiment-runner/config.ts": { readBookletRunnerConfig: () => ({ enabled: true, config: { bindings: [{ role: "image", taskId: null,
      appId: "app", publishedWorkflowId: "publication" }] } }) },
    "./lib/experiment-runner/transport.ts": { createWorkflowRuntime: () => ({ retrieve }) },
    "./lib/config/env.ts": { getServerEnv: () => ({ MONGODB_DATABASE: "kids_booklet", RECOVERY_BUCKET: "recovery" }) },
    "./lib/assets/create-object-store-client.ts": { createObjectStoreClient: () => ({ destroy: vi.fn() }) },
    "./scripts/recovery-storage.ts": { RecoveryStorage: class { verifiedCompletedBackup = verify; } },
  };
  async function execute(mode: string) {
    const process = { env: { DEPLOYMENT_ENV: "_staging", RUNNER_ENABLED: "false", BOOTSTRAP_MODE: mode,
      BACKUP_ID: "backup", RELEASE_IMAGE_DIGEST: "sha256:expected" }, exitCode: 0 };
    await runInNewContext(source, { process, require: (name: string) => modules[name], console: {
      log: (value: string) => logs.push(value), error: (value: string) => logs.push(value),
    } });
    return process.exitCode;
  }
  return { data, writes, logs, close, retrieve, verify, execute, block: () => { blocker = true; },
    race: () => { race = true; }, transactionRace: () => { transactionRace = true; } };
}
describe("exact historical staging bootstrap", () => {
  it("preview reconciles remote failure without mutations", async () => {
    const f = fixture(); expect(await f.execute("inspect")).toBe(0);
    expect(f.writes).toEqual([]); expect(f.retrieve).toHaveBeenCalledOnce(); expect(f.close).toHaveBeenCalledOnce();
  });
  it("rejects changed ownership before remote or storage work", async () => {
    const f = fixture(); f.data.generation_jobs.bookletId = "other";
    expect(await f.execute("inspect")).toBe(1); expect(f.retrieve).not.toHaveBeenCalled(); expect(f.writes).toEqual([]);
  });
  it("does not close admission with other active or unknown work", async () => {
    const f = fixture(); f.block(); expect(await f.execute("close")).toBe(1); expect(f.writes).toEqual([]);
  });
  it("reopens its admission when active work races closure", async () => {
    const f = fixture(); f.race(); expect(await f.execute("close")).toBe(1);
    expect(f.data.deployment_control.maintenance).toBe(false); expect(f.writes).toEqual(["deployment_control", "deployment_control"]);
  });
  it("repairs only the exact item and job after closure", async () => {
    const f = fixture(); expect(await f.execute("close")).toBe(0); expect(await f.execute("repair")).toBe(0);
    expect(f.writes).toEqual(["deployment_control", "generation_items", "generation_jobs"]);
    expect(await f.execute("final")).toBe(0); expect(f.data.deployment_control.maintenance).toBe(true);
    expect(f.data.experiment_operations.state).toBe("failed"); expect(f.data.experiment_runs.status).toBe("blocked");
  });
  it("rechecks terminal evidence in the repair transaction", async () => {
    const f = fixture(); expect(await f.execute("close")).toBe(0); f.transactionRace();
    expect(await f.execute("repair")).toBe(1); expect(f.writes).toEqual(["deployment_control"]);
  });
  it("rejects unknown remote outcomes and never submits a workflow", async () => {
    const f = fixture(); f.retrieve.mockResolvedValueOnce({ kind: "unknown" } as never);
    expect(await f.execute("close")).toBe(1); expect(f.writes).toEqual([]);
    expect(f.logs.join(" ")).not.toContain("sha256:expected");
  });
  it("verifies exact backup database/environment/image with no database connection", async () => {
    const f = fixture(); expect(await f.execute("verify-backup")).toBe(0);
    expect(f.verify).toHaveBeenCalledWith("backup", "kids_booklet", "_staging", "sha256:expected");
    expect(f.close).not.toHaveBeenCalled(); expect(f.writes).toEqual([]);
  });
});
