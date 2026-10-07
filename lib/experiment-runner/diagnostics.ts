import { AsyncLocalStorage } from "node:async_hooks";
import type { AssetStore } from "@/lib/assets/asset-store";

type Identity = { runId: string; operationId?: string };
type Counters = { queryCount: number; storageCallCount: number };
const current = new AsyncLocalStorage<Counters>();

export function countVerificationQuery(count = 1) {
  const counters = current.getStore();
  if (counters) counters.queryCount += count;
}
export function countVerificationStorageCall() {
  const counters = current.getStore();
  if (counters) counters.storageCallCount++;
}

export function diagnosticAssetStore(store: AssetStore): AssetStore {
  return {
    async get(uri) { countVerificationStorageCall(); return store.get(uri); },
    async exists(uri) { countVerificationStorageCall(); return store.exists(uri); },
    async put(uri, content, mimeType) { countVerificationStorageCall(); return store.put(uri, content, mimeType); },
  };
}

// Allowlisted diagnostics only. These timings never grant authorization and
// counters cover instrumented verification work, not all application queries.
export async function measurePhase<T>(identity: Identity, phase: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const counters = { queryCount: 0, storageCallCount: 0 };
  let outcome = "failed";
  try {
    const result = await current.run(counters, work);
    outcome = "succeeded";
    return result;
  } finally {
    const parent = current.getStore();
    if (parent) {
      parent.queryCount += counters.queryCount;
      parent.storageCallCount += counters.storageCallCount;
    }
    console.info(JSON.stringify({ event: "booklet_callback_phase", runId: identity.runId,
      ...(identity.operationId ? { operationId: identity.operationId } : {}), phase,
      elapsedMs: Math.round(performance.now() - start), ...counters, outcome }));
  }
}
