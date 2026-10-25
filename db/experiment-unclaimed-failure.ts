import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import type { M4Authority } from "@/db/experiment-campaign";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";
import { m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import { m4PolicySnapshot, m4PreparationTokenPolicy } from "@/lib/experiment-runner/m4-policy";
import { m4OperationFingerprint } from "@/db/experiment-text-sources";

// remoteStatus is written by authenticated execution observation, never by a
// failure callback. No committed reservation means the controlled workflow was
// never admitted to provider work. This proof grants no continuation by itself.
export function m4UnclaimedFailureDigest(authority: M4Authority, run: ExperimentRunDocument,
  op: ExperimentOperationDocument): string | null {
  try {
    const snapshot = m4PolicySnapshot(authority.policy), prep = op.m4Preparation;
    if (prep) m4PreparationTokenPolicy(snapshot.policy, prep);
    if (run.mode !== "balanced" || run.generationCompletedAtMs != null && op.createdAtMs >= run.generationCompletedAtMs || op.runId !== run._id ||
        op.mode !== "balanced" || op.role !== "manager" || op.taskId !== null || op.providerKind !== "text" ||
        op.subjectKind !== "book" || op.subjectId !== run.bookletId || op.state !== "failed" ||
        op.safeFailure !== "definite_failure" || op.remoteStatus !== "failed" || op.reservationCount !== 0 ||
        !op.workflowRunId || op.dispatchStartedAtMs == null || !op.verifiedWorkflowId || !prep ||
        !op.lifecycle || op.lifecycle.stop || op.m4Reservation || op.m4Observation || op.authorizationClaim ||
        op.resultFinalizationClaim || op.imageCompletionClaim || op.resultJson !== null || op.resultDigest !== null ||
        op.materializationJson !== null || op.imageCompletionDigest != null ||
        run.m4?.campaignId !== authority.grant.campaignId || run.m4.policyHash !== snapshot.hash || run.m4.policyJson !== snapshot.json ||
        prep.policyHash !== snapshot.hash || prep.configurationHash !== run.configurationHash ||
        prep.operationFingerprint !== m4OperationFingerprint(op) || prep.requestDigest !== m4Hash(prep.requestJson) ||
        prep.parentWorkflowRunId !== op.parentWorkflowRunId || prep.publishedWorkflowId !== op.verifiedWorkflowId) return null;
    const expected = snapshot.policy.publications.find(p => p.role === "manager" && p.taskId === null && p.persona === null);
    const saved = savedConfigurationSchema.parse(JSON.parse(run.configurationJson)).filter(p => p.role === "manager" && p.taskId === null);
    if (!expected || saved.length !== 1 || saved[0].appId !== expected.appId ||
        saved[0].publishedWorkflowId !== expected.publishedWorkflowId || saved[0].toolProviderId !== expected.toolProviderId ||
        prep.publishedWorkflowId !== expected.publishedWorkflowId) return null;
    return m4Hash(m4CanonicalJson({ kind: "authenticated_unclaimed_failure_v1", runId: run._id, operationId: op._id,
      workflowRunId: op.workflowRunId, workflowTaskId: op.workflowTaskId ?? null, parentWorkflowRunId: op.parentWorkflowRunId,
      publishedWorkflowId: op.verifiedWorkflowId, remoteStatus: op.remoteStatus, dispatchStartedAtMs: op.dispatchStartedAtMs,
      policyHash: prep.policyHash, configurationHash: prep.configurationHash, definitionHash: prep.definitionHash,
      requestDigest: prep.requestDigest, sourceFingerprint: prep.sourceFingerprint, operationFingerprint: prep.operationFingerprint }));
  } catch { return null; }
}
