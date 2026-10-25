import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import { withMongoTransaction } from "@/db/client";
import type { M4Authority } from "@/db/experiment-campaign";
import { m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { observeMongoRead } from "@/db/mongo-read-diagnostics";
import type { PreparationReadPart, PreparationReadDiagnostic, PreparationReadComparison } from "@/lib/contracts/experiment-preparation-diagnostics";
import { retainPreparationRead } from "@/lib/experiment-runner/diagnostics";

const FAILURE_ID = "928cb32d-daf7-4703-b005-fdaf076d6cb6";
const RUN_ID = "47894c71-7991-4b15-8dc2-810395ec3f01";
const CAMPAIGN_ID = "690b0237-9c0d-4eb2-99ec-edf02356b70a";

function measured(rows: readonly unknown[], elapsedMs: number): PreparationReadComparison {
  return { rows: rows.length, returnedJsonBytes: Buffer.byteLength(JSON.stringify(rows), "utf8"), elapsedMs: Math.round(elapsedMs) };
}

// Compare the fields consumed by preparation, without retaining any field value.
function sameProjection(original: readonly Record<string, unknown>[], projected: readonly Record<string, unknown>[], fields: readonly string[]) {
  return original.length === projected.length && original.every((row, index) =>
    fields.every(field => row[field] === projected[index]?.[field]));
}

export async function diagnosePreparationRead(database: Database, authority: M4Authority, part: PreparationReadPart): Promise<PreparationReadDiagnostic> {
  const started = performance.now();
  const snapshot = m4PolicySnapshot(authority.policy);
  if (authority.grant.campaignId !== CAMPAIGN_ID) throw new Error("Diagnostic grant is unavailable.");
  const observed = await observeMongoRead(() => withMongoTransaction(database, async (session: ClientSession) => {
    const campaign = await database.collections.experiment_campaigns.findOne({ _id: CAMPAIGN_ID }, { session });
    if (!campaign || campaign.state !== "stopped" || campaign.slots.professional_creator !== RUN_ID ||
        campaign.policyHash !== snapshot.hash || campaign.policyJson !== snapshot.json ||
        campaign.grantReference !== authority.grant.reference) throw new Error("Diagnostic campaign is unavailable.");
    const run = await database.collections.experiment_runs.findOne({ _id: RUN_ID }, { session });
    if (!run || run.persona !== "professional_creator" || run.mode !== "balanced" || run.m4?.campaignId !== CAMPAIGN_ID ||
        run.m4.policyHash !== snapshot.hash || run.m4.policyJson !== snapshot.json || run.generationCompletedAtMs != null ||
        run.activeOperationId !== null || run.preparation || run.pauseRequested || run.pendingDecisionJson ||
        run.activeDelegationId || run.status !== "blocked") throw new Error("Diagnostic run is unavailable.");
    const failure = await database.collections.experiment_operations.findOne({ _id: FAILURE_ID, runId: RUN_ID }, { session });
    if (!failure || failure.state !== "failed" || failure.role !== "specialist" || failure.taskId !== "J12" ||
        failure.subjectKind !== "page" || failure.providerKind !== "text" || failure.reservationCount !== 0 ||
        failure.workflowRunId || failure.m4Reservation || failure.lifecycle?.phase !== "finished" ||
        failure.lifecycle.unresolved ||
        failure.authorizationClaim || failure.resultFinalizationClaim || failure.imageCompletionClaim ||
        failure.subjectId.length === 0) throw new Error("Diagnostic failure is unavailable.");
    if (await database.collections.deployment_control.findOne({ "mutationOwners.runId": RUN_ID }, { session, projection: { _id: 1 } }))
      throw new Error("Diagnostic mutation owner is present.");
    if (await database.collections.experiment_operations.findOne({ runId: RUN_ID, $or: [
      { state: { $nin: ["succeeded", "failed"] } }, { "lifecycle.unresolved": true },
      { authorizationClaim: { $ne: null } }, { resultFinalizationClaim: { $ne: null } },
      { imageCompletionClaim: { $ne: null } },
    ] }, { session, projection: { _id: 1 } })) throw new Error("Diagnostic operation ownership is present.");
    const reads: PreparationReadDiagnostic["reads"] = {};
    if (part === "questions") {
      const filter = { runId: RUN_ID, state: "succeeded" as const, $or: [{ taskId: null }, { taskId: "J12" as const, subjectId: failure.subjectId }] };
      const sort = { createdAtMs: 1 as const, _id: 1 as const };
      const startOriginal = performance.now();
      const original = await database.collections.experiment_operations.find(filter, { session }).sort(sort).toArray();
      const originalMs = performance.now() - startOriginal;
      const startProjected = performance.now();
      const projected = await database.collections.experiment_operations.find(filter,
        { session, projection: { _id: 1, taskId: 1, resultJson: 1 } }).sort(sort).toArray();
      reads.operations = { original: measured(original, originalMs), projected: measured(projected, performance.now() - startProjected),
        equivalent: sameProjection(original, projected, ["_id", "taskId", "resultJson"]) };
      const messageFilter = { experimentRunId: RUN_ID, role: "user" };
      const startMessages = performance.now();
      const originalMessages = await database.collections.messages.find(messageFilter, { session }).sort({ sequence: 1 }).toArray();
      const originalMessagesMs = performance.now() - startMessages;
      const startProjectedMessages = performance.now();
      const projectedMessages = await database.collections.messages.find(messageFilter,
        { session, projection: { _id: 0, uiMessageJson: 1 } }).sort({ sequence: 1 }).toArray();
      reads.messages = { original: measured(originalMessages, originalMessagesMs),
        projected: measured(projectedMessages, performance.now() - startProjectedMessages),
        equivalent: sameProjection(originalMessages, projectedMessages, ["uiMessageJson"]) };
    } else {
      const filter = { runId: RUN_ID, role: "manager" as const, state: "succeeded" as const };
      const sort = { createdAtMs: -1 as const, _id: -1 as const };
      const startOriginal = performance.now();
      const original = await database.collections.experiment_operations.find(filter, { session }).sort(sort).limit(1).toArray();
      const originalMs = performance.now() - startOriginal;
      const startProjected = performance.now();
      const projected = await database.collections.experiment_operations.find(filter, { session,
        projection: { _id: 1, workflowRunId: 1, mode: 1, reservationCount: 1, verifiedWorkflowId: 1, resultJson: 1 } })
        .sort(sort).limit(1).toArray();
      reads.manager = { original: measured(original, originalMs), projected: measured(projected, performance.now() - startProjected),
        equivalent: sameProjection(original, projected,
          ["_id", "workflowRunId", "mode", "reservationCount", "verifiedWorkflowId", "resultJson"]) };
    }
    return { runRevision: run.revision, reads };
  }));
  const result: PreparationReadDiagnostic = { runId: RUN_ID, campaignId: CAMPAIGN_ID, failureOperationId: FAILURE_ID, part,
    runRevision: observed.value?.runRevision ?? null, reads: observed.value?.reads ?? {},
    ...(observed.failure ? { failure: observed.failure } : {}),
    metrics: observed.metrics, metricsStatus: observed.metrics.commands.length ? "observed" : "unavailable",
    elapsedMs: observed.elapsedMs, totalElapsedMs: Math.round(performance.now() - started) };
  retainPreparationRead(result);
  return result;
}
