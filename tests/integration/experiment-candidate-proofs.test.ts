import { afterEach, describe, expect, it, vi } from "vitest";
import { MongoServerError, type Document } from "mongodb";
import { withMongoTransaction, type Database } from "@/db/client";
import { candidateProofMetrics, m4FailedProofProjection, readM4CandidateProofs } from "@/db/experiment-m4-accounting-evidence";
import { m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import { withOperationBudget } from "@/lib/operations/budget";
import { createTestDatabase, closeTestDatabase } from "@/tests/helpers/mongodb";

const databases: Database[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.splice(0).map(closeTestDatabase)); });
async function fixture(context = '$quoted "value" \\ newline\n日本語 😀 é é '.repeat(5000)) {
  const db = await createTestDatabase({ seedAgents: false }); databases.push(db);
  const collection = db.database.collection<Document & { _id: string }>("experiment_operations");
  await collection.insertOne({ _id: "proof", runId: "run", idempotencyKey: "proof", state: "failed", role: "manager",
    imageRequestJson: "excluded", m4Preparation: { contextJson: context,
      requestJson: JSON.stringify({ input: [{ role: "system", content: "prompt" }, { role: "user", content: context }] }),
      arbitraryLegacyField: { nested: [1, "retain"] }, requestDigest: "invalid-is-not-repaired" } });
  const run = (metrics = candidateProofMetrics()) => withMongoTransaction(db, session => readM4CandidateProofs(db, session, "run", ["proof"], metrics));
  const original = () => db.collections.experiment_operations.find({ runId: "run" }, { projection: m4FailedProofProjection }).toArray();
  return { db, collection, run, original };
}

