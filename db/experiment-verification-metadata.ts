import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import { countVerificationQuery } from "@/lib/experiment-runner/diagnostics";
import type { VerificationAttempt } from "@/lib/experiment-runner/verification-attempt";
import type { ExperimentRunDocument } from "@/db/documents";
import { hasExperimentImagePolicy } from "@/db/experiment-m4-state";

// Read-only evidence eligibility, never image admission or materialization.
// Balanced retains its own operation identities while its image policy is synthetic.
export function isBalancedImageVerificationRun(run: ExperimentRunDocument): boolean {
  return ["queued", "running", "paused", "completed"].includes(run.status) && hasExperimentImagePolicy(run);
}

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
    // Image lineage also verifies the selected J13 manager parent. Retain their
    // evidence fields, without unrelated text preparations/provider bodies.
    const operations = await database.collections.experiment_operations.find({ runId, role: { $in: ["image", "manager"] } }, { session, projection: {
      _id: 1, runId: 1, role: 1, providerKind: 1, taskId: 1, subjectKind: 1, subjectId: 1, mode: 1, executionAmendmentId: 1,
      state: 1, reservationCount: 1, workflowRunId: 1, verifiedWorkflowId: 1, imageCompletionClaim: 1,
      imageRequestJson: 1, dependencyVersionIds: 1, inputFingerprint: 1, attempt: 1,
      parentWorkflowRunId: 1, resultDigest: 1, imageCompletionDigest: 1, resultJson: 1, materializationJson: 1,
      referenceUploadsJson: 1, expectedTargetVersionId: 1,
    } }).toArray();
    countVerificationQuery();
    // createRun inserts a new booklet and rejects reuse by another run. Booklet
    // scope therefore retains this run's historical assets, not earlier runs.
    const assets = await database.collections.assets.find({ bookletId: run.bookletId }, options).toArray();
    return { run, artifacts, versions, approvals, edges, operations, assets };
  });
}
export type VerificationMetadata = Awaited<ReturnType<typeof verificationMetadata>>;
