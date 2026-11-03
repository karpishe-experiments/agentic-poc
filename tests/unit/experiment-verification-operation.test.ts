import type { ClientSession } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import type { AssetStore } from "@/lib/assets/asset-store";
import { createVerificationAttempt } from "@/lib/experiment-runner/verification-attempt";
import { verificationOperationExists } from "@/db/experiment-verification-metadata";

describe("transaction-local recovery eligibility", () => {
  it("projects existence, caches exact predicates and misses, and rereads on a retry", async () => {
    const findOne = vi.fn().mockResolvedValueOnce({ _id: "tester" }).mockResolvedValue(null);
    const database = { collections: { experiment_operations: { findOne } } } as unknown as Database;
    const session = {} as ClientSession;
    const attempt = createVerificationAttempt({} as AssetStore);
    const filter = { _id: "tester", runId: "run", role: "tester" as const, state: "unknown" as const };
    expect(await verificationOperationExists(database, session, filter, attempt)).toBe(true);
    expect(await verificationOperationExists(database, session, filter, attempt)).toBe(true);
    expect(findOne).toHaveBeenCalledExactlyOnceWith(filter, { session, projection: { _id: 1 } });
    const other = { ...filter, role: "judge" as const };
    expect(await verificationOperationExists(database, session, other, attempt)).toBe(false);
    expect(await verificationOperationExists(database, session, other, attempt)).toBe(false);
    expect(findOne).toHaveBeenCalledTimes(2);
    expect(await verificationOperationExists(database, session, filter, createVerificationAttempt({} as AssetStore))).toBe(false);
    expect(findOne).toHaveBeenCalledTimes(3);
    await verificationOperationExists(database, session, filter);
    await verificationOperationExists(database, session, filter);
    expect(findOne).toHaveBeenCalledTimes(5);
  });

  it("does not cache failed reads", async () => {
    const findOne = vi.fn().mockRejectedValueOnce(new Error("read timeout")).mockResolvedValue({ _id: "tester" });
    const database = { collections: { experiment_operations: { findOne } } } as unknown as Database;
    const session = {} as ClientSession, attempt = createVerificationAttempt({} as AssetStore);
    await expect(verificationOperationExists(database, session, { _id: "tester" }, attempt)).rejects.toThrow("read timeout");
    expect(await verificationOperationExists(database, session, { _id: "tester" }, attempt)).toBe(true);
    expect(findOne).toHaveBeenCalledTimes(2);
  });
});
