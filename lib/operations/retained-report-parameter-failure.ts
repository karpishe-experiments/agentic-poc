import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { createExecutionAllowanceLedger } from "@/db/experiment-execution-allowance";
import { m4OperationFingerprint } from "@/db/experiment-text-sources";
import { executionMaximumTextCharge, executionOperationTokenPolicy, executionPolicySnapshot } from "@/lib/experiment-runner/execution-policy";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";
import { m4AuthorizedCarrier, m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import { realReportCarrierSchema } from "@/lib/experiment-runner/real-report-carrier";
import { RECONCILIATION_RESERVE_MS } from "@/lib/operations/budget";

// Read-only Console inspection of this immutable publication and original trace
// found seven successful predecessor nodes and this one failed LLM node. Its
// retries are disabled. The pinned dev6 guard precedes SDK/client/count/create.
// This attestation is authority for one closure, never a generic error matcher.
export const retainedReportParameterFailure = Object.freeze({
  runId: "b9151945-114d-4be2-809e-18117ed08c62",
  operationId: "4a0e144c-39d5-46e3-b8cf-99927b22d5b9",
  profileHash: "f87eb3a370fcd9429846c3dcc3df4bac3f56d44c88ae7294ba7a426bd4187ce1",
  appId: "bf57a8ea-1be6-4a97-a5c0-023cfde794f8",
  publishedWorkflowId: "bb863399-9547-4c2f-8ae2-a07f7ae78f7c",
  workflowRunId: "be2bb281-0ff0-4d36-a3f6-59b52217aec6",
  pluginIdentity: "langgenius/openai:1.0.7-dev6@0247e3661bcd4102d65f3ed5c4d9d5771873ec807f66806dfff690ceac74c70a",
  packageSha256: "8d88f8e73a1f7c7807861d594d0fd46e156ff6d7acbc7ca3591b08532604a766",
  failedNode: "real_report_llm", totalTokens: 0, totalSteps: 8,
  error: "Booklet Real report model parameters differ.",
  missingParameters: ["response_format", "json_schema"], retries: 0,
});

/** Local preservation/identity proof; a fresh authenticated GET is also required. */
export async function hasRetainedReportParameterFailure(database: Database, session: ClientSession,
  run: ExperimentRunDocument, op: ExperimentOperationDocument): Promise<boolean> {
  const target = retainedReportParameterFailure, prep = op.m4Preparation, hold = op.m4Reservation, observed = op.m4Observation;
  if (run._id !== target.runId || op._id !== target.operationId || op.runId !== run._id ||
      run.execution?.profileHash !== target.profileHash || run.mode !== "real" || op.mode !== "real" ||
      run.persona !== "playful_kid" || run.generationCompletedAtMs == null || run.preparation ||
      op.role !== "tester" || op.taskId !== null || op.providerKind !== "text" ||
      !["started", "unknown", "failed"].includes(op.state) || op.attempt !== 1 || op.reservationCount !== 1 ||
      op.workflowRunId !== target.workflowRunId || op.verifiedWorkflowId !== target.publishedWorkflowId ||
      !op.lifecycle || !op.deadlineAtMs || op.dispatchStartedAtMs == null ||
      !prep || !hold || !op.realReportPreparation || !observed || observed.issue !== "missing_wrapper" ||
      observed.workflowRunId !== target.workflowRunId || observed.publishedWorkflowId !== target.publishedWorkflowId ||
      observed.remoteStatus !== "failed" || observed.wrapperDigest !== null || observed.content !== null ||
      observed.evidenceJson !== null || observed.evidenceDigest !== null ||
      op.resultJson !== null || op.resultDigest !== null || op.materializationJson !== null || op.imageCompletionDigest != null ||
      op.authorizationClaim || op.resultFinalizationClaim || op.imageCompletionClaim) return false;
  try {
    const campaign = await createExecutionAllowanceLedger(database).current(session, run.execution.campaignId, run);
    const profile = executionPolicySnapshot(JSON.parse(run.execution.profileJson));
    const saved = savedConfigurationSchema.parse(JSON.parse(run.configurationJson)).find(row => row.role === "tester" && row.taskId === null);
    const publication = profile.policy.publications.find(row => row.role === "tester" && row.persona === run.persona);
    const report = op.realReportPreparation, carrier = realReportCarrierSchema.parse(JSON.parse(report.carrierJson));
    if (profile.hash !== target.profileHash || profile.json !== campaign.profileJson ||
        profile.policy.pluginIdentity !== target.pluginIdentity || profile.policy.realReport?.packageSha256 !== target.packageSha256 ||
        !saved || !publication || saved.appId !== target.appId || publication.appId !== target.appId ||
        saved.publishedWorkflowId !== target.publishedWorkflowId || publication.publishedWorkflowId !== target.publishedWorkflowId ||
        prep.policyHash !== profile.hash || prep.configurationHash !== run.configurationHash ||
        prep.operationFingerprint !== m4OperationFingerprint(op) || prep.parentWorkflowRunId !== op.parentWorkflowRunId ||
        prep.publishedWorkflowId !== target.publishedWorkflowId || prep.requestDigest !== m4Hash(prep.requestJson) ||
        hold.policyHash !== profile.hash || hold.campaignId !== campaign._id || hold.requestDigest !== prep.requestDigest ||
        hold.bucket !== "testerReport" || hold.maximumMicrodollars !== executionMaximumTextCharge(profile.policy, "testerReport", "tester") ||
        hold.unsettledMicrodollars !== hold.maximumMicrodollars || hold.settledMicrodollars !== null || hold.evidenceDigest !== null ||
        report.carrierJson !== m4CanonicalJson(carrier) ||
        carrier.textRequestJson !== m4AuthorizedCarrier(prep.requestJson, profile.policy.tokenPolicy).requestJson ||
        carrier.textRequestDigest !== m4Hash(carrier.textRequestJson) || report.textRequestDigest !== carrier.textRequestDigest ||
        carrier.deadlineAtMs !== op.deadlineAtMs - RECONCILIATION_RESERVE_MS || report.finalRequestDigest !== carrier.finalRequestDigest ||
        report.manifestDigest !== carrier.manifestDigest || carrier.manifestDigest !== m4Hash(m4CanonicalJson(carrier.orderedImages)) ||
        m4CanonicalJson(report.orderedImages) !== m4CanonicalJson(carrier.orderedImages) ||
        carrier.orderedImages.length !== 4 || report.uploadFileIds.length !== 4 || new Set(report.uploadFileIds).size !== 4) return false;
    executionOperationTokenPolicy(profile.policy, op);
    // Any second report execution would invalidate the observed single attempt.
    if (await database.collections.experiment_operations.findOne({ runId: run._id, _id: { $ne: op._id },
      role: { $in: ["tester", "judge"] }, realReportPreparation: { $exists: true } }, { session, projection: { _id: 1 } }) ||
        await database.collections.artifact_versions.findOne({ sourceOperationId: op._id }, { session, projection: { _id: 1 } }) ||
        await database.collections.messages.findOne({ operationId: op._id }, { session, projection: { _id: 1 } }) ||
        await database.collections.assets.findOne({ _id: op._id }, { session, projection: { _id: 1 } })) return false;
    return true;
  } catch { return false; }
}
