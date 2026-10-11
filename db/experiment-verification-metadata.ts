import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import { countVerificationQuery } from "@/lib/experiment-runner/diagnostics";
import type { VerificationAttempt } from "@/lib/experiment-runner/verification-attempt";

// Read-only transport of evidence, not a validity flag. Consumers must still
// check exact ownership, current versions, approvals, lineage and original bytes.
// The caller creates its attempt inside the transaction callback, including on
// retries. Never pass this snapshot into a later transaction or mutation phase.
export async function verificationMetadata(database: Database, session: ClientSession,
  runId: string, attempt: VerificationAttempt) {
  return attempt.metadata(`run-metadata:${runId}`, async () => {
    const options = { session };
    countVerificationQuery();
    const run = await database.collections.experiment_runs.findOne({ _id: runId }, options);
    if (!run) throw new Error("Verification run was not found.");
    countVerificationQuery();
    const artifacts = await database.collections.artifacts.find({ experimentRunId: runId, bookletId: run.bookletId }, options).toArray();
    // Include retained drafts/revisions for lineage checks, never another run.
    countVerificationQuery();
    const versions = await database.collections.artifact_versions.find({ artifactId: { $in: artifacts.map((item) => item._id) } }, options).toArray();
    countVerificationQuery();
    const approvals = await database.collections.approvals.find({ experimentRunId: runId, bookletId: run.bookletId,
      action: "approve", scope: "artifact" }, options).toArray();
    countVerificationQuery();
    const edges = await database.collections.artifact_dependencies.find({ downstreamVersionId: { $in: versions.map((item) => item._id) } }, options).toArray();
    countVerificationQuery();
    const operations = await database.collections.experiment_operations.find({ runId }, options).toArray();
    countVerificationQuery();
    // createRun inserts a new booklet and rejects reuse by another run. Booklet
    // scope therefore retains this run's historical assets, not earlier runs.
    const assets = await database.collections.assets.find({ bookletId: run.bookletId }, options).toArray();
    return { run, artifacts, versions, approvals, edges, operations, assets };
  });
}
export type VerificationMetadata = Awaited<ReturnType<typeof verificationMetadata>>;
