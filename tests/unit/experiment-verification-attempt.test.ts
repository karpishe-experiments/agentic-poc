import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createVerificationAttempt, ImageEvidenceMismatch } from "@/lib/experiment-runner/verification-attempt";
import type { AssetStore } from "@/lib/assets/asset-store";

describe("transaction-attempt byte evidence", () => {
  it("loads metadata once per attempt, retries failed loads and does not share snapshots", async () => {
    const attempt = createVerificationAttempt({} as AssetStore);
    const load = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue({ revision: 1 });
    await expect(attempt.metadata("run", load)).rejects.toThrow("unavailable");
    expect(await attempt.metadata("run", load)).toEqual({ revision: 1 });
    expect(await attempt.metadata("run", load)).toEqual({ revision: 1 });
    expect(load).toHaveBeenCalledTimes(2);
    load.mockResolvedValue({ revision: 2 });
    expect(await createVerificationAttempt({} as AssetStore).metadata("run", load)).toEqual({ revision: 2 });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("reads an immutable asset once, checks every consumer, and rereads on the next attempt", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const get = vi.fn(async () => bytes);
    const store = { get } as unknown as AssetStore;
    const evidence = { assetId: "asset", uri: "image", sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: 3 };
    const attempt = createVerificationAttempt(store);
    const first = await attempt.read(evidence);
    first[0] = 99;
    expect(await attempt.read(evidence)).toEqual(bytes);
    expect(get).toHaveBeenCalledTimes(1);
    await expect(attempt.read({ ...evidence, byteLength: 4 })).rejects.toThrow("length");
    await expect(attempt.read({ ...evidence, byteLength: 4 })).rejects.toBeInstanceOf(ImageEvidenceMismatch);
    await expect(attempt.read({ ...evidence, sha256: "0".repeat(64) })).rejects.toThrow("digest");
    expect(get).toHaveBeenCalledTimes(2);
    await createVerificationAttempt(store).read(evidence);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("does not misclassify a storage failure as corrupt bytes", async () => {
    const failure = new Error("storage unavailable");
    const attempt = createVerificationAttempt({ get: vi.fn().mockRejectedValue(failure) } as unknown as AssetStore);
    await expect(attempt.read({ uri: "image", sha256: "0".repeat(64), byteLength: 3 })).rejects.toBe(failure);
  });

  it("does not retain failed source verification or share it with another attempt", async () => {
    const attempt = createVerificationAttempt({} as AssetStore);
    const verify = vi.fn().mockRejectedValueOnce(new Error("stale")).mockResolvedValue(undefined);
    await expect(attempt.once("source", verify)).rejects.toThrow("stale");
    await attempt.once("source", verify);
    await attempt.once("source", verify);
    expect(verify).toHaveBeenCalledTimes(2);
    await createVerificationAttempt({} as AssetStore).once("source", verify);
    expect(verify).toHaveBeenCalledTimes(3);
  });
});
