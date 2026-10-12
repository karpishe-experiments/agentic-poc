import { describe, expect, it, vi } from "vitest";
import { boundedCollection } from "@/db/bounded-collection";
import { withOperationBudget } from "@/lib/operations/budget";

describe("Mongo operation budgets", () => {
  it("passes remaining timeout and cancellation to supported queries", async () => {
    const raw = { findOne: vi.fn(async () => null) };
    const collection = boundedCollection(raw);
    await withOperationBudget(200, () => collection.findOne(), { now: () => 100 });
    expect(raw.findOne).toHaveBeenCalledWith(undefined, expect.objectContaining({ timeoutMS: 100, signal: expect.any(AbortSignal) }));
  });
  it("lets transaction queries inherit the session timeout", async () => {
    const raw = { updateOne: vi.fn(async (...args: unknown[]) => args) };
    const session = {};
    await withOperationBudget(200, () => boundedCollection(raw).updateOne({}, {}, { session }), { now: () => 100 });
    expect(raw.updateOne).toHaveBeenCalledWith({}, {}, { session });
  });
  it.each(["find", "aggregate"])("gives transactional %s cursors a collection default without a command override", async (method) => {
    const raw = { [method]: vi.fn(() => "cursor") }, scoped = { [method]: vi.fn() };
    const factory = vi.fn(() => scoped), session = {};
    const collection = boundedCollection(raw, factory);
    await withOperationBudget(200, async () => {
      expect(collection[method]({}, { session })).toBe("cursor");
    }, { now: () => 100 });
    expect(factory).toHaveBeenCalledWith(100);
    expect(raw[method]).toHaveBeenCalledWith({}, { session, signal: expect.any(AbortSignal) });
    expect(raw[method].mock.contexts).toEqual([scoped]);
    expect(scoped[method]).not.toHaveBeenCalled();
  });
  it("preserves captured methods when instrumentation replaces the collection method", async () => {
    const raw = { insertOne: async () => "saved" };
    const collection = boundedCollection(raw), insert = collection.insertOne.bind(collection);
    const spy = vi.spyOn(raw, "insertOne").mockImplementation(() => insert());
    await expect(withOperationBudget(200, () => collection.insertOne(), { now: () => 100 })).resolves.toBe("saved");
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("does not start a command after expiry", async () => {
    let now = 100;
    const raw = { findOne: vi.fn(async () => null) };
    await expect(withOperationBudget(200, async () => { now = 200; await boundedCollection(raw).findOne(); }, { now: () => now })).rejects.toThrow("budget expired");
    expect(raw.findOne).not.toHaveBeenCalled();
  });
});
