import { describe, expect, it, vi } from "vitest";
import { assertOperationBudget, operationSignal, remainingOperationMs, withOperationBudget } from "@/lib/operations/budget";

describe("operation budget", () => {
  it("shares the original deadline with nested work", async () => {
    let now = 100;
    await withOperationBudget(200, async () => {
      expect(remainingOperationMs()).toBe(100);
      now = 150;
      await withOperationBudget(1000, async () => {
        expect(remainingOperationMs()).toBe(50);
        now = 200;
        expect(() => assertOperationBudget()).toThrow("budget expired");
      }).catch(() => undefined);
    }, { now: () => now }).catch((error: Error) => expect(error.name).toBe("OperationBudgetExpired"));
  });

  it("aborts the dependency, not only its waiting caller", async () => {
    vi.useFakeTimers();
    try {
      let cancelled = false;
      const work = withOperationBudget(Date.now() + 100, () => new Promise<void>((resolve) => {
        operationSignal()!.addEventListener("abort", () => { cancelled = true; resolve(); }, { once: true });
      }));
      const assertion = expect(work).rejects.toThrow("budget expired");
      await vi.advanceTimersByTimeAsync(100);
      await assertion;
      expect(cancelled).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it("propagates caller cancellation and fences completion", async () => {
    const controller = new AbortController();
    await expect(withOperationBudget(Date.now() + 1000, async () => {
      controller.abort(new Error("stopped"));
      return "must not commit";
    }, { signal: controller.signal })).rejects.toThrow("stopped");
  });
});
