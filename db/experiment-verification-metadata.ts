import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import { countVerificationQuery } from "@/lib/experiment-runner/diagnostics";
import type { VerificationAttempt } from "@/lib/experiment-runner/verification-attempt";
import type { ExperimentRunDocument } from "@/db/documents";
import { m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";

// Read-only evidence eligibility, never image admission or materialization.
// Balanced retains its own operation identities while its image policy is synthetic.
export function isBalancedImageVerificationRun(run: ExperimentRunDocument): boolean {
  if (run.mode !== "balanced" || !run.m4 || !["queued", "running", "paused", "completed"].includes(run.status)) return false;
  try {
    const snapshot = m4PolicySnapshot(JSON.parse(run.m4.policyJson));
    if (snapshot.hash !== run.m4.policyHash || snapshot.json !== run.m4.policyJson || snapshot.policy.imageProvider !== "simulated") return false;
    const expected = snapshot.policy.publications.filter((item) => item.persona === null || item.persona === run.persona)
      .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({
        role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration,
      }));
    const actual = savedConfigurationSchema.parse(JSON.parse(run.configurationJson));
    return actual.length === expected.length && expected.every((binding) => actual.some((item) =>
      item.role === binding.role && item.taskId === binding.taskId && item.appId === binding.appId &&
      item.publishedWorkflowId === binding.publishedWorkflowId && item.toolProviderId === binding.toolProviderId &&
      item.finalPageIllustration === binding.finalPageIllustration));
  } catch { return false; }
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
    const operations = await database.collections.experiment_operations.find({ runId }, options).toArray();
    countVerificationQuery();
    // createRun inserts a new booklet and rejects reuse by another run. Booklet
    // scope therefore retains this run's historical assets, not earlier runs.
    const assets = await database.collections.assets.find({ bookletId: run.bookletId }, options).toArray();
    return { run, artifacts, versions, approvals, edges, operations, assets };
  });
}
export type VerificationMetadata = Awaited<ReturnType<typeof verificationMetadata>>;
