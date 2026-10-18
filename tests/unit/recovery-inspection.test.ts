import { describe, expect, it, vi } from "vitest";
import type { MongoDatabaseContext } from "@/db/client";
import { inspectRecoveryWork } from "@/lib/operations/recovery-inspection";

function fixture() {
  const control = { maintenance: true, draining: false, activeMutations: 0, updatedAtMs: 100 };
  const rows = new Map<string, unknown[]>();
  const calls: { name: string; filter: unknown; projection?: unknown; skip?: number; limit?: number }[] = [];
  const failures = new Map<string, Error>();
  const collection = (name: string) => ({
    countDocuments: vi.fn(async (filter: unknown) => {
      calls.push({ name, filter });
      if (failures.has(name)) throw failures.get(name);
      return (rows.get(name) ?? []).length;
    }),
    find: vi.fn((filter: unknown, options: unknown) => {
      const call = { name, filter, projection: options, skip: 0, limit: 0 };
      calls.push(call);
      const cursor = { sort: vi.fn(() => cursor), skip: vi.fn((value: number) => { call.skip = value; return cursor; }),
        limit: vi.fn((value: number) => { call.limit = value; return cursor; }),
        toArray: vi.fn(async () => (rows.get(name) ?? []).slice(call.skip, call.skip + call.limit).map((_id) => ({ _id }))) };
      return cursor;
    }),
  });
  const collections = Object.fromEntries(["generation_jobs", "generation_items", "execution_items", "model_calls", "card_responses", "experiment_runs", "experiment_operations"].map((name) => [name, collection(name)]));
  const admission = { findOne: vi.fn(async () => control) };
  const context = { collections: { ...collections, deployment_control: admission } } as unknown as MongoDatabaseContext;
  return { context, control, admission, rows, calls, failures };
}

describe("read-only recovery inspection", () => {
  it("allows closed admission with no work and never calls a mutation", async () => {
    const state = fixture();
    const result = await inspectRecoveryWork(state.context, { environment: "_staging", nowMs: 123 });
    expect(result).toMatchObject({ outcome: "clear", inspectedAtMs: 123, admission: { maintenance: true, activeMutations: 0 }, blockers: [] });
    expect(state.calls).toHaveLength(9);
  });

  it("reports running work with stable bounded ID pages and no row content", async () => {
    const state = fixture();
    state.rows.set("generation_items", ["one", "two", "three", "four", "five"]);
    const result = await inspectRecoveryWork(state.context, { environment: "_staging", page: 1, limit: 2 });
    expect(result.outcome).toBe("blocked");
    expect(result.blockers).toEqual([{ code: "generation_items", count: 5, ids: ["three", "four"], page: 1, limit: 2, hasMore: true }]);
    expect(state.calls.find((call) => call.name === "generation_items" && call.projection)).toMatchObject({ projection: { projection: { _id: 1 } }, skip: 2, limit: 2 });
  });

  it("sanitizes IDs and errors rather than emitting arbitrary data", async () => {
    const state = fixture();
    state.rows.set("model_calls", ["https://private.invalid/key", { secret: "private" }, "safe-id"]);
    const result = await inspectRecoveryWork(state.context, { environment: "_staging" });
    expect(result.blockers[0].ids).toEqual(["unavailable", "unavailable", "safe-id"]);
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("distinguishes a failed database read from actual work and retains earlier blockers", async () => {
    const state = fixture();
    state.rows.set("generation_jobs", ["job-1"]);
    const error = new Error("mongodb://secret-connection"); error.name = "MongoOperationTimeoutError";
    state.failures.set("generation_items", error);
    const result = await inspectRecoveryWork(state.context, { environment: "_staging" });
    expect(result.outcome).toBe("inspection_error");
    expect(result.inspectionError).toEqual({ stage: "generation_items", errorKind: "MongoOperationTimeoutError" });
    expect(result.blockers[0].code).toBe("generation_jobs");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("reports missing or invalid admission and retained owners independently", async () => {
    const state = fixture();
    state.admission.findOne.mockResolvedValueOnce(null as never);
    expect((await inspectRecoveryWork(state.context, { environment: "_staging" })).blockers[0].code).toBe("admission_missing");
    state.control.activeMutations = -1;
    expect((await inspectRecoveryWork(state.context, { environment: "_staging" })).blockers[0].code).toBe("admission_invalid");
    Object.assign(state.control, { activeMutations: 1, interruptedMutations: 2, mutationOwners: [{ id: "owner", processId: "private-value", state: "interrupted" }] });
    const result = await inspectRecoveryWork(state.context, { environment: "_staging" });
    expect(result.blockers.map((blocker) => blocker.code)).toEqual(["active_mutations", "interrupted_mutations", "mutation_owners"]);
    expect(JSON.stringify(result)).not.toContain("private-value");
  });

  it("requires existing preparation and excludes only exact validated run/operation pairs", async () => {
    const state = fixture();
    await inspectRecoveryWork(state.context, { environment: "_staging", validatedTargets: [{ runId: "run-1", operationId: "op-1" }] });
    const runFilters = state.calls.filter((call) => call.name === "experiment_runs").map((call) => call.filter);
    expect(runFilters[1]).toMatchObject({ preparation: { $exists: true, $ne: null } });
    expect(runFilters[0]).not.toHaveProperty("$nor");
    expect(runFilters[1]).not.toHaveProperty("$nor");
    expect(runFilters[2]).toMatchObject({ $nor: [{ _id: "run-1", activeOperationId: "op-1" }] });
    expect(state.calls.find((call) => call.name === "experiment_operations")?.filter).toMatchObject({ $nor: [{ _id: "op-1", runId: "run-1" }] });
  });

  it("keeps expired claims unresolved until evidence clears them", async () => {
    const state = fixture();
    await inspectRecoveryWork(state.context, { environment: "_staging" });
    const filter = state.calls.find((call) => call.name === "experiment_operations")?.filter as { $or: unknown[] };
    expect(filter.$or).toContainEqual({ resultFinalizationClaim: { $exists: true, $ne: null } });
    expect(JSON.stringify(filter)).not.toContain("expiresAtMs");
  });

  it.each([{ page: -1 }, { page: 10_001 }, { limit: 0 }, { limit: 51 }, { page: 0.5 }, { environment: "_prod" }, { nowMs: NaN }])("rejects invalid options before reading: %j", async (invalid) => {
    const state = fixture();
    await expect(inspectRecoveryWork(state.context, { environment: "_staging", ...invalid } as never)).rejects.toThrow();
    expect(state.admission.findOne).not.toHaveBeenCalled();
  });

  it("rejects duplicate exclusions before reading", async () => {
    const state = fixture();
    await expect(inspectRecoveryWork(state.context, { environment: "_staging", validatedTargets: [{ runId: "a", operationId: "b" }, { runId: "c", operationId: "b" }] })).rejects.toThrow("distinct");
    expect(state.admission.findOne).not.toHaveBeenCalled();
  });
});
