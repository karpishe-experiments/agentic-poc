import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: vi.fn(), temporary: vi.fn(), destroy: vi.fn(),
  verify: vi.fn(async () => ({ backupId: "exact", database: "kids_booklet", environment: "_staging", imageDigest: `sha256:${"a".repeat(64)}`, assets: [] })),
  budget: vi.fn(async (_deadline: number, operation: () => Promise<unknown>) => operation()),
}));
vi.mock("@/db/client", () => ({ getDatabase: mocks.database }));
vi.mock("@/lib/config/env", () => ({ getServerEnv: () => ({ RUNNER_ENABLED: "false", RECOVERY_BUCKET: "recovery",
  ASSETS_BUCKET: "assets", MONGODB_DATABASE: "kids_booklet", DEPLOYMENT_ENV: "_staging" }) }));
vi.mock("@/lib/assets/create-object-store-client", () => ({ createObjectStoreClient: () => ({ destroy: mocks.destroy }) }));
vi.mock("node:fs/promises", () => ({ mkdtemp: mocks.temporary, chmod: vi.fn(), readFile: vi.fn(), rm: vi.fn(), writeFile: vi.fn() }));
vi.mock("@/lib/operations/budget", () => ({ withOperationBudget: mocks.budget, remainingOperationMs: vi.fn(), operationSignal: vi.fn() }));
vi.mock("@/scripts/recovery-storage", async (importOriginal) => ({ ...await importOriginal<object>(),
  RecoveryStorage: class { verifiedCompletedBackup = mocks.verify; },
}));
const originalArgv = [...process.argv];
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  process.argv = [process.argv[0], "scripts/recovery.ts", "verify"];
  vi.stubEnv("BACKUP_ID", "exact"); vi.stubEnv("RELEASE_IMAGE_DIGEST", `sha256:${"a".repeat(64)}`);
});
afterEach(() => { process.argv = [...originalArgv]; vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("read-only recovery verify command", () => {
  it("verifies exact target under a 30-minute budget without database or local writes", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const before = Date.now(); await import("@/scripts/recovery");
    expect(mocks.verify).toHaveBeenCalledWith("exact", "kids_booklet", "_staging", `sha256:${"a".repeat(64)}`);
    expect(mocks.budget.mock.calls[0][0]).toBeGreaterThanOrEqual(before + 1_800_000);
    expect(mocks.budget.mock.calls[0][0]).toBeLessThanOrEqual(Date.now() + 1_800_000);
    expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.temporary).not.toHaveBeenCalled();
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it("requires exact backup identity before access", async () => {
    vi.stubEnv("BACKUP_ID", "");
    await expect(import("@/scripts/recovery")).rejects.toThrow("Verification requires exact");
    expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
  });
  it("destroys the storage client after a failed verification", async () => {
    mocks.verify.mockRejectedValueOnce(new Error("ChecksumMismatch"));
    await expect(import("@/scripts/recovery")).rejects.toThrow("ChecksumMismatch");
    expect(mocks.destroy).toHaveBeenCalledOnce(); expect(mocks.database).not.toHaveBeenCalled();
  });
});
