import type { Collection } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { readRecoveryFingerprints, readRecoveryInventory, recoveryDigest } from "@/lib/operations/booklet-recovery";

describe("recovery preservation snapshot", () => {
  it("hashes every retained row with bounded keyset pages", async () => {
    const rows = Array.from({ length: 600 }, (_, index) => ({ _id: String(index).padStart(4, "0"), retained: `evidence-${index}` }));
    const limits: number[] = [];
    const find = vi.fn((filter, options) => {
      expect(options).toEqual({ batchSize: 256 });
      const cursor = {
        sort(order: unknown) { expect(order).toEqual({ _id: 1 }); return cursor; },
        limit(size: number) { limits.push(size); return cursor; },
        async toArray() { return rows.filter(row => !filter._id || row._id > filter._id.$gt).slice(0, limits.at(-1)); },
      };
      return cursor;
    });
    const result = await readRecoveryFingerprints({ find } as unknown as Collection<{ _id: string }>);
    expect(result).toEqual(Object.fromEntries(rows.map(row => [row._id, recoveryDigest(row)])));
    expect(find.mock.calls.map(([filter]) => filter)).toEqual([{}, { _id: { $gt: "0255" } }, { _id: { $gt: "0511" } }]);
    expect(limits).toEqual([256, 256, 256]);
    // The previous 32-row pages needed 19 database requests for these same rows.
    expect(find).toHaveBeenCalledTimes(3);
  });

  it("rejects repeated identities instead of silently overwriting preservation evidence", async () => {
    const cursor = { sort() { return cursor; }, limit() { return cursor; },
      async toArray() { return [{ _id: "same", value: 1 }, { _id: "same", value: 2 }]; } };
    await expect(readRecoveryFingerprints({ find: () => cursor } as unknown as Collection<{ _id: string }>))
      .rejects.toThrow("snapshot_identity_order_invalid");
  });

  it("bounds delayed collection reads to four and preserves inventory order", async () => {
    vi.useFakeTimers();
    try {
      let active = 0; let maximum = 0; let finished = 0;
      const collection = { find: () => { const cursor = { sort() { return cursor; }, limit() { return cursor; }, async toArray() {
        active++; maximum = Math.max(maximum, active);
        await new Promise(resolve => setTimeout(resolve, 10)); active--; finished++; return [];
      } }; return cursor; } };
      const names = ["experiment_runs", "experiment_operations", "experiment_campaigns", "experiment_delegations", "booklets",
        "artifacts", "artifact_versions", "artifact_dependencies", "approvals", "assets", "messages"];
      const collections = Object.fromEntries(names.map(name => [name, collection])) as unknown as Parameters<typeof readRecoveryInventory>[0];
      const pending = readRecoveryInventory(collections);
      await vi.advanceTimersByTimeAsync(30);
      expect(Object.keys(await pending)).toEqual(names);
      expect({ active, maximum, finished }).toEqual({ active: 0, maximum: 4, finished: 11 });
      // Eleven serial 10ms reads need 110ms; bounded concurrency finishes in 30ms.
    } finally { vi.useRealTimers(); }
  });

  it("settles started reads and schedules no new collection after failure", async () => {
    vi.useFakeTimers();
    try {
      let active = 0; let started = 0;
      const collection = (fail: boolean) => ({ find: () => { const cursor = { sort() { return cursor; }, limit() { return cursor; }, async toArray() {
        active++; started++;
        await new Promise(resolve => setTimeout(resolve, fail ? 1 : 10)); active--;
        if (fail) throw Object.assign(new Error("private detail"), { name: "OperationBudgetExpired" });
        return [];
      } }; return cursor; } });
      const collections = new Proxy({}, { get: (_target, name) => collection(name === "experiment_runs") }) as Parameters<typeof readRecoveryInventory>[0];
      const pending = readRecoveryInventory(collections).catch(error => error);
      await vi.advanceTimersByTimeAsync(10);
      expect(await pending).toMatchObject({ stage: "snapshot.experiment_runs", errorKind: "OperationBudgetExpired" });
      expect({ active, started }).toEqual({ active: 0, started: 4 });
    } finally { vi.useRealTimers(); }
  });
});
