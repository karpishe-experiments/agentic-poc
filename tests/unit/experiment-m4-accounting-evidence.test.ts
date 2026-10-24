import { describe, expect, it, vi } from "vitest";
import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import { createVerificationAttempt } from "@/lib/experiment-runner/verification-attempt";
import { readM4FailedOperations, readM4FailureCampaign, readM4FailureSourceVersion } from "@/db/experiment-m4-accounting-evidence";

function fixture() {
  let campaign = { _id: "campaign", revision: 1 };
  let proofs = [{ _id: "failed", runId: "run", state: "failed", proof: "original" }];
  let sources: { _id: string; sourceOperationId: string; artifactId?: string }[] = [];
  const campaignRead = vi.fn(async () => structuredClone(campaign));
  const proofRead = vi.fn(() => ({ toArray: async () => structuredClone(proofs) }));
  const sourcesRead = vi.fn(() => ({ toArray: async () => structuredClone(sources) }));
  const sourceRead = vi.fn(async () => sources[0] ?? null);
  const database = { collections: { experiment_campaigns: { findOne: campaignRead },
    experiment_operations: { find: proofRead }, artifact_versions: { find: sourcesRead, findOne: sourceRead } } } as unknown as Database;
  const session = {} as ClientSession;
  const attempt = () => createVerificationAttempt({ get: vi.fn(), put: vi.fn(), exists: vi.fn() });
  return { database, session, attempt, campaignRead, proofRead, sourcesRead, sourceRead,
    change: () => { campaign = { ...campaign, revision: 2 }; proofs = [{ ...proofs[0], proof: "changed" }];
      sources = [{ _id: "foreign-version", sourceOperationId: "failed", artifactId: "another-run-artifact" }]; } };
}

describe("transaction-local M4 accounting evidence", () => {
  it("batches full failed proofs and global source evidence with fixed query counts", async () => {
    const f = fixture(), attempt = f.attempt();
    const ids = ["failed", ...Array.from({ length: 50 }, (_, i) => `missing-${i}`)];
    const proofs = await readM4FailedOperations(f.database, f.session, "run", ids, attempt);
    expect(proofs.get("failed")).toMatchObject({ proof: "original" });
    expect(proofs.has("missing-0")).toBe(false);
    for (const id of ids) expect(await readM4FailureSourceVersion(f.database, f.session, id, attempt)).toBeNull();
    for (let i = 0; i < 51; i++) await readM4FailureCampaign(f.database, f.session, "campaign", attempt);
    expect(f.proofRead).toHaveBeenCalledExactlyOnceWith({ runId: "run", _id: { $in: ids } }, { session: f.session });
    expect(f.sourcesRead).toHaveBeenCalledExactlyOnceWith({ sourceOperationId: { $in: ids } },
      { session: f.session, projection: { _id: 1, sourceOperationId: 1 } });
    expect(f.sourceRead).not.toHaveBeenCalled(); expect(f.campaignRead).toHaveBeenCalledTimes(1);
  });
  it("loads new campaign, proofs and wrongly owned materialization for a fresh attempt", async () => {
    const f = fixture(), first = f.attempt();
    await readM4FailureCampaign(f.database, f.session, "campaign", first);
    await readM4FailedOperations(f.database, f.session, "run", ["failed"], first);
    f.change();
    const second = f.attempt();
    expect(await readM4FailureCampaign(f.database, f.session, "campaign", second)).toMatchObject({ revision: 2 });
    expect((await readM4FailedOperations(f.database, f.session, "run", ["failed"], second)).get("failed")).toMatchObject({ proof: "changed" });
    expect(await readM4FailureSourceVersion(f.database, f.session, "failed", second)).toMatchObject({ _id: "foreign-version" });
    expect(f.campaignRead).toHaveBeenCalledTimes(2); expect(f.sourcesRead).toHaveBeenCalledTimes(2);
  });
  it("keeps uncached callers reading current evidence", async () => {
    const f = fixture();
    expect(await readM4FailureSourceVersion(f.database, f.session, "failed")).toBeNull();
    await readM4FailureCampaign(f.database, f.session, "campaign"); f.change();
    expect(await readM4FailureSourceVersion(f.database, f.session, "failed")).toMatchObject({ _id: "foreign-version" });
    expect(await readM4FailureCampaign(f.database, f.session, "campaign")).toMatchObject({ revision: 2 });
    expect(f.sourceRead).toHaveBeenCalledTimes(2); expect(f.campaignRead).toHaveBeenCalledTimes(2);
  });
});
