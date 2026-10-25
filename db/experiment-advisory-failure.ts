import type { VerificationAttempt } from "@/lib/experiment-runner/verification-attempt";
import { readM4FailureCampaign } from "@/db/experiment-m4-accounting-evidence";
import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { hasM4KnownFailure } from "@/db/experiment-provider-failure";
import { m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";
import { m4CanonicalJson, m4SavedReportDefinition } from "@/lib/experiment-runner/m4-request";
import { m4OperationFingerprint, m4SourceFingerprint } from "@/db/experiment-text-sources";

// A report failure is advisory only after its owning execution has ended.
// This predicate grants neither another request nor release of reserved money.
export async function isVerifiedAdvisoryFailure(database: Database, session: ClientSession,
  run: ExperimentRunDocument, op: ExperimentOperationDocument, nowMs: number, attempt?: VerificationAttempt): Promise<boolean> {
  if (run.generationCompletedAtMs == null || !run.generationVersionIds?.length ||
      !["tester", "judge"].includes(op.role) || op.taskId !== null || op.subjectKind !== "book" ||
      op.subjectId !== run.bookletId || op.runId !== run._id || op.mode !== run.mode || op.providerKind !== "text" ||
      op.createdAtMs < run.generationCompletedAtMs || op.state !== "failed" || op.safeFailure !== "definite_failure" ||
      op.lifecycle?.phase !== "finished" || op.lifecycle.unresolved !== false || op.lifecycle.stop ||
      op.authorizationClaim || op.resultFinalizationClaim || op.imageCompletionClaim ||
      op.resultJson || op.resultDigest || op.materializationJson) return false;
  if (op.localReportFailure) {
    const proof = op.localReportFailure;
    const definition = m4SavedReportDefinition({ role: op.role as "tester" | "judge", taskId: null, persona: run.persona, report: true }, proof.definitionHash);
    if (!definition) return false;
    return run.mode === "balanced" && !!run.m4 && op.reservationCount === 0 && !op.m4Reservation && !op.m4Preparation && !op.m4Observation &&
      !op.workflowRunId && !op.parentWorkflowRunId && !op.verifiedWorkflowId && !op.workflowTaskId && !op.remoteStatus && op.dispatchStartedAtMs == null &&
      proof.code === "report_request_too_large" && Number.isSafeInteger(proof.requestBytes) && proof.requestBytes > proof.byteLimit &&
      (proof.scope === "context" && proof.byteLimit === 2 * 1024 * 1024 || proof.scope === "request" && proof.byteLimit === definition.preparationByteLimit) &&
      proof.definitionHash === definition.hash && /^[a-f0-9]{64}$/.test(proof.requestDigest) &&
      proof.policyHash === run.m4.policyHash && proof.configurationHash === run.configurationHash &&
      proof.generationCompletedAtMs === run.generationCompletedAtMs &&
      m4CanonicalJson(proof.generationVersionIds) === m4CanonicalJson(run.generationVersionIds) &&
      Number.isSafeInteger(proof.recordedAtMs) && proof.recordedAtMs >= op.createdAtMs && proof.recordedAtMs <= nowMs &&
      op.lifecycle.endedAtMs != null && proof.recordedAtMs <= op.lifecycle.endedAtMs &&
      proof.operationFingerprint === m4OperationFingerprint(op) && proof.sourceFingerprint === await m4SourceFingerprint(database, session, run);
  }
  if (op.reservationCount !== 1 || !op.workflowRunId || op.dispatchStartedAtMs == null) return false;
  const binding = savedConfigurationSchema.parse(JSON.parse(run.configurationJson))
    .find(item => item.role === op.role && item.taskId === null);
  if (!binding || op.verifiedWorkflowId !== binding.publishedWorkflowId) return false;
  if (run.mode === "simulated") return op.remoteStatus === "failed";
  if (run.mode !== "balanced" || !run.m4) return false;
  const campaign = await readM4FailureCampaign(database, session, run.m4.campaignId, run._id, attempt);
  if (!campaign) return false;
  return hasM4KnownFailure(database, session, { policy: m4PolicySnapshot(JSON.parse(run.m4.policyJson)).policy,
    grant: { campaignId: campaign._id, reference: campaign.grantReference } }, run, op, nowMs, attempt);
}
