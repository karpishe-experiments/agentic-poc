import type { Collection } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { readRecoveryFingerprints, recoveryDigest } from "@/lib/operations/booklet-recovery";

describe("recovery preservation snapshot", () => {
  it("hashes every retained row with bounded keyset pages", async () => {
    const rows = Array.from({ length: 75 }, (_, index) => ({ _id: String(index).padStart(4, "0"), retained: `evidence-${index}` }));
    const limits: number[] = [];
    const find = vi.fn((filter, options) => {
      expect(options).toEqual({ batchSize: 32 });
      const cursor = {
        sort(order: unknown) { expect(order).toEqual({ _id: 1 }); return cursor; },
        limit(size: number) { limits.push(size); return cursor; },
        async toArray() { return rows.filter(row => !filter._id || row._id > filter._id.$gt).slice(0, limits.at(-1)); },
      };
      return cursor;
    });
    const result = await readRecoveryFingerprints({ find } as unknown as Collection<{ _id: string }>);
    expect(result).toEqual(Object.fromEntries(rows.map(row => [row._id, recoveryDigest(row)])));
    expect(find.mock.calls.map(([filter]) => filter)).toEqual([{}, { _id: { $gt: "0031" } }, { _id: { $gt: "0063" } }]);
    expect(limits).toEqual([32, 32, 32]);
  });

  it("rejects repeated identities instead of silently overwriting preservation evidence", async () => {
    const cursor = { sort() { return cursor; }, limit() { return cursor; },
      async toArray() { return [{ _id: "same", value: 1 }, { _id: "same", value: 2 }]; } };
    await expect(readRecoveryFingerprints({ find: () => cursor } as unknown as Collection<{ _id: string }>))
      .rejects.toThrow("snapshot_identity_order_invalid");
  });
});
