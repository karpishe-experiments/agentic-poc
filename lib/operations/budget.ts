import { AsyncLocalStorage } from "node:async_hooks";

export const OPERATION_LIMIT_MS = 300_000;
export const RECONCILIATION_RESERVE_MS = 30_000;

export class OperationBudgetExpired extends Error {
  constructor() { super("Operation budget expired; reconcile the original operation before retrying."); this.name = "OperationBudgetExpired"; }
}

type Budget = { deadlineAtMs: number; signal: AbortSignal; now: () => number };
const budgets = new AsyncLocalStorage<Budget>();

/** This context bounds I/O; persisted lifecycle records remain the authority. */
export async function withOperationBudget<T>(
  deadlineAtMs: number,
  operation: () => Promise<T>,
  options: { signal?: AbortSignal; now?: () => number } = {},
): Promise<T> {
  const parent = budgets.getStore();
  const now = options.now ?? parent?.now ?? Date.now;
  const deadline = Math.min(deadlineAtMs, parent?.deadlineAtMs ?? Infinity);
  const controller = new AbortController();
  const signals = [controller.signal, parent?.signal, options.signal].filter((value): value is AbortSignal => !!value);
  const signal = AbortSignal.any(signals);
  const remaining = deadline - now();
  if (remaining <= 0) throw new OperationBudgetExpired();
  const timer = setTimeout(() => controller.abort(new OperationBudgetExpired()), remaining);
  timer.unref();
  try {
    return await budgets.run({ deadlineAtMs: deadline, signal, now }, async () => {
      assertOperationBudget();
      const result = await operation();
      assertOperationBudget();
      return result;
    });
  } finally { clearTimeout(timer); }
}

export function assertOperationBudget(): void {
  const budget = budgets.getStore();
  if (!budget) return;
  budget.signal.throwIfAborted();
  if (budget.now() >= budget.deadlineAtMs) throw new OperationBudgetExpired();
}

export function remainingOperationMs(maximum = 30_000): number {
  assertOperationBudget();
  const budget = budgets.getStore();
  return budget ? Math.max(1, Math.min(maximum, budget.deadlineAtMs - budget.now())) : maximum;
}

export function operationSignal(): AbortSignal | undefined { return budgets.getStore()?.signal; }

/** Cleanup has its own short bound; it cannot renew the work's execution lease. */
export function withCleanupBudget<T>(operation: () => Promise<T>): Promise<T> {
  return budgets.exit(() => withOperationBudget(Date.now() + 5_000, operation));
}
