import { AsyncLocalStorage } from "node:async_hooks";
import type { AssetStore } from "@/lib/assets/asset-store";
import { budgetRemaining, safeFailure } from "@/lib/operations/completion-failure";
import type { AdmissionReadDiagnostic } from "@/lib/contracts/experiment-admission-diagnostics";

type Identity = { runId: string; operationId?: string };
type Counters = { queryCount: number; storageCallCount: number; transactionAttempts: number;
  readRows?: number; readJsonBytes?: number | null };
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
const readKey = Symbol.for("booklet.admission-read-results");
const readState = globalThis as typeof globalThis & { [readKey]?: (AdmissionReadDiagnostic & { timestamp: string })[] };
const admissionReads = readState[readKey] ??= [];

export function retainAdmissionRead(result: AdmissionReadDiagnostic) {
  admissionReads.push(structuredClone({ ...result, timestamp: new Date().toISOString() }));
  if (admissionReads.length > 20) admissionReads.shift();
}

export function recentDiagnostics(runId: string | undefined, limit: number) {
  const matching = runId ? buffer.events.filter(event => event.runId === runId) : buffer.events;
  return { processStartedAt: buffer.startedAt, truncated: buffer.dropped > 0 || matching.length > limit,
    events: matching.slice(-limit).map(event => ({ ...event })),
    admissionReads: structuredClone(admissionReads.filter(result => !runId || result.runId === runId).slice(-limit)) };
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

// Size only, never contents. Unsupported diagnostic serialization must not change
// the outcome of a successful evidence read or its subsequent proof validation.
export function countVerificationRead(rows: readonly unknown[]) {
  const counters = current.getStore();
  if (!counters) return;
  counters.readRows = (counters.readRows ?? 0) + rows.length;
  try {
    const bytes = rows.reduce<number>((sum, row) => sum + Buffer.byteLength(JSON.stringify(row), "utf8"), 0);
    if (counters.readJsonBytes !== null) counters.readJsonBytes = (counters.readJsonBytes ?? 0) + bytes;
  } catch { counters.readJsonBytes = null; }
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
  const counters: Counters = { queryCount: 0, storageCallCount: 0, transactionAttempts: 0 };
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
      if (counters.readRows !== undefined) parent.readRows = (parent.readRows ?? 0) + counters.readRows;
      if (counters.readJsonBytes !== undefined) parent.readJsonBytes = parent.readJsonBytes === null || counters.readJsonBytes === null
        ? null : (parent.readJsonBytes ?? 0) + counters.readJsonBytes;
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
