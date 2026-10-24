import { AsyncLocalStorage } from "node:async_hooks";
import type { AssetStore } from "@/lib/assets/asset-store";
import { budgetRemaining, safeFailure } from "@/lib/operations/completion-failure";

type Identity = { runId: string; operationId?: string };
type Counters = { queryCount: number; storageCallCount: number; transactionAttempts: number };
const current = new AsyncLocalStorage<Counters>();

export type DiagnosticEvent = Identity & Counters & {
  event: "booklet_callback_phase"; timestamp: string; phase: string;
  elapsedMs: number; outcome: "succeeded" | "failed";
  budgetAtStartMs: number | null; remainingBudgetMs: number | null;
  failure?: ReturnType<typeof safeFailure>;
};
type DiagnosticBuffer = { startedAt: string; dropped: number; events: DiagnosticEvent[] };
// Next.js can bundle the handler and runner separately within the same process.
const bufferKey = Symbol.for("booklet.diagnostics");
const processState = globalThis as typeof globalThis & { [bufferKey]?: DiagnosticBuffer };
const buffer = processState[bufferKey] ??= { startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(), dropped: 0, events: [] };

export function recentDiagnostics(runId: string | undefined, limit: number) {
  const matching = runId ? buffer.events.filter(event => event.runId === runId) : buffer.events;
  return { processStartedAt: buffer.startedAt, truncated: buffer.dropped > 0 || matching.length > limit,
    events: matching.slice(-limit).map(event => ({ ...event })) };
}

export function countVerificationQuery(count = 1) {
  const counters = current.getStore();
  if (counters) counters.queryCount += count;
}
export function countVerificationStorageCall() {
  const counters = current.getStore();
  if (counters) counters.storageCallCount++;
}
export function countTransactionAttempt() {
  const counters = current.getStore();
  if (counters) counters.transactionAttempts++;
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
  const budgetAtStartMs = budgetRemaining();
  const counters = { queryCount: 0, storageCallCount: 0, transactionAttempts: 0 };
  let outcome: DiagnosticEvent["outcome"] = "failed";
  let failure: ReturnType<typeof safeFailure> | undefined;
  try {
    const result = await current.run(counters, work);
    outcome = "succeeded";
    return result;
  } catch (error) {
    failure = safeFailure(error);
    throw error;
  } finally {
    const parent = current.getStore();
    if (parent) {
      parent.queryCount += counters.queryCount;
      parent.storageCallCount += counters.storageCallCount;
      parent.transactionAttempts += counters.transactionAttempts;
    }
    const event: DiagnosticEvent = { event: "booklet_callback_phase", timestamp: new Date().toISOString(), runId: identity.runId,
      ...(identity.operationId ? { operationId: identity.operationId } : {}), phase,
      elapsedMs: Math.round(performance.now() - start), budgetAtStartMs, remainingBudgetMs: budgetRemaining(), ...counters, outcome,
      ...(failure ? { failure } : {}) };
    buffer.events.push(event);
    if (buffer.events.length > 5000) { buffer.events.shift(); buffer.dropped++; }
    console.info(JSON.stringify(event));
  }
}
