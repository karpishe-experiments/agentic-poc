import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  calls: [] as string[],
  env: { DEPLOYMENT_ENV: "_staging", MONGODB_DATABASE: "kids_booklet", ASSETS_BUCKET: "kids-booklet-staging-assets", RECOVERY_BUCKET: "recovery" },
  catalog: "ready",
  backupError: null as Error | null,
  idleError: null as Error | null,
  stoppedError: null as Error | null,
  retireError: null as Error | null,
}));
vi.mock("@/lib/config/env", () => ({ getServerEnv: () => mock.env }));
vi.mock("@/db/client", () => ({ getDatabase: () => {
  mock.calls.push("database");
  return { close: async () => { mock.calls.push("close"); } };
} }));
vi.mock("@/db/experiment-maintenance", () => ({
  verifyExperimentMaintenanceIdle: async () => { mock.calls.push("idle"); if (mock.idleError) throw mock.idleError; },
  verifyStoppedStagingMaintenance: async () => { mock.calls.push("stopped"); if (mock.stoppedError) throw mock.stoppedError; },
}));
vi.mock("@/db/setup", () => ({
  inspectArtifactIndexRetirement: async () => { mock.calls.push("inspect"); return mock.catalog; },
  retireLegacyArtifactIndex: async () => { mock.calls.push("retire"); if (mock.retireError) throw mock.retireError; return "removed"; },
}));
vi.mock("@/lib/assets/create-object-store-client", () => ({ createObjectStoreClient: () => {
  mock.calls.push("storage");
  return { destroy: () => { mock.calls.push("destroy"); } };
} }));
vi.mock("../../scripts/recovery-storage", () => ({ RecoveryStorage: class {
  async verifiedCompletedBackup() { mock.calls.push("backup"); if (mock.backupError) throw mock.backupError; }
} }));

const originalArgv = process.argv;
const originalEnv = { ...process.env };
const normalEnv = { DEPLOYMENT_ENV: "_staging", MONGODB_DATABASE: "kids_booklet", ASSETS_BUCKET: "kids-booklet-staging-assets", RECOVERY_BUCKET: "recovery" };
async function run(arg?: string) {
  vi.resetModules();
  process.argv = ["node", "script", ...(arg ? [arg] : [])];
  await import("../../scripts/retire-staging-artifact-index");
}

beforeEach(() => {
  mock.calls.length = 0;
  mock.env = { ...normalEnv };
  mock.catalog = "ready";
  mock.backupError = mock.idleError = mock.stoppedError = mock.retireError = null;
  process.env.RUNNER_ENABLED = "false";
  process.env.CONFIRM_DATABASE = "kids_booklet";
  process.env.BACKUP_ID = "backup-id";
  process.env.RELEASE_IMAGE_DIGEST = `sha256:${"a".repeat(64)}`;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  process.argv = originalArgv;
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("staging artifact index command", () => {
  it("defaults to preview without storage or retirement", async () => {
    await run();
    expect(mock.calls).toEqual(["database", "idle", "inspect", "close"]);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"outcome":"would remove"'));
  });

  it.each(["--invalid", "--apply --preview"])("rejects invalid arguments before opening database: %s", async (arg) => {
    vi.resetModules();
    process.argv = ["node", "script", ...arg.split(" ")];
    await expect(import("../../scripts/retire-staging-artifact-index")).rejects.toThrow("Usage:");
    expect(mock.calls).toEqual([]);
  });

  it.each([
    ["production", "DEPLOYMENT_ENV", "_prod"],
    ["database", "MONGODB_DATABASE", "other"],
    ["assets", "ASSETS_BUCKET", "other"],
  ] as const)("rejects wrong %s before opening database", async (_label, key, value) => {
    mock.env[key] = value;
    await expect(run("--apply")).rejects.toThrow("exact staging target");
    expect(mock.calls).toEqual([]);
  });

  it("rejects enabled runner before opening database", async () => {
    process.env.RUNNER_ENABLED = "true";
    await expect(run("--apply")).rejects.toThrow("disabled dispatch");
    expect(mock.calls).toEqual([]);
  });

  it.each(["CONFIRM_DATABASE", "BACKUP_ID", "RELEASE_IMAGE_DIGEST"])("requires %s for apply", async (key) => {
    delete process.env[key];
    await expect(run("--apply")).rejects.toThrow("requires exact database confirmation");
    expect(mock.calls).toEqual([]);
  });

  it("requires a recovery bucket for apply", async () => {
    mock.env.RECOVERY_BUCKET = "";
    await expect(run("--apply")).rejects.toThrow("recovery bucket");
    expect(mock.calls).toEqual([]);
  });

  it("verifies stopped maintenance twice and completed backup before retirement", async () => {
    await run("--apply");
    expect(mock.calls).toEqual(["database", "idle", "inspect", "stopped", "storage", "backup", "stopped", "retire", "destroy", "close"]);
  });

  it("verifies backup without retirement in verify mode", async () => {
    await run("--verify-backup");
    expect(mock.calls).toEqual(["database", "idle", "inspect", "stopped", "storage", "backup", "stopped", "destroy", "close"]);
  });

  it("does not retire on a bad backup and closes resources", async () => {
    mock.backupError = new Error("invalid backup");
    await expect(run("--apply")).rejects.toThrow("invalid backup");
    expect(mock.calls).toEqual(["database", "idle", "inspect", "stopped", "storage", "backup", "destroy", "close"]);
  });

  it("closes resources on retirement failure", async () => {
    mock.retireError = new Error("catalog changed");
    await expect(run("--apply")).rejects.toThrow("catalog changed");
    expect(mock.calls.slice(-3)).toEqual(["retire", "destroy", "close"]);
  });
});
