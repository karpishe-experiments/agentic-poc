import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  files: new Map<string, string>(), events: [] as string[],
  mutationError: undefined as Error | undefined,
  preview: vi.fn(), apply: vi.fn(), verify: vi.fn(), verifyUnapplied: vi.fn(), close: vi.fn(), inspect: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDatabase: () => ({ close: mocks.close,
  collections: { deployment_control: { findOne: async () => ({ maintenance: false }) } } }) }));
vi.mock("@/lib/config/env", () => ({ getServerEnv: () => ({ RUNNER_ENABLED: "false", DEPLOYMENT_ENV: "_staging",
  MONGODB_DATABASE: "kids_booklet", ASSETS_BUCKET: "kids-booklet-staging-assets" }) }));
vi.mock("@/lib/experiment-runner/m4-config", () => ({ readM4RunnerConfig: () => ({ enabled: true, config: {} }) }));
vi.mock("@/lib/experiment-runner/config", () => ({ readBookletRunnerConfig: () => ({ enabled: true }) }));
vi.mock("@/db/setup", () => ({ verifyMongoStructure: vi.fn() }));
vi.mock("@/db/verify", () => ({ verifyExperimentData: vi.fn(), verifyMongoData: vi.fn() }));
vi.mock("@/lib/operations/budget", () => ({ withOperationBudget: async (_deadline: number, action: () => unknown) => action() }));
vi.mock("@/lib/operations/recovery-inspection", () => ({ inspectRecoveryWork: mocks.inspect }));
vi.mock("@/lib/operations/booklet-recovery", async () => {
  const { createHash } = await import("node:crypto");
  return { BOOKLET_RECOVERY_CONTRACT: "booklet-recovery-v1",
    BookletRecoveryError: class extends Error { constructor(public code: string, public stage?: string, public errorKind?: string) { super(code); } },
    recoveryDigest: (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex"),
    createBookletRecovery: () => ({ preview: mocks.preview, apply: mocks.apply, verifyCompleted: mocks.verify, verifyUnapplied: mocks.verifyUnapplied }),
  };
});
vi.mock("node:fs/promises", () => ({
  lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false, mode: 0o700 }),
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
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { process.argv = originalArgv; process.exitCode = 0; vi.restoreAllMocks(); });
describe("supported booklet recovery command", () => {
  it("previews without checkpoint or business writes", async () => {
    argumentsFor("preview"); await import("@/scripts/booklet-recovery");
    expect(mocks.files.size).toBe(0); expect(mocks.apply).not.toHaveBeenCalled(); expect(process.exitCode).toBe(0);
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