describe("candidate failed-proof reader", () => {
  it.each(["playful_kid", "enthusiast_parent", "professional_creator"])("reconstructs %s history exactly without changing stored records or digest inputs", async persona => {
    const f = await fixture(); await f.collection.updateOne({ _id: "proof" }, { $set: { persona } });
    const before = await f.collection.findOne({ _id: "proof" });
    const metrics = candidateProofMetrics(), expected = await f.original();
    const result = await f.run(metrics);
    expect(result).toEqual(expected);
    expect(m4Hash(m4CanonicalJson(result[0].m4Preparation))).toBe(m4Hash(m4CanonicalJson(expected[0].m4Preparation)));
    expect(metrics).toMatchObject({ selectedRows: 1, comparedRows: 1, matchedRows: 1, fallbackRows: 0 });
    expect(metrics.returnedJsonBytes).toBeLessThan(Buffer.byteLength(JSON.stringify(expected)) * .65);
    expect(metrics.comparisonInputJsonBytes).toBeGreaterThan(100_000);
    expect(await f.collection.findOne({ _id: "proof" })).toEqual(before);
  });

  it.each([
    { name: "changed context", field: "m4Preparation.contextJson", value: "corrupted" },
    { name: "malformed request", field: "m4Preparation.requestJson", value: "{" },
    { name: "changed request", field: "m4Preparation.requestJson", value: JSON.stringify({ input: [{ role: "user", content: "changed" }] }) },
    { name: "duplicate users", field: "m4Preparation.requestJson", value: JSON.stringify({ input: [{ role: "user", content: "one" }, { role: "user", content: "two" }] }) },
    { name: "missing user", field: "m4Preparation.requestJson", value: '{"input":[]}' },
    { name: "non-string context", field: "m4Preparation.contextJson", value: { private: "retain" } },
    { name: "malformed preparation", field: "m4Preparation", value: ["invalid"] },
  ])("preserves $name for the original verifier", async ({ field, value }) => {
    const f = await fixture("original"); await f.collection.updateOne({ _id: "proof" }, { $set: { [field]: value } });
    const metrics = candidateProofMetrics(); expect(await f.run(metrics)).toEqual(await f.original());
    expect(metrics.fallbackRows).toBe(1);
  });

  it("retains missing context and rejects a missing selected record", async () => {
    const f = await fixture(); await f.collection.updateOne({ _id: "proof" }, { $unset: { "m4Preparation.contextJson": "" } });
    expect(await f.run()).toEqual(await f.original());
    await f.collection.deleteOne({ _id: "proof" }); await expect(f.run()).rejects.toThrow("records are missing");
  });

  it("uses the same snapshot for comparison and reads fresh evidence in a later attempt", async () => {
    const f = await fixture("original"), aggregate = f.db.collections.experiment_operations.aggregate.bind(f.db.collections.experiment_operations);
    let calls = 0;
    vi.spyOn(f.db.collections.experiment_operations, "aggregate").mockImplementation(((...args: Parameters<typeof aggregate>) => {
      const cursor = aggregate(...args), toArray = cursor.toArray.bind(cursor);
      cursor.toArray = async () => {
        const rows = await toArray();
        if (++calls === 1) await f.collection.updateOne({ _id: "proof" }, { $set: { "m4Preparation.contextJson": "changed concurrently" } });
        return rows;
      };
      return cursor;
    }) as typeof aggregate);
    expect((await f.run())[0].m4Preparation?.contextJson).toBe("original");
    const metrics = candidateProofMetrics(); expect((await f.run(metrics))[0].m4Preparation?.contextJson).toBe("changed concurrently");
    expect(metrics.fallbackRows).toBe(1);
  });

  it.each(["missing", "duplicate", "database error"])("aborts on %s comparison without another proof read", async kind => {
    const f = await fixture("original"), aggregate = f.db.collections.experiment_operations.aggregate.bind(f.db.collections.experiment_operations);
    const find = vi.spyOn(f.db.collections.experiment_operations, "find"); let calls = 0;
    vi.spyOn(f.db.collections.experiment_operations, "aggregate").mockImplementation(((...args: Parameters<typeof aggregate>) => {
      if (++calls !== 2) return aggregate(...args);
      return { toArray: async () => {
        if (kind === "database error") throw new Error("private database failure");
        return kind === "missing" ? [] : [{ _id: "proof", matches: true }, { _id: "proof", matches: true }];
      } } as unknown as ReturnType<typeof aggregate>;
    }) as typeof aggregate);
    await expect(f.run()).rejects.toThrow(); expect(calls).toBe(2); expect(find).not.toHaveBeenCalled();
  });

  it("does not renew an expired budget before comparison", async () => {
    const f = await fixture("original"), aggregate = f.db.collections.experiment_operations.aggregate.bind(f.db.collections.experiment_operations);
    let now = 0, calls = 0;
    vi.spyOn(f.db.collections.experiment_operations, "aggregate").mockImplementation(((...args: Parameters<typeof aggregate>) => {
      calls++; const cursor = aggregate(...args), toArray = cursor.toArray.bind(cursor);
      cursor.toArray = async () => { const rows = await toArray(); now = 100; return rows; }; return cursor;
    }) as typeof aggregate);
    await expect(withOperationBudget(100, f.run, { now: () => now })).rejects.toThrow("budget expired");
    expect(calls).toBe(1);
  });

  it("rebuilds evidence after the existing transaction wrapper retries a transient snapshot", async () => {
    const f = await fixture("original"); let attempts = 0;
    const result = await withMongoTransaction(f.db, async session => {
      const metrics = candidateProofMetrics();
      const rows = await readM4CandidateProofs(f.db, session, "run", ["proof"], metrics);
      if (++attempts === 1) {
        await f.collection.updateOne({ _id: "proof" }, { $set: { "m4Preparation.contextJson": "new attempt evidence" } });
        const error = new MongoServerError({ message: "transient fixture", code: 112 });
        error.addErrorLabel("TransientTransactionError"); throw error;
      }
      expect(metrics.fallbackRows).toBe(1); return rows;
    });
    expect(attempts).toBe(2); expect(result[0].m4Preparation?.contextJson).toBe("new attempt evidence");
  });
});
