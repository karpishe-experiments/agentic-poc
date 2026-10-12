// Next may bundle the API and worker separately. Keep process-local cancellation
// in one registry; durable stop intent remains the cross-process authority.
const key = Symbol.for("booklet.operation.controllers");
const state = globalThis as typeof globalThis & { [key]?: Map<string, Set<AbortController>> };
const controllers = state[key] ??= new Map<string, Set<AbortController>>();

export function registerOwnedController(identity: string, controller: AbortController): () => void {
  const owned = controllers.get(identity) ?? new Set<AbortController>();
  owned.add(controller); controllers.set(identity, owned);
  return () => { owned.delete(controller); if (!owned.size) controllers.delete(identity); };
}

export async function withOwnedController<T>(identity: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const release = registerOwnedController(identity, controller);
  try { return await work(controller.signal); }
  finally { release(); }
}

export function cancelOwnedControllers(identity: string): void {
  for (const controller of controllers.get(identity) ?? []) controller.abort(new Error("Operation stop requested; reconcile its saved outcome."));
}
