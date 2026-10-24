import { describe, expect, it, vi } from "vitest";
import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentOperationDocument } from "@/db/documents";
import { createVerificationAttempt } from "@/lib/experiment-runner/verification-attempt";
import { recentDiagnostics } from "@/lib/experiment-runner/diagnostics";
import { isUnclaimedPauseFailure, readM4FailedOperations, readM4FailureCampaign, readM4FailureSourceVersion } from "@/db/experiment-m4-accounting-evidence";

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
    for (let i = 0; i < 51; i++) await readM4FailureCampaign(f.database, f.session, "campaign", "run", attempt);
    expect(f.proofRead).toHaveBeenCalledExactlyOnceWith({ runId: "run", _id: { $in: ids } },
      { session: f.session, projection: { imageRequestJson: 0, referenceUploadsJson: 0, referenceUploadJournalJson: 0, warningsJson: 0 } });
    expect(f.sourcesRead).toHaveBeenCalledExactlyOnceWith({ sourceOperationId: { $in: ids } },
      { session: f.session, projection: { _id: 1, sourceOperationId: 1 } });
    expect(f.sourceRead).not.toHaveBeenCalled(); expect(f.campaignRead).toHaveBeenCalledTimes(1);
  });
  it("loads new campaign, proofs and wrongly owned materialization for a fresh attempt", async () => {
    const f = fixture(), first = f.attempt();
    await readM4FailureCampaign(f.database, f.session, "campaign", "run", first);
    await readM4FailedOperations(f.database, f.session, "run", ["failed"], first);
    f.change();
    const second = f.attempt();
    expect(await readM4FailureCampaign(f.database, f.session, "campaign", "run", second)).toMatchObject({ revision: 2 });
    expect((await readM4FailedOperations(f.database, f.session, "run", ["failed"], second)).get("failed")).toMatchObject({ proof: "changed" });
    expect(await readM4FailureSourceVersion(f.database, f.session, "failed", second)).toMatchObject({ _id: "foreign-version" });
    expect(f.campaignRead).toHaveBeenCalledTimes(2); expect(f.sourcesRead).toHaveBeenCalledTimes(2);
  });
  it("records a failed proof read without disclosing its body or changing the thrown error", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const f = fixture();
    const error = Object.assign(new Error("private-proof-body"), { name: "MongoOperationTimeoutError" });
    f.proofRead.mockImplementationOnce(() => ({ toArray: async () => { throw error; } }));
    await expect(readM4FailedOperations(f.database, f.session, "run", ["failed"], f.attempt())).rejects.toBe(error);
    const event = recentDiagnostics("run", 1).events[0];
    expect(event).toMatchObject({ phase: "accounting_failed_proofs_read", outcome: "failed", queryCount: 1,
      failure: { errorKind: "MongoOperationTimeoutError", code: "completion_failed" } });
    expect(JSON.stringify(event)).not.toContain("private-proof-body");
    expect(f.sourcesRead).not.toHaveBeenCalled();
  });
  it("keeps uncached callers reading current evidence", async () => {
    const f = fixture();
    expect(await readM4FailureSourceVersion(f.database, f.session, "failed")).toBeNull();
    await readM4FailureCampaign(f.database, f.session, "campaign", "run"); f.change();
    expect(await readM4FailureSourceVersion(f.database, f.session, "failed")).toMatchObject({ _id: "foreign-version" });
    expect(await readM4FailureCampaign(f.database, f.session, "campaign", "run")).toMatchObject({ revision: 2 });
    expect(f.sourceRead).toHaveBeenCalledTimes(2); expect(f.campaignRead).toHaveBeenCalledTimes(2);
  });
  it("uses the exact unclaimed-Pause exclusion without accepting reservations, results or owners", () => {
    const pause = { mode: "balanced", state: "failed", safeFailure: null, reservationCount: 0,
      remoteStatus: "succeeded", workflowRunId: "workflow", verifiedWorkflowId: "publication" } as ExperimentOperationDocument;
    expect(isUnclaimedPauseFailure(pause)).toBe(true);
    for (const change of [
      { mode: "simulated" }, { state: "unknown" }, { safeFailure: "definite_failure" }, { reservationCount: 1 },
      { remoteStatus: "failed" }, { workflowRunId: null }, { verifiedWorkflowId: null },
      { m4Reservation: {} }, { m4Observation: {} }, { resultJson: "{}" }, { materializationJson: "{}" },
      { imageCompletionDigest: "digest" }, { authorizationClaim: {} }, { resultFinalizationClaim: {} }, { imageCompletionClaim: {} },
    ]) expect(isUnclaimedPauseFailure({ ...pause, ...change } as ExperimentOperationDocument)).toBe(false);
  });
  it("does not query any full proofs or source versions when no proof is required", async () => {
    const f = fixture();
    expect(await readM4FailedOperations(f.database, f.session, "run", [], f.attempt())).toEqual(new Map());
    expect(f.proofRead).not.toHaveBeenCalled(); expect(f.sourcesRead).not.toHaveBeenCalled();
  });
});
