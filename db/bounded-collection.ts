import { assertOperationBudget, operationSignal, remainingOperationMs } from "@/lib/operations/budget";

// Explicit driver method positions, not arbitrary argument rewriting. A session
// inherits its transaction's CSOT budget; the driver rejects per-query overrides.
const optionsAt: Record<string, number> = {
  find: 1, findOne: 1, countDocuments: 1, estimatedDocumentCount: 0, aggregate: 1,
  insertOne: 1, insertMany: 1, updateOne: 2, updateMany: 2, replaceOne: 2,
  findOneAndUpdate: 2, findOneAndReplace: 2, findOneAndDelete: 1,
  deleteOne: 1, deleteMany: 1, bulkWrite: 1, distinct: 2,
};
const abortable = new Set(["find", "findOne", "aggregate", "countDocuments", "distinct"]);

export function boundedCollection<T extends object>(collection: T, cursorCollection?: (timeoutMS: number) => T): T {
  return new Proxy(collection, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      const index = typeof property === "string" ? optionsAt[property] : undefined;
      if (index === undefined) return value.bind(target);
      return (...args: unknown[]) => {
        assertOperationBudget();
        const options = (args[index] ?? {}) as Record<string, unknown>;
        const signal = operationSignal();
        const timeoutMS = remainingOperationMs(typeof options.timeoutMS === "number" ? Math.min(options.timeoutMS, 30_000) : 30_000);
        // MongoDB 7.5 cursors need a collection-level CSOT default inside a
        // transaction: session-only CSOT emits an invalid maxTimeMS on getMore.
        // Do not set per-command timeoutMS; withTransaction rejects that override.
        const receiver = options.session && (property === "find" || property === "aggregate") && cursorCollection
          ? cursorCollection(timeoutMS) : target;
        args[index] = { ...options, ...(!options.session ? { timeoutMS } : {}),
          ...(signal && abortable.has(String(property)) ? { signal: options.signal instanceof AbortSignal ? AbortSignal.any([signal, options.signal]) : signal } : {}) };
        const method: unknown = Reflect.get(receiver, property, receiver);
        if (typeof method !== "function") throw new TypeError("Mongo collection method is unavailable.");
        return Reflect.apply(method, receiver, args);
      };
    },
  });
}
