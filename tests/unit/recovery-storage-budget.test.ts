import { afterEach, describe, expect, it, vi } from "vitest";
import type { S3Client } from "@aws-sdk/client-s3";
import { RecoveryStorage } from "@/scripts/recovery-storage";
import { RecoveryDiagnostics } from "@/scripts/recovery-diagnostics";
import { withOperationBudget } from "@/lib/operations/budget";

const quiet = () => new RecoveryDiagnostics(() => {});
function delayedClient(delay: number, sent: AbortSignal[]) {
  return { send: async (_command: unknown, options: { abortSignal: AbortSignal }) => {
    sent.push(options.abortSignal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      options.abortSignal.addEventListener("abort", () => { clearTimeout(timer); reject(options.abortSignal.reason); }, { once: true });
    });
    return { Body: { transformToByteArray: async () => Buffer.from("data") } };
  } } as unknown as S3Client;
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("maintenance transfer budgets", () => {
  it("allows a transfer longer than 30 seconds inside maintenance", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const storage = new RecoveryStorage(delayedClient(31_000, signals), "recovery", quiet());
    const pending = withOperationBudget(Date.now() + 60_000, () => storage.read("private-key"));
    await vi.advanceTimersByTimeAsync(31_000);
    expect((await pending).bytes.length).toBe(4);
    expect(signals[0].aborted).toBe(false);
  });
  it("retains the 30-second bound outside maintenance", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const storage = new RecoveryStorage(delayedClient(31_000, signals), "recovery", quiet());
    const checked = expect(storage.read("private-key")).rejects.toThrow("Operation budget expired");
    await vi.advanceTimersByTimeAsync(30_000);
    await checked;
    expect(signals[0].aborted).toBe(true);
  });
  it("does not renew the parent deadline across sequential writes", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const storage = new RecoveryStorage(delayedClient(31_000, signals), "recovery", quiet());
    const checked = expect(withOperationBudget(Date.now() + 60_000, async () => {
      await storage.reserve("one"); await storage.reserve("two");
    })).rejects.toThrow("Operation budget expired");
    await vi.advanceTimersByTimeAsync(60_000);
    await checked;
    expect(signals).toHaveLength(2);
    expect(signals[1].aborted).toBe(true);
  });
  it("destroys a response stream when its parent expires", async () => {
    vi.useFakeTimers();
    let rejectBody: (error: Error) => void = () => {};
    const destroy = vi.fn(() => rejectBody(new Error("stream aborted")));
    const client = { send: async () => ({ Body: { destroy, transformToByteArray: () => new Promise<Uint8Array>((_resolve, reject) => { rejectBody = reject; }) } }) } as unknown as S3Client;
    const storage = new RecoveryStorage(client, "recovery", quiet());
    const checked = expect(withOperationBudget(Date.now() + 60_000, () => storage.read("private-key"))).rejects.toThrow("stream aborted");
    await vi.advanceTimersByTimeAsync(60_000);
    await checked;
    expect(destroy).toHaveBeenCalledOnce();
  });
  it("dispatches nothing for an expired budget", async () => {
    const send = vi.fn();
    const storage = new RecoveryStorage({ send } as unknown as S3Client, "recovery", quiet());
    await expect(withOperationBudget(Date.now() - 1, () => storage.reserve("one"))).rejects.toThrow("Operation budget expired");
    expect(send).not.toHaveBeenCalled();
  });
});
describe("content-free recovery diagnostics", () => {
  it("uses stderr and excludes object keys, bodies and exception text", async () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    const client = { send: async () => { throw new Error("credential-private-host-secret"); } } as unknown as S3Client;
    await expect(new RecoveryStorage(client, "private-bucket").read("private-key")).rejects.toThrow("credential-private-host-secret");
    const records = stderr.mock.calls.map(([line]) => JSON.parse(line));
    expect(records.map((record) => record.outcome)).toEqual(["started", "failure"]);
    expect(records[1].failureCategory).toBe("storage_failure");
    expect(JSON.stringify(records)).not.toMatch(/private|credential|secret/);
    expect(stdout).not.toHaveBeenCalled();
  });
  it("retains the original result and error when the diagnostic sink fails", async () => {
    const diagnostics = new RecoveryDiagnostics(() => { throw new Error("sink failed"); });
    expect(await diagnostics.measure({ phase: "inventory", action: "phase" }, async () => 7)).toBe(7);
    const original = new Error("original");
    await expect(diagnostics.measure({ phase: "inventory", action: "phase" }, async () => { throw original; })).rejects.toBe(original);
  });
});
