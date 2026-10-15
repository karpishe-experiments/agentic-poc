import { z } from "zod";
import { withMongoTransaction, type Database } from "@/db/client";
import { createExperimentCampaignLedger, type M4Authority } from "@/db/experiment-campaign";
import { failTerminalPageBatchItems } from "@/db/experiment-page-batch-failure";
import { m4OperationFingerprint } from "@/db/experiment-text-sources";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";
import { assessM4ProviderResult } from "@/lib/experiment-runner/m4-provider-result";
import { parseM4CreativeOutput } from "@/lib/experiment-runner/m4-output";
import { m4Hash, type M4RequestSelector } from "@/lib/experiment-runner/m4-request";
import { m4Digest, m4MaximumCharge, m4ModelBucket } from "@/lib/experiment-runner/m4-policy";

const identity = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema,
  nowMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) });

// Unlike an ordinary claimed failure callback, retained authenticated terminal
// provider evidence can prove that no valid result is available. Revalidate that
// proof here and exclude active save claims; an operation deadline need not expire.
// This never releases money, retries generation, or repairs historical outputs.
export async function closeM4KnownFailure(database: Database, authority: M4Authority, raw: unknown): Promise<"closed" | "deferred"> {
  const input = identity.parse(raw);
  const ledger = createExperimentCampaignLedger(database, authority);
  return withMongoTransaction(database, async (session) => {
    const run = await database.collections.experiment_runs.findOne({ _id: input.runId }, { session });
    const op = await database.collections.experiment_operations.findOne({ _id: input.operationId, runId: input.runId }, { session });
    const prep = op?.m4Preparation, reservation = op?.m4Reservation, observation = op?.m4Observation;
    if (!run || !op || !prep || !reservation || !observation || run.mode !== "balanced" || op.mode !== "balanced" ||
        op.providerKind !== "text" || op.role === "image" || op.reservationCount !== 1 || !op.workflowRunId || op.dispatchStartedAtMs == null ||
        run.m4?.campaignId !== ledger.grant.campaignId || run.m4.policyHash !== ledger.snapshot.hash || run.m4.policyJson !== ledger.snapshot.json ||
        prep.policyHash !== ledger.snapshot.hash || reservation.policyHash !== ledger.snapshot.hash || reservation.campaignId !== ledger.grant.campaignId ||
        prep.configurationHash !== run.configurationHash || prep.operationFingerprint !== m4OperationFingerprint(op) ||
        prep.requestDigest !== reservation.requestDigest || prep.requestDigest !== m4Hash(prep.requestJson) ||
        prep.parentWorkflowRunId !== op.parentWorkflowRunId || prep.publishedWorkflowId !== op.verifiedWorkflowId ||
        observation.workflowRunId !== op.workflowRunId || observation.publishedWorkflowId !== prep.publishedWorkflowId ||
        !["succeeded", "failed", "stopped"].includes(observation.remoteStatus) || !["provider_failure", "creative_invalid"].includes(observation.issue ?? "") ||
        !m4Digest.safeParse(observation.wrapperDigest).success || observation.content === null || observation.evidenceJson === null ||
        observation.evidenceDigest !== m4Hash(observation.evidenceJson) ||
        reservation.bucket !== m4ModelBucket(op.role, run.generationCompletedAtMs != null) ||
        reservation.maximumMicrodollars !== m4MaximumCharge(ledger.snapshot.policy, reservation.bucket)) return "deferred";
    const campaign = await database.collections.experiment_campaigns.findOne({ _id: ledger.grant.campaignId }, { session });
    if (!campaign || campaign.policyHash !== ledger.snapshot.hash || campaign.policyJson !== ledger.snapshot.json ||
        campaign.grantReference !== ledger.grant.reference) return "deferred";
    try {
      const expected = ledger.snapshot.policy.publications.find((p) => p.role === op.role && p.taskId === op.taskId &&
        p.persona === (op.role === "tester" ? run.persona : null));
      const saved = savedConfigurationSchema.parse(JSON.parse(run.configurationJson)).find((p) => p.role === op.role && p.taskId === op.taskId);
      if (!expected || !saved || expected.publishedWorkflowId !== observation.publishedWorkflowId ||
          saved.appId !== expected.appId || saved.publishedWorkflowId !== expected.publishedWorkflowId || saved.toolProviderId !== expected.toolProviderId) return "deferred";
      const request = z.object({ input: z.array(z.object({ role: z.string(), content: z.string() })) }).parse(JSON.parse(prep.requestJson));
      if (request.input.filter((p) => p.role === "user").length !== 1 || request.input.find((p) => p.role === "user")?.content !== prep.contextJson) return "deferred";
      const assessed = assessM4ProviderResult({ schemaVersion: "booklet_provider_v1", content: observation.content,
        providerEvidence: JSON.parse(observation.evidenceJson) }, ledger.snapshot.policy, op);
      if (assessed.evidenceJson !== observation.evidenceJson || assessed.evidenceDigest !== observation.evidenceDigest ||
          assessed.violations.length || assessed.chargeUpperMicrodollars === null || reservation.evidenceDigest !== observation.evidenceDigest ||
          reservation.settledMicrodollars !== assessed.chargeUpperMicrodollars) return "deferred";
      if (observation.issue === "provider_failure") {
        if (observation.remoteStatus === "succeeded" && assessed.canMaterialize) return "deferred";
      } else {
        if (observation.remoteStatus !== "succeeded" || !assessed.canMaterialize) return "deferred";
        const selector = { role: op.role, taskId: op.taskId, persona: run.persona,
          report: (op.role === "tester" || op.role === "judge") && run.generationCompletedAtMs != null } as M4RequestSelector;
        let invalid = false;
        try { parseM4CreativeOutput(selector, observation.content, prep.contextJson); } catch { invalid = true; }
        if (!invalid) return "deferred";
      }
    } catch { return "deferred"; }
    if (op.resultJson !== null || op.resultDigest !== null || op.materializationJson !== null || op.imageCompletionDigest != null ||
        [op.authorizationClaim, op.resultFinalizationClaim, op.imageCompletionClaim].some((claim) => claim && claim.expiresAtMs > input.nowMs) ||
        await database.collections.artifact_versions.findOne({ sourceOperationId: op._id }, { session, projection: { _id: 1 } })) return "deferred";
    if (op.state === "failed" && op.safeFailure === "definite_failure" && op.lifecycle?.phase === "finished" &&
        op.lifecycle.unresolved === false && run.status === "blocked" && run.safeFailure === "definite_failure" && run.activeOperationId === null) return "closed";
    if (!["started", "unknown"].includes(op.state) || run.activeOperationId !== op._id || ["completed", "failed"].includes(run.status) || !op.lifecycle) return "deferred";
    await ledger.stop(session, input.nowMs);
    const closed = await database.collections.experiment_operations.updateOne({ _id: op._id, state: op.state,
      "m4Observation.wrapperDigest": observation.wrapperDigest, "m4Observation.issue": observation.issue }, { $set: {
      state: "failed", safeFailure: "definite_failure", updatedAtMs: input.nowMs, lifecycle: { ...op.lifecycle,
        phase: "finished", attemptOutcome: "failed", unresolved: false, endedAtMs: op.lifecycle.endedAtMs ?? input.nowMs,
        lastProgressAtMs: input.nowMs },
    } }, { session });
    if (closed.modifiedCount !== 1) throw new Error("M4 failure evidence changed during closure.");
    const blocked = await database.collections.experiment_runs.findOneAndUpdate({ _id: run._id, revision: run.revision, activeOperationId: op._id },
      { $set: { status: "blocked", safeFailure: "definite_failure", activeOperationId: null, updatedAtMs: input.nowMs }, $inc: { revision: 1 } },
      { session, returnDocument: "after" });
    if (!blocked) throw new Error("M4 run changed during failure closure.");
    await failTerminalPageBatchItems(database, blocked, session, input.nowMs);
    return "closed";
  });
}
