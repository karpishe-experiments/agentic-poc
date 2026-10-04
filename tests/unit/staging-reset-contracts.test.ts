import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reset = vi.hoisted(() => ({
  drop: vi.fn(), initialize: vi.fn(), close: vi.fn(), send: vi.fn(),
  markerValid: true, stored: true, deleteError: false,
}));
vi.mock("@/lib/config/env", () => ({ getServerEnv: () => ({ DEPLOYMENT_ENV: "_staging", MONGODB_DATABASE: "kids_booklet", ASSETS_BUCKET: "kids-booklet-staging-assets", RECOVERY_BUCKET: "kids-booklet-staging-recovery" }) }));
vi.mock("@/db/client", () => ({ getDatabase: () => ({ database: { dropDatabase: reset.drop }, close: reset.close }) }));
vi.mock("@/db/initialize", () => ({ initializeMongoData: reset.initialize }));
vi.mock("@/lib/assets/create-asset-store", () => ({ createAssetStore: () => ({}) }));
vi.mock("@/lib/assets/create-object-store-client", () => ({ createObjectStoreClient: () => ({ send: reset.send }) }));
vi.mock("../../scripts/recovery-storage", async (original) => {
  const actual = await original<typeof import("../../scripts/recovery-storage")>();
  return { ...actual, RecoveryStorage: class {
    async read(key: string) {
      const raw = JSON.stringify({ schemaVersion: "1", backupId: "staging-fixture", database: "kids_booklet", environment: "_staging", imageDigest: null, sha256: "a".repeat(64), collections: {}, assets: reset.stored ? [{ uri: "saved.png", recoveryKey: "assets/staging-fixture/saved.png", bytes: 1, sha256: "b".repeat(64), contentType: "image/png" }] : [] });
      return { bytes: Buffer.from(key.endsWith(".complete") ? (reset.markerValid ? actual.digest(raw) : "bad-marker") : raw) };
    }
  } };
});

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv("RUNNER_ENABLED", "false"); vi.stubEnv("CONFIRM_DATABASE", "kids_booklet"); vi.stubEnv("BACKUP_ID", "staging-fixture");
  reset.markerValid = true; reset.stored = true; reset.deleteError = false;
  reset.send.mockImplementation(async (command: { constructor: { name: string }; input: { MaxKeys?: number } }) => command.constructor.name === "ListObjectsV2Command" ? { Contents: command.input.MaxKeys === 1 ? [] : [{ Key: "saved.png" }], IsTruncated: false } : reset.deleteError ? { Errors: [{ Code: "AccessDenied" }] } : {});
});
afterEach(() => vi.unstubAllEnvs());

describe("staging clean-baseline transition", () => {
  it("defaults the workflow to inventory and preserves maintenance dispatch suppression", () => {
    expect(readFileSync(".github/workflows/reset-staging.yml", "utf8")).toContain("type: boolean, default: false");
    const host = readFileSync("scripts/deploy/vps-deployment.sh", "utf8");
    expect(host).toContain('maintenance "$current" read-staging-reset-readiness');
    expect(host).toContain('-e RUNNER_ENABLED=false');
    expect(host).toContain('COMPOSE_SECRET_FILE="$SECRETS/staging/secrets.reset.json"');
    expect(host).toContain("Do not replay reset");
  });
  it("checks the completed exact-target backup before deleting any data", () => {
    const reset = readFileSync("scripts/reset-staging-deployment.ts", "utf8");
    expect(reset.indexOf("parseManifest(")).toBeLessThan(reset.indexOf("dropDatabase()"));
    expect(reset.indexOf("!savedKeys.has(Key)")).toBeLessThan(reset.indexOf("dropDatabase()"));
    expect(reset).toContain('env.ASSETS_BUCKET !== "kids-booklet-staging-assets"');
    expect(reset).toContain("process.env.BACKUP_ID");
    const backup = readFileSync("scripts/recovery.ts", "utf8");
    expect(backup).toContain('process.env.BACKUP_ALL_ASSETS === "true"');
    expect(backup).toContain('env.DEPLOYMENT_ENV !== "_staging"');
  });
  it("does not delete data when the completion marker is invalid", async () => {
    reset.markerValid = false;
    await expect(import("../../scripts/reset-staging-deployment")).rejects.toThrow("completion marker");
    expect(reset.drop).not.toHaveBeenCalled(); expect(reset.initialize).not.toHaveBeenCalled();
    expect(reset.close).toHaveBeenCalledOnce();
  });
  it("does not delete data when any bucket object lacks backup coverage", async () => {
    reset.stored = false;
    await expect(import("../../scripts/reset-staging-deployment")).rejects.toThrow("absent from the reset backup");
    expect(reset.drop).not.toHaveBeenCalled(); expect(reset.initialize).not.toHaveBeenCalled();
  });
  it("initializes only after verified backup coverage and deletion", async () => {
    await import("../../scripts/reset-staging-deployment");
    expect(reset.drop).toHaveBeenCalledOnce(); expect(reset.initialize).toHaveBeenCalledOnce();
    expect(reset.drop.mock.invocationCallOrder[0]).toBeLessThan(reset.initialize.mock.invocationCallOrder[0]);
  });
  it("does not initialize when a resolved delete returns object errors", async () => {
    reset.deleteError = true;
    await expect(import("../../scripts/reset-staging-deployment")).rejects.toThrow("asset deletion failed");
    expect(reset.initialize).not.toHaveBeenCalled();
  });
});
