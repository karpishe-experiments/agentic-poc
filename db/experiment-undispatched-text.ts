import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import type { M4Authority } from "@/db/experiment-campaign";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";
import { m4PolicySnapshot, m4PreparationTokenPolicy } from "@/lib/experiment-runner/m4-policy";
import { m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import { m4OperationFingerprint } from "@/db/experiment-text-sources";

// beginDispatch commits its marker before the only external start. Absence of
// that marker is useful only with the remaining identity, ownership and output
// checks. This proof never grants a retry or consumes a continuation grant.
export function undispatchedTextDigest(authority: M4Authority, run: ExperimentRunDocument,
  op: ExperimentOperationDocument): string | null {
  try {
    const snapshot = m4PolicySnapshot(authority.policy);
    if (run.mode !== "balanced" || op.runId !== run._id || op.mode !== "balanced" || op.providerKind !== "text" ||
        !["manager", "specialist", "tester", "judge"].includes(op.role) ||
        !["prepared", "failed"].includes(op.state) || op.reservationCount !== 0 ||
        op.dispatchStartedAtMs != null || op.workflowRunId != null || op.workflowTaskId != null ||
        op.parentWorkflowRunId != null || op.verifiedWorkflowId != null || op.remoteStatus != null ||
        op.m4Reservation || op.m4Observation || op.m4PreGenerationRecovery || op.m4CompletionRecovery || op.localReportFailure ||
        op.authorizationClaim || op.resultFinalizationClaim || op.imageCompletionClaim ||
        op.resultJson !== null || op.resultDigest !== null || op.materializationJson !== null ||
        op.imageCompletionDigest != null || op.imageRequestJson != null || op.referenceUploadsJson != null ||
        op.referenceUploadJournalJson != null || !op.lifecycle || op.lifecycle.stop || op.lifecycle.unresolved === true ||
        (op.state === "prepared" ? op.lifecycle.phase !== "preparing" || op.safeFailure !== null :
          op.lifecycle.phase !== "finished" || op.lifecycle.unresolved !== false ||
          op.lifecycle.attemptOutcome !== "failed" || ![null, "definite_failure"].includes(op.safeFailure)) ||
        run.m4?.campaignId !== authority.grant.campaignId || run.m4.policyHash !== snapshot.hash || run.m4.policyJson !== snapshot.json) return null;
    const expected = snapshot.policy.publications.filter(p => p.role === op.role && p.taskId === op.taskId &&
      p.persona === (op.role === "tester" ? run.persona : null));
    const saved = savedConfigurationSchema.parse(JSON.parse(run.configurationJson)).filter(p => p.role === op.role && p.taskId === op.taskId);
    if (expected.length !== 1 || saved.length !== 1 || saved[0].appId !== expected[0].appId ||
        saved[0].publishedWorkflowId !== expected[0].publishedWorkflowId || saved[0].toolProviderId !== expected[0].toolProviderId) return null;
    const prep = op.m4Preparation;
    if (prep) {
      m4PreparationTokenPolicy(snapshot.policy, prep);
      const request = JSON.parse(prep.requestJson) as { input?: { role: string; content: string }[] };
      const users = Array.isArray(request.input) ? request.input.filter(p => p.role === "user") : [];
      if (prep.policyHash !== snapshot.hash || prep.configurationHash !== run.configurationHash ||
          prep.operationFingerprint !== m4OperationFingerprint(op) || prep.requestDigest !== m4Hash(prep.requestJson) ||
          (prep.parentWorkflowRunId !== null && typeof prep.parentWorkflowRunId !== "string") || prep.publishedWorkflowId !== expected[0].publishedWorkflowId ||
          users.length !== 1 || typeof users[0].content !== "string" || users[0].content !== prep.contextJson) return null;
    }
    return m4Hash(m4CanonicalJson({ kind: "undispatched_text_v1", runId: run._id, operationId: op._id,
      policyHash: snapshot.hash, configurationHash: run.configurationHash,
      operationFingerprint: m4OperationFingerprint(op), preparation: prep ?? null }));
  } catch { return null; }
}

export async function verifyUndispatchedText(database: Database, session: ClientSession, authority: M4Authority,
  run: ExperimentRunDocument, operationId: string): Promise<string | null> {
  // Always read the original: accounting's general projection omits upload fields.
  const op = await database.collections.experiment_operations.findOne({ _id: operationId, runId: run._id }, { session });
  const digest = op ? undispatchedTextDigest(authority, run, op) : null;
  if (op?.m4Preparation?.parentWorkflowRunId) {
    const parent = await database.collections.experiment_operations.findOne({ runId: run._id, role: "manager", state: "succeeded",
      workflowRunId: op.m4Preparation.parentWorkflowRunId }, { session });
    if (!parent || parent.lifecycle?.unresolved || parent.authorizationClaim || parent.resultFinalizationClaim || parent.imageCompletionClaim) return null;
  }
  if (!digest || await database.collections.artifact_versions.findOne({ sourceOperationId: operationId }, { session, projection: { _id: 1 } }) ||
      await database.collections.messages.findOne({ operationId }, { session, projection: { _id: 1 } }) ||
      await database.collections.assets.findOne({ _id: operationId }, { session, projection: { _id: 1 } })) return null;
  return digest;
}
