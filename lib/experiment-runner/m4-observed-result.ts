import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { assessM4ProviderResult, m4RetainedProviderWrapper } from "@/lib/experiment-runner/m4-provider-result";
import { m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { executionPolicySnapshot } from "@/lib/experiment-runner/execution-policy";
import { m4Hash, type M4RequestSelector } from "@/lib/experiment-runner/m4-request";
import { parseM4CreativeOutput } from "@/lib/experiment-runner/m4-output";
import { assessRealReportProviderResult } from "@/lib/experiment-runner/real-report-provider-result";

// Completion consumes retained authenticated observation, never a callback's
// proposed content or usage. No mutable source/approval check is skipped here.
export function m4ObservedRoleResult(run: ExperimentRunDocument, operation: ExperimentOperationDocument) {
  const observation = operation.m4Observation; const preparation = operation.m4Preparation;
  const reservation = operation.m4Reservation;
  if ((!run.m4 && !run.execution) || !["balanced", "real"].includes(run.mode) || operation.mode !== run.mode || operation.providerKind !== "text" ||
      !observation || observation.issue || observation.remoteStatus !== "succeeded" || observation.content === null ||
      !observation.evidenceJson || !preparation || !reservation ||
      observation.workflowRunId !== operation.workflowRunId || observation.publishedWorkflowId !== operation.verifiedWorkflowId ||
      observation.publishedWorkflowId !== preparation.publishedWorkflowId || preparation.configurationHash !== run.configurationHash ||
      preparation.requestDigest !== m4Hash(preparation.requestJson) || preparation.parentWorkflowRunId !== operation.parentWorkflowRunId) {
    throw new Error("Balanced completion has no verified original provider result.");
  }
  const snapshot = run.execution ? executionPolicySnapshot(JSON.parse(run.execution.profileJson)) :
    m4PolicySnapshot(JSON.parse(run.m4!.policyJson));
  const owner = run.execution ? { campaignId: run.execution.campaignId, hash: run.execution.profileHash,
    json: run.execution.profileJson } : { campaignId: run.m4!.campaignId, hash: run.m4!.policyHash, json: run.m4!.policyJson };
  if (snapshot.hash !== owner.hash || snapshot.json !== owner.json || reservation.campaignId !== owner.campaignId ||
      reservation.policyHash !== snapshot.hash || preparation.policyHash !== snapshot.hash ||
      observation.evidenceDigest !== m4Hash(observation.evidenceJson) || reservation.evidenceDigest !== observation.evidenceDigest) {
    throw new Error("Balanced completion accounting identity differs.");
  }
  const realReport = run.mode === "real" && operation.realReportPreparation;
  const assessed = realReport ? assessRealReportProviderResult({ schemaVersion: "booklet_provider_v3",
    content: observation.content, providerEvidence: JSON.parse(observation.evidenceJson) as unknown },
  snapshot.policy as import("@/lib/experiment-runner/execution-policy").ExecutionPolicy, operation) :
    assessM4ProviderResult(m4RetainedProviderWrapper(observation.content,
      JSON.parse(observation.evidenceJson) as unknown), snapshot.policy, operation);
  if (!assessed.canMaterialize || assessed.chargeUpperMicrodollars !== reservation.settledMicrodollars ||
      reservation.unsettledMicrodollars !== (snapshot.policy.countChargeStatus === "assumed" ? snapshot.policy.countChargeCeilingMicrodollars : 0)) {
    throw new Error("Balanced completion has unresolved or invalid provider usage.");
  }
  const selector = { role: operation.role, taskId: operation.taskId, persona: run.persona,
    report: (operation.role === "tester" || operation.role === "judge") && run.generationCompletedAtMs != null } as M4RequestSelector;
  return parseM4CreativeOutput(selector, observation.content, preparation.contextJson, observation.costEvidence,
    !!run.execution, "inspectedAssetIds" in assessed && Array.isArray(assessed.inspectedAssetIds)
      ? assessed.inspectedAssetIds as string[] : []);
}
