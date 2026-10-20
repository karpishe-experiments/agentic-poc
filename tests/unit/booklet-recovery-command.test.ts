import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  files: new Map<string, string>(), events: [] as string[],
  mutationError: undefined as Error | undefined,
  budgetError: undefined as Error | undefined,
  entryErrors: {} as Partial<Record<"environment" | "database" | "configuration" | "recovery_service" | "admission", Error>>,
  preview: vi.fn(), apply: vi.fn(), verify: vi.fn(), verifyUnapplied: vi.fn(), close: vi.fn(), inspect: vi.fn(),
  previewClaim: vi.fn(), applyClaim: vi.fn(), verifyClaim: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDatabase: () => {
  if (mocks.entryErrors.database) throw mocks.entryErrors.database;
  return { close: mocks.close, collections: { deployment_control: { findOne: async () => {
    if (mocks.entryErrors.admission) throw mocks.entryErrors.admission;
    return { maintenance: false };
  } } } };
} }));
vi.mock("@/lib/config/env", () => ({ getServerEnv: () => {
  if (mocks.entryErrors.environment) throw mocks.entryErrors.environment;
  return { RUNNER_ENABLED: "false", DEPLOYMENT_ENV: "_staging", MONGODB_DATABASE: "kids_booklet", ASSETS_BUCKET: "kids-booklet-staging-assets" };
} }));
vi.mock("@/lib/experiment-runner/m4-config", () => ({ readM4RunnerConfig: () => {
  if (mocks.entryErrors.configuration) throw mocks.entryErrors.configuration;
  return { enabled: true, config: {} };
} }));
vi.mock("@/lib/experiment-runner/config", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/experiment-runner/config")>(), readBookletRunnerConfig: () => ({ enabled: true }),
}));
vi.mock("@/db/setup", () => ({ verifyMongoStructure: vi.fn() }));
vi.mock("@/db/verify", () => ({ verifyExperimentData: vi.fn(), verifyMongoData: vi.fn() }));
vi.mock("@/db/deployment-readiness", async importOriginal => ({
  ...await importOriginal<typeof import("@/db/deployment-readiness")>(), verifyDeploymentState: vi.fn(),
}));
vi.mock("@/lib/operations/budget", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/operations/budget")>(),
  withOperationBudget: async (_deadline: number, action: () => unknown) => {
  if (mocks.budgetError) throw mocks.budgetError;
  return action();
} }));
vi.mock("@/lib/operations/recovery-inspection", () => ({ inspectRecoveryWork: mocks.inspect }));
vi.mock("@/lib/operations/booklet-recovery", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/operations/booklet-recovery")>();
  return { ...actual,
    createBookletRecovery: () => {
      if (mocks.entryErrors.recovery_service) throw mocks.entryErrors.recovery_service;
      return { preview: mocks.preview, apply: mocks.apply, verifyCompleted: mocks.verify, verifyUnapplied: mocks.verifyUnapplied,
        previewClaimRelease: mocks.previewClaim, applyClaimRelease: mocks.applyClaim, verifyClaimRelease: mocks.verifyClaim };
    },
  };
});
vi.mock("node:fs/promises", () => ({
  lstat: async () => ({ isDirectory: () => true, isFile: () => true, isSymbolicLink: () => false, mode: 0o700 }),
  readFile: async (path: string) => { path = path.replaceAll("\\", "/"); if (!mocks.files.has(path)) throw Object.assign(new Error(), { code: "ENOENT" }); return mocks.files.get(path); },
  rename: async (from: string, to: string) => { from = from.replaceAll("\\", "/"); to = to.replaceAll("\\", "/"); mocks.files.set(to, mocks.files.get(from)!); mocks.files.delete(from); },
  open: async (path: string, flags: string) => {
    path = path.replaceAll("\\", "/");
    if (flags === "wx" && mocks.files.has(path)) throw Object.assign(new Error(), { code: "EEXIST" });
    return { writeFile: async (value: string) => { mocks.events.push("checkpoint"); mocks.files.set(path, value); },
      sync: async () => { mocks.events.push("sync"); }, close: async () => {} };
  },
}));
const originalArgv = [...process.argv];
const digest = "a".repeat(64);
function argumentsFor(phase: string) {
  process.argv = [originalArgv[0], "scripts/booklet-recovery.ts", phase, "--run-id", "run", "--operation-id", "operation",
    "--expected-revision", "2", "--preview-digest", digest, "--evidence-dir", "/recovery"];
}
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); mocks.files.clear(); mocks.events.length = 0; mocks.mutationError = undefined; process.exitCode = 0;
  mocks.entryErrors = {};
  mocks.preview.mockResolvedValue({ contract: "booklet-recovery-v1", previewDigest: digest, snapshot: { rows: {} } });
  mocks.apply.mockImplementation(async (_target, expectedDigest, beforeMutation) => {
    const proof = await mocks.preview();
    if (proof.previewDigest !== expectedDigest) throw new Error("preview_changed");
    await beforeMutation(proof);
    mocks.events.push("apply");
    if (mocks.mutationError) throw mocks.mutationError;
    return proof;
  });
  mocks.verify.mockResolvedValue({ verified: true, outcome: "completed" });
  mocks.verifyUnapplied.mockResolvedValue({ verified: true, outcome: "unapplied", admission: "closed", providerPosts: 0 });
  mocks.inspect.mockResolvedValue({ outcome: "clear" });
  mocks.previewClaim.mockResolvedValue({ previewDigest: digest });
  mocks.verifyClaim.mockResolvedValue({ verified: true, outcome: "claim_released", providerPosts: 0 });
  mocks.applyClaim.mockImplementation(async (_target, _before, _digest, checkpoint) => {
    await checkpoint({ previewDigest: digest, claim: { id: "private-owner", expiresAtMs: 1 } });
    if (mocks.mutationError) throw mocks.mutationError;
    return { verified: true, outcome: "claim_released", providerPosts: 0 };
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { process.argv = originalArgv; process.exitCode = 0; vi.restoreAllMocks(); });
describe("supported booklet recovery command", () => {
  it.each([
    ["environment", "Error", "Error"], ["database", "MongoNetworkError", "MongoNetworkError"],
    ["configuration", "MongoServerSelectionError", "MongoServerSelectionError"],
    ["recovery_service", "PrivateConstructorError", "Error"], ["admission", "MongoOperationTimeoutError", "MongoOperationTimeoutError"],
  ] as const)("reports sanitized %s entry failure before preview or apply", async (stage, name, errorKind) => {
    mocks.entryErrors[stage] = Object.assign(new Error("private credential URL and saved content"), { name });
    argumentsFor("preview"); await import("@/scripts/booklet-recovery");
    const output = JSON.parse(vi.mocked(console.log).mock.calls.at(-1)?.[0]);
    expect(output).toMatchObject({ verified: false, phase: "preview", stage, errorKind,
      code: "inspection_or_verification_failed", outcome: "blocked", providerPosts: 0,
      elapsedMs: expect.any(Number) });
    expect(output.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(output).toHaveProperty("remainingBudgetMs");
    if (output.remainingBudgetMs !== null) expect(output.remainingBudgetMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toMatch(/private|credential|PrivateConstructorError/);
    expect(mocks.files.size).toBe(0); expect(mocks.preview).not.toHaveBeenCalled(); expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.previewClaim).not.toHaveBeenCalled(); expect(mocks.applyClaim).not.toHaveBeenCalled(); expect(process.exitCode).toBe(1);
  });
  it("preserves an existing structured entry failure code and stage", async () => {
    const { BookletRecoveryError } = await import("@/lib/operations/booklet-recovery");
    mocks.entryErrors.configuration = new BookletRecoveryError("target_read_failed", "snapshot.target", "MongoOperationTimeoutError", { elapsedMs: 7, remainingBudgetMs: 12 });
    argumentsFor("preview"); await import("@/scripts/booklet-recovery");
    expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)?.[0])).toMatchObject({ code: "target_read_failed",
      stage: "snapshot.target", errorKind: "MongoOperationTimeoutError", elapsedMs: 7, remainingBudgetMs: 12 });
    expect(mocks.preview).not.toHaveBeenCalled(); expect(mocks.apply).not.toHaveBeenCalled(); expect(mocks.files.size).toBe(0);
  });
  async function originalCheckpoint() {
    const { recoveryDigest } = await import("@/lib/operations/booklet-recovery");
    const snapshot = { rows: {} };
    const original = JSON.stringify({ contract: "booklet-recovery-v1", phase: "started", target: { runId: "run", operationId: "operation", expectedRevision: 2 },
      previewDigest: digest, snapshot, snapshotDigest: recoveryDigest(snapshot) });
    mocks.files.set("/original-recovery/application-recovery.json", original);
    return original;
  }
  it("previews claim release without writes and keeps the parent checkpoint unchanged", async () => {
    const original = await originalCheckpoint();
    argumentsFor("preview-claim-release"); await import("@/scripts/booklet-recovery");
    expect(mocks.files.size).toBe(1);
    expect(mocks.files.get("/original-recovery/application-recovery.json")).toBe(original);
    expect(mocks.applyClaim).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("private-owner");
  });
  it.each([false, true])("checkpoints claim release and verifies duplicates without replay (interrupted=%s)", async interrupted => {
    const original = await originalCheckpoint();
    if (interrupted) mocks.mutationError = new Error("private error");
    argumentsFor("apply-claim-release"); await import("@/scripts/booklet-recovery");
    expect(JSON.parse(mocks.files.get("/recovery/claim-release.json")!).phase).toBe(interrupted ? "started" : "completed");
    if (interrupted) mocks.verifyClaim.mockRejectedValueOnce(new Error("not verified"));
    vi.resetModules(); await import("@/scripts/booklet-recovery");
    expect(mocks.applyClaim).toHaveBeenCalledOnce(); expect(mocks.verifyClaim).toHaveBeenCalledOnce();
    expect(mocks.files.get("/original-recovery/application-recovery.json")).toBe(original);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("private");
  });
  it("rejects a completed or changed original checkpoint before claim release", async () => {
    await originalCheckpoint();
    const path = "/original-recovery/application-recovery.json";
    const original = JSON.parse(mocks.files.get(path)!); original.phase = "completed";
    mocks.files.set(path, JSON.stringify(original));
    argumentsFor("apply-claim-release"); await import("@/scripts/booklet-recovery");
    expect(mocks.applyClaim).not.toHaveBeenCalled(); expect(mocks.files.size).toBe(1); expect(process.exitCode).toBe(1);
  });
  it("previews without checkpoint or business writes", async () => {
    argumentsFor("preview"); await import("@/scripts/booklet-recovery");
    expect(mocks.files.size).toBe(0); expect(mocks.apply).not.toHaveBeenCalled(); expect(process.exitCode).toBe(0);
  });
  it("reports cleanup failure without losing the original sanitized failure", async () => {
    const { BookletRecoveryError } = await import("@/lib/operations/booklet-recovery");
    mocks.preview.mockRejectedValueOnce(new BookletRecoveryError("target_read_failed", "snapshot.target", "MongoOperationTimeoutError"));
    mocks.close.mockRejectedValueOnce(new Error("private cleanup details"));
    argumentsFor("preview"); await import("@/scripts/booklet-recovery");
    const events = vi.mocked(console.log).mock.calls.map(([value]) => JSON.parse(value));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "target_read_failed", stage: "snapshot.target", errorKind: "MongoOperationTimeoutError" }),
      expect.objectContaining({ code: "database_cleanup_failed", phase: "cleanup", outcome: "requires_inspection" }),
    ]));
    expect(JSON.stringify(events)).not.toContain("private");
    expect(mocks.files.size).toBe(0); expect(mocks.apply).not.toHaveBeenCalled(); expect(process.exitCode).toBe(1);
  });
  it("reports the failing inspection phase without private database details", async () => {
    const { BookletRecoveryError } = await import("@/lib/operations/booklet-recovery");
    mocks.preview.mockRejectedValueOnce(new BookletRecoveryError("inspection_or_verification_failed", "snapshot.experiment_operations", "MongoOperationTimeoutError"));
    argumentsFor("preview"); await import("@/scripts/booklet-recovery");
    expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)?.[0])).toMatchObject({
      verified: false, phase: "preview", stage: "snapshot.experiment_operations", errorKind: "MongoOperationTimeoutError", outcome: "blocked",
    });
    expect(mocks.files.size).toBe(0); expect(mocks.events).not.toContain("apply"); expect(process.exitCode).toBe(1);
  });
  it("reports a direct outer-budget expiry instead of generic Error", async () => {
    mocks.budgetError = Object.assign(new Error("private budget detail"), { name: "OperationBudgetExpired" });
    try {
      argumentsFor("preview"); await import("@/scripts/booklet-recovery");
      expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)?.[0])).toMatchObject({ errorKind: "OperationBudgetExpired", outcome: "blocked",
        stage: "operation_budget", elapsedMs: expect.any(Number), remainingBudgetMs: 0 });
      expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("private");
    } finally { mocks.budgetError = undefined; }
  });
  it("durably checkpoints before mutation and returns a duplicate without replay", async () => {
    argumentsFor("apply"); await import("@/scripts/booklet-recovery");
    expect(mocks.events.indexOf("sync")).toBeLessThan(mocks.events.indexOf("apply"));
    expect(JSON.parse(mocks.files.get("/recovery/application-recovery.json")!).phase).toBe("completed");
    vi.resetModules(); await import("@/scripts/booklet-recovery");
    expect(mocks.apply).toHaveBeenCalledOnce(); expect(mocks.verify).toHaveBeenCalledTimes(2);
  });
  it("does not replay an uncertain mutation or falsely complete its checkpoint", async () => {
    mocks.mutationError = new Error("private details");
    argumentsFor("apply"); await import("@/scripts/booklet-recovery");
    expect(JSON.parse(mocks.files.get("/recovery/application-recovery.json")!).phase).toBe("started");
    mocks.verify.mockRejectedValueOnce(new Error("not committed"));
    vi.resetModules(); await import("@/scripts/booklet-recovery");
    expect(mocks.apply).toHaveBeenCalledOnce(); expect(process.exitCode).toBe(1);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("private details");
  });
  it("verifies a lost commit response without writes or replay", async () => {
    mocks.verify.mockRejectedValueOnce(new Error("lost response"));
    argumentsFor("apply"); await import("@/scripts/booklet-recovery");
    const checkpoint = mocks.files.get("/recovery/application-recovery.json"); const writes = mocks.events.length;
    argumentsFor("verify-completed"); vi.resetModules(); await import("@/scripts/booklet-recovery");
    expect(mocks.files.get("/recovery/application-recovery.json")).toBe(checkpoint);
    expect(mocks.events.length).toBe(writes); expect(mocks.apply).toHaveBeenCalledOnce();
  });
  it("proves an interrupted apply stayed unapplied without replay or checkpoint mutation", async () => {
    mocks.mutationError = new Error("pre-write failure");
    argumentsFor("apply"); await import("@/scripts/booklet-recovery");
    const checkpoint = mocks.files.get("/recovery/application-recovery.json");
    expect(JSON.parse(checkpoint!).phase).toBe("started");
    const events = [...mocks.events]; const previewCalls = mocks.preview.mock.calls.length;
    process.exitCode = 0;
    argumentsFor("verify-unapplied"); vi.resetModules(); await import("@/scripts/booklet-recovery");
    expect(mocks.verifyUnapplied).toHaveBeenCalledExactlyOnceWith({ runId: "run", operationId: "operation", expectedRevision: 2 }, digest);
    expect(mocks.files.get("/recovery/application-recovery.json")).toBe(checkpoint);
    expect(mocks.events).toEqual(events); expect(mocks.apply).toHaveBeenCalledOnce();
    expect(mocks.preview).toHaveBeenCalledTimes(previewCalls); expect(mocks.verify).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
    expect(vi.mocked(console.log).mock.calls.at(-1)?.[0]).toContain('"outcome":"unapplied"');
  });
  it("rejects changed preview before writing a checkpoint", async () => {
    mocks.preview.mockResolvedValueOnce({ previewDigest: "b".repeat(64) });
    argumentsFor("apply"); await import("@/scripts/booklet-recovery");
    expect(mocks.files.size).toBe(0); expect(mocks.events).not.toContain("apply"); expect(process.exitCode).toBe(1);
  });
  it("rejects mismatched or corrupt checkpoint without mutation", async () => {
    argumentsFor("apply"); await import("@/scripts/booklet-recovery");
    const path = "/recovery/application-recovery.json";
    const checkpoint = JSON.parse(mocks.files.get(path)!); checkpoint.snapshot = { altered: true };
    mocks.files.set(path, JSON.stringify(checkpoint)); vi.resetModules(); await import("@/scripts/booklet-recovery");
    expect(mocks.apply).toHaveBeenCalledOnce(); expect(process.exitCode).toBe(1);
  });
});
