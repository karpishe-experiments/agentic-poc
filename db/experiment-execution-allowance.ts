import type { ClientSession, Collection } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentRunDocument, ExperimentOperationDocument } from "@/db/documents";
import type { Persona } from "@/lib/contracts/experiment-runner";
import { executionAllowanceSchema, executionPolicySnapshot, executionMaximumTextCharge,
  type ExecutionAllowance, type ExecutionPolicy } from "@/lib/experiment-runner/execution-policy";
import { m4ModelBucket } from "@/lib/experiment-runner/m4-policy";
import { m4Hash, m4CanonicalJson } from "@/lib/experiment-runner/m4-request";
import { realImageCharge, realImageResultSchema, type RealImageResult } from "@/lib/experiment-runner/real-image-contract";

export type ExecutionApprovalRecord = {
  approvalId: string; reference: string; requestDigest: string;
  predecessorApprovalId: string | null;
  previousTotals: ExecutionAllowance | null; totals: ExecutionAllowance;
  reason: ExecutionAllowanceReason | "initial"; channel: "operator_http";
  pendingRequestDigest: string | null; runRevision: number | null;
  campaignRevision: number; grantedAtMs: number;
};
export type ExecutionDeclineRecord = { declineId: string; reference: string; requestDigest: string;
  pendingRequestDigest: string; previousTotals: ExecutionAllowance; totals: ExecutionAllowance;
  channel: "operator_http"; campaignRevision: number; runRevision: number; declinedAtMs: number };
export type ExecutionCampaignDocument = {
  _id: string; schemaVersion: "execution_v1"; mode: "balanced" | "real"; persona: Persona;
  profileHash: string; profileJson: string; predecessorRunId: string | null;
  runId: string | null; revision: number;
  allowance: ExecutionAllowance; approvals: ExecutionApprovalRecord[]; declines: ExecutionDeclineRecord[];
  textRequests: number; imageRequests: number;
  reservedMicrodollars: number; settledMicrodollars: number;
  createdAtMs: number; updatedAtMs: number;
};

export type ExecutionAllowanceReason = "monetary" | "text_calls" | "image_calls" | "steps" |
  "text_revisions" | "image_revisions" | "no_progress";

export class ExecutionAllowanceError extends Error {
  constructor(public readonly code: "conflict" | "stale_revision" | "limit_exhausted", message: string,
    public readonly reason?: ExecutionAllowanceReason) { super(message); this.name = "ExecutionAllowanceError"; }
}

function conflict(message: string): never { throw new ExecutionAllowanceError("conflict", message); }
function stale(message: string): never { throw new ExecutionAllowanceError("stale_revision", message); }
function digest(value: unknown): string { return m4Hash(m4CanonicalJson(value)); }

export function createExecutionAllowanceLedger(database: Database) {
  // The same collection retains `m4_v1` rows. Every query below includes the
  // new discriminator, so a new grant cannot reinterpret a historical campaign.
  const campaigns = database.collections.experiment_campaigns as unknown as Collection<ExecutionCampaignDocument>;
  const runs = database.collections.experiment_runs;

  async function current(session: ClientSession, campaignId: string, run?: ExperimentRunDocument): Promise<ExecutionCampaignDocument> {
    const campaign = await campaigns.findOne({ _id: campaignId, schemaVersion: "execution_v1" }, { session });
    if (!campaign) conflict("Execution campaign is absent.");
    if (run && (run.execution?.campaignId !== campaignId || run.execution.profileHash !== campaign.profileHash ||
        run.execution.profileJson !== campaign.profileJson || campaign.runId !== run._id || campaign.persona !== run.persona ||
        campaign.mode !== run.mode)) conflict("Run and execution campaign differ.");
    return campaign;
  }

  async function create(session: ClientSession, input: { campaignId: string; mode: "balanced" | "real"; persona: Persona;
    profile: ExecutionPolicy; predecessorRunId?: string | null; approvalId: string; reference: string;
    totals: ExecutionAllowance; nowMs: number }): Promise<ExecutionCampaignDocument> {
    if (process.env.DEPLOYMENT_ENV === "_prod") conflict("Execution campaigns are unavailable in production.");
    const profile = executionPolicySnapshot(input.profile);
    if (profile.policy.mode !== input.mode) conflict("Campaign mode differs from its technical profile.");
    const totals = executionAllowanceSchema.parse(input.totals);
    const requestDigest = digest({ mode: input.mode, persona: input.persona, profileHash: profile.hash,
      predecessorRunId: input.predecessorRunId ?? null, approvalId: input.approvalId, reference: input.reference, totals });
    const prior = await campaigns.findOne({ _id: input.campaignId }, { session });
    if (prior) {
      if (prior.schemaVersion === "execution_v1" && prior.approvals[0]?.requestDigest === requestDigest &&
          prior.profileHash === profile.hash) return prior;
      conflict("Campaign identity belongs to another grant.");
    }
    const approval: ExecutionApprovalRecord = { approvalId: input.approvalId, reference: input.reference,
      requestDigest, predecessorApprovalId: null, previousTotals: null, totals, reason: "initial", channel: "operator_http",
      pendingRequestDigest: null, runRevision: null, campaignRevision: 0, grantedAtMs: input.nowMs };
    const campaign: ExecutionCampaignDocument = { _id: input.campaignId, schemaVersion: "execution_v1", mode: input.mode,
      persona: input.persona, profileHash: profile.hash, profileJson: profile.json, predecessorRunId: input.predecessorRunId ?? null,
      runId: null, revision: 0, allowance: totals, approvals: [approval], declines: [], textRequests: 0, imageRequests: 0,
      reservedMicrodollars: 0, settledMicrodollars: 0, createdAtMs: input.nowMs, updatedAtMs: input.nowMs };
    await campaigns.insertOne(campaign, { session });
    return campaign;
  }

  async function claimRun(session: ClientSession, run: ExperimentRunDocument, nowMs: number): Promise<void> {
    if (!run.execution) conflict("Run has no execution profile.");
    const campaign = await current(session, run.execution.campaignId);
    if (campaign.profileHash !== run.execution.profileHash || campaign.profileJson !== run.execution.profileJson ||
        campaign.persona !== run.persona || campaign.mode !== run.mode ||
        campaign.predecessorRunId !== run.predecessorRunId) conflict("Campaign does not match the new run.");
    if (campaign.runId && campaign.runId !== run._id) conflict("Campaign already owns its one paid run.");
    if (!campaign.runId) {
      const changed = await campaigns.updateOne({ _id: campaign._id, schemaVersion: "execution_v1", revision: campaign.revision, runId: null },
        { $set: { runId: run._id, updatedAtMs: nowMs }, $inc: { revision: 1 } }, { session });
      if (changed.modifiedCount !== 1) stale("Campaign run slot changed.");
    }
  }

  function reason(campaign: ExecutionCampaignDocument, run: ExperimentRunDocument,
    role: ExperimentOperationDocument["role"], providerKind: ExperimentOperationDocument["providerKind"]): ExecutionAllowanceReason | null {
    const totals = campaign.allowance;
    if (run.counters.steps >= totals.steps) return "steps";
    if (providerKind === "image") {
      if (run.counters.logicalImage >= totals.imageCalls) return "image_calls";
      return run.mode === "real" && campaign.settledMicrodollars + campaign.reservedMicrodollars >= totals.maxMicrodollars ? "monetary" : null;
    }
    if (run.counters.logicalText >= totals.textCalls) return "text_calls";
    const profile = executionPolicySnapshot(JSON.parse(campaign.profileJson)).policy;
    const maximum = executionMaximumTextCharge(profile, m4ModelBucket(role, run.generationCompletedAtMs != null));
    return campaign.settledMicrodollars + campaign.reservedMicrodollars + maximum > totals.maxMicrodollars ? "monetary" : null;
  }

  async function check(session: ClientSession, run: ExperimentRunDocument,
    role: ExperimentOperationDocument["role"], providerKind: ExperimentOperationDocument["providerKind"]) {
    const campaign = await current(session, run.execution!.campaignId, run);
    return { campaign, reason: reason(campaign, run, role, providerKind) };
  }

  async function pause(session: ClientSession, run: ExperimentRunDocument,
    denied: ExecutionAllowanceReason, nowMs: number, operation?: ExperimentOperationDocument | null,
    preparationOwnerId?: string, nextAction?: { role: ExperimentOperationDocument["role"];
      providerKind: ExperimentOperationDocument["providerKind"]; taskId: ExperimentOperationDocument["taskId"] }) {
    const campaign = await current(session, run.execution!.campaignId, run);
    const action = operation ? { role: operation.role, providerKind: operation.providerKind, taskId: operation.taskId } : nextAction;
    if (!action || reason(campaign, run, action.role, action.providerKind) !== denied) conflict("Allowance reason differs from the next action.");
    const profile = executionPolicySnapshot(JSON.parse(campaign.profileJson)).policy;
    const requiredTotal = denied === "monetary" ? campaign.settledMicrodollars + campaign.reservedMicrodollars +
      (action.providerKind === "image" ? 1 : executionMaximumTextCharge(profile, m4ModelBucket(action.role, run.generationCompletedAtMs != null))) :
      denied === "text_calls" ? run.counters.logicalText + 1 : denied === "image_calls" ? run.counters.logicalImage + 1 :
      denied === "steps" ? run.counters.steps + 1 : denied === "text_revisions" ? run.textRevisions + 1 :
      denied === "image_revisions" ? run.imageRevisions + 1 : (run.noProgressCount ?? 0) + 1;
    if (run.safeFailure || run.preparation && (run.preparation.ownerId !== preparationOwnerId || run.preparation.unresolved) ||
        run.status === "completed" || run.status === "failed" ||
        run.pendingApproval || operation && (run.activeOperationId !== operation._id || operation.state !== "prepared" ||
          operation.dispatchStartedAtMs != null || operation.reservationCount !== 0 || operation.workflowRunId != null ||
          operation.m4Reservation != null || operation.authorizationClaim != null)) {
      conflict("Allowance pause requires an undispatched, resolved run.");
    }
    if (operation) {
      const proofDigest = digest({ kind: "undispatched_allowance_v1", runId: run._id, operationId: operation._id,
        profileHash: campaign.profileHash, preparation: operation.m4Preparation ?? null,
        ...(run.mode === "real" ? { realImagePreparation: operation.realImagePreparation ?? null } : {}),
        inputFingerprint: operation.inputFingerprint, configurationHash: run.configurationHash });
      const cancelled = await database.collections.experiment_operations.updateOne({ _id: operation._id, runId: run._id,
        state: "prepared", dispatchStartedAtMs: null, reservationCount: 0 }, { $set: {
          state: "failed", safeFailure: null, updatedAtMs: nowMs,
          executionAllowanceCancellation: { kind: "undispatched_allowance_v1", proofDigest, cancelledAtMs: nowMs },
          ...(operation.lifecycle ? { lifecycle: { ...operation.lifecycle, phase: "finished" as const,
            attemptOutcome: "failed" as const, unresolved: false, endedAtMs: nowMs, lastProgressAtMs: nowMs } } : {}),
        } }, { session });
      if (cancelled.modifiedCount !== 1) stale("Undispatched operation changed before allowance pause.");
    } else if (run.activeOperationId) conflict("Allowance pause cannot skip an active operation.");
    const pending = { kind: "allowance_v1" as const, reason: denied, operationId: operation?._id ?? null,
      requiredTotal, nextAction: action,
      requestedAtMs: nowMs, requestDigest: digest({ kind: "allowance_v1", runId: run._id,
        campaignId: campaign._id, profileHash: campaign.profileHash, campaignRevision: campaign.revision,
        runRevision: run.revision, reason: denied, operationId: operation?._id ?? null,
        requiredTotal, nextAction: action,
        counters: run.counters, textRevisions: run.textRevisions, imageRevisions: run.imageRevisions,
        noProgressCount: run.noProgressCount ?? 0 }) };
    const changed = await runs.findOneAndUpdate({ _id: run._id, revision: run.revision,
      activeOperationId: operation?._id ?? null }, { $set: { status: "paused", pauseRequested: true,
        activeOperationId: null, preparation: null, pendingApproval: pending, updatedAtMs: nowMs }, $inc: { revision: 1 } },
    { session, returnDocument: "after" });
    if (!changed) stale("Run changed before allowance pause.");
    return changed;
  }

  async function reserveText(session: ClientSession, run: ExperimentRunDocument, operation: ExperimentOperationDocument,
    requestDigest: string, nowMs: number) {
    const campaign = await current(session, run.execution!.campaignId, run);
    const denied = reason(campaign, run, operation.role, "text");
    if (denied) throw new ExecutionAllowanceError("limit_exhausted", "Execution allowance is exhausted.", denied);
    const policy = executionPolicySnapshot(JSON.parse(campaign.profileJson)).policy;
    const bucket = m4ModelBucket(operation.role, run.generationCompletedAtMs != null);
    const maximumMicrodollars = executionMaximumTextCharge(policy, bucket);
    const reservation = { campaignId: campaign._id, policyHash: campaign.profileHash, requestDigest, bucket,
      tokenPolicy: policy.tokenPolicy, effectivePolicyHash: policy.tokenPolicy.hash,
      maxInputTokens: policy.tokenPolicy.amendment.maxInputTokens,
      maximumMicrodollars, unsettledMicrodollars: maximumMicrodollars, settledMicrodollars: null, evidenceDigest: null };
    const saved = await database.collections.experiment_operations.updateOne({ _id: operation._id, runId: run._id,
      state: "prepared", reservationCount: 0, m4Reservation: { $exists: false } }, { $set: { m4Reservation: reservation } }, { session });
    if (saved.modifiedCount !== 1) conflict("Operation reservation changed.");
    const changed = await campaigns.updateOne({ _id: campaign._id, schemaVersion: "execution_v1", revision: campaign.revision },
      { $set: { reservedMicrodollars: campaign.reservedMicrodollars + maximumMicrodollars,
        textRequests: campaign.textRequests + 1, updatedAtMs: nowMs }, $inc: { revision: 1 } }, { session });
    if (changed.modifiedCount !== 1) stale("Campaign reservation changed.");
    return reservation;
  }

  async function countImage(session: ClientSession, run: ExperimentRunDocument, nowMs: number) {
    const campaign = await current(session, run.execution!.campaignId, run);
    if (run.counters.logicalImage >= campaign.allowance.imageCalls || run.counters.steps >= campaign.allowance.steps) {
      throw new ExecutionAllowanceError("limit_exhausted", "Image allowance is exhausted.", "image_calls");
    }
    const changed = await campaigns.updateOne({ _id: campaign._id, schemaVersion: "execution_v1",
      revision: campaign.revision }, { $set: { imageRequests: campaign.imageRequests + 1,
        updatedAtMs: nowMs }, $inc: { revision: 1 } }, { session });
    if (changed.modifiedCount !== 1) stale("Campaign image count changed.");
  }

  async function reserveRealImage(session: ClientSession, run: ExperimentRunDocument,
    operation: ExperimentOperationDocument, requestDigest: string, nowMs: number) {
    const campaign = await current(session, run.execution!.campaignId, run);
    const profile = executionPolicySnapshot(JSON.parse(campaign.profileJson)).policy;
    if (run.mode !== "real" || campaign.mode !== "real" || !profile.realImage || operation.providerKind !== "image") {
      conflict("Real image profile is not current.");
    }
    const denied = reason(campaign, run, operation.role, "image");
    if (denied) throw new ExecutionAllowanceError("limit_exhausted", "Real image allowance is exhausted.", denied);
    const hold = campaign.allowance.maxMicrodollars - campaign.reservedMicrodollars - campaign.settledMicrodollars;
    if (!Number.isSafeInteger(hold) || hold <= 0) conflict("Real image planning hold is unavailable.");
    const reservation = { campaignId: campaign._id, profileHash: campaign.profileHash, requestDigest,
      planningHoldMicrodollars: hold, unsettledMicrodollars: hold, settledMicrodollars: null,
      evidenceDigest: null, overrunMicrodollars: 0 };
    const saved = await database.collections.experiment_operations.updateOne({ _id: operation._id, runId: run._id,
      state: "prepared", reservationCount: 0, realImageReservation: { $exists: false } },
    { $set: { realImageReservation: reservation } }, { session });
    if (saved.modifiedCount !== 1) conflict("Real image reservation changed.");
    const changed = await campaigns.updateOne({ _id: campaign._id, schemaVersion: "execution_v1", revision: campaign.revision },
      { $set: { reservedMicrodollars: campaign.reservedMicrodollars + hold,
        imageRequests: campaign.imageRequests + 1, updatedAtMs: nowMs }, $inc: { revision: 1 } }, { session });
    if (changed.modifiedCount !== 1) stale("Real image campaign reservation changed.");
    return reservation;
  }

  async function settleRealImage(session: ClientSession, run: ExperimentRunDocument,
    operation: ExperimentOperationDocument, raw: RealImageResult, nowMs: number) {
    const result = realImageResultSchema.parse(raw);
    const campaign = await current(session, run.execution!.campaignId, run);
    const profile = executionPolicySnapshot(JSON.parse(campaign.profileJson)).policy;
    const reservation = operation.realImageReservation;
    if (run.mode !== "real" || !profile.realImage || !reservation ||
        reservation.profileHash !== campaign.profileHash || reservation.campaignId !== campaign._id ||
        reservation.requestDigest !== result.requestDigest ||
        campaign.reservedMicrodollars < reservation.unsettledMicrodollars) conflict("Real image settlement has no attributable hold.");
    const evidenceDigest = digest(result);
    if (reservation.evidenceDigest) {
      if (reservation.evidenceDigest !== evidenceDigest) conflict("Real image observation changed.");
      return { reused: true as const, chargeMicrodollars: reservation.settledMicrodollars,
        overrunMicrodollars: reservation.overrunMicrodollars };
    }
    const priced = realImageCharge(result, profile.realImage.price);
    if (!priced) {
      const savedUnknown = await database.collections.experiment_operations.updateOne({ _id: operation._id,
        runId: run._id, "realImageReservation.evidenceDigest": null }, { $set: {
        realImageObservation: { resultJson: m4CanonicalJson(result), resultDigest: evidenceDigest,
          observedAtMs: nowMs, chargeBasis: "unknown_outcome" },
        "realImageReservation.evidenceDigest": evidenceDigest,
      } }, { session });
      if (savedUnknown.modifiedCount !== 1) conflict("Real image unknown outcome changed concurrently.");
      return { reused: false as const, chargeMicrodollars: null, overrunMicrodollars: 0 };
    }
    const charge = priced.microdollars;
    const hold = reservation.unsettledMicrodollars;
    const overrun = Math.max(0, charge - hold);
    const saved = await database.collections.experiment_operations.updateOne({ _id: operation._id, runId: run._id,
      "realImageReservation.evidenceDigest": null }, { $set: { realImageObservation: {
        resultJson: m4CanonicalJson(result), resultDigest: evidenceDigest, observedAtMs: nowMs,
        chargeBasis: priced.basis },
      "realImageReservation.evidenceDigest": evidenceDigest,
      "realImageReservation.settledMicrodollars": charge,
      "realImageReservation.unsettledMicrodollars": 0,
      "realImageReservation.overrunMicrodollars": overrun } }, { session });
    if (saved.modifiedCount !== 1) conflict("Real image settlement changed concurrently.");
    const changed = await campaigns.updateOne({ _id: campaign._id, schemaVersion: "execution_v1", revision: campaign.revision },
      { $set: { reservedMicrodollars: campaign.reservedMicrodollars - hold,
        settledMicrodollars: campaign.settledMicrodollars + charge, updatedAtMs: nowMs },
      $inc: { revision: 1 } }, { session });
    if (changed.modifiedCount !== 1) stale("Real image campaign settlement changed.");
    return { reused: false as const, chargeMicrodollars: charge, overrunMicrodollars: overrun };
  }

  async function settleText(session: ClientSession, run: ExperimentRunDocument, operation: ExperimentOperationDocument,
    evidence: { digest: string; chargeMicrodollars: number }, nowMs: number) {
    const campaign = await current(session, run.execution!.campaignId, run);
    const reservation = operation.m4Reservation;
    if (!reservation || reservation.campaignId !== campaign._id || reservation.policyHash !== campaign.profileHash ||
        !Number.isSafeInteger(evidence.chargeMicrodollars) || evidence.chargeMicrodollars < 0) conflict("Settlement lacks an attributable reservation.");
    if (reservation.evidenceDigest !== null) {
      if (reservation.evidenceDigest !== evidence.digest || reservation.settledMicrodollars !== evidence.chargeMicrodollars) conflict("Settlement evidence differs.");
      return "reused" as const;
    }
    const profile = executionPolicySnapshot(JSON.parse(campaign.profileJson)).policy;
    const countHold = profile.countChargeStatus === "assumed" ? profile.countChargeCeilingMicrodollars : 0;
    if (evidence.chargeMicrodollars + countHold > reservation.maximumMicrodollars ||
        campaign.reservedMicrodollars < reservation.maximumMicrodollars) conflict("Settlement exceeds the retained bound.");
    const saved = await database.collections.experiment_operations.updateOne({ _id: operation._id, runId: run._id,
      "m4Reservation.evidenceDigest": null }, { $set: { "m4Reservation.evidenceDigest": evidence.digest,
        "m4Reservation.settledMicrodollars": evidence.chargeMicrodollars,
        "m4Reservation.unsettledMicrodollars": countHold } }, { session });
    if (saved.modifiedCount !== 1) conflict("Settlement changed concurrently.");
    const changed = await campaigns.updateOne({ _id: campaign._id, schemaVersion: "execution_v1", revision: campaign.revision },
      { $set: { reservedMicrodollars: campaign.reservedMicrodollars - reservation.maximumMicrodollars + countHold,
        settledMicrodollars: campaign.settledMicrodollars + evidence.chargeMicrodollars, updatedAtMs: nowMs },
        $inc: { revision: 1 } }, { session });
    if (changed.modifiedCount !== 1) stale("Campaign settlement changed.");
    return "settled" as const;
  }

  async function approve(session: ClientSession, input: { runId: string; approvalId: string; reference: string;
    expectedRunRevision: number; expectedCampaignRevision: number; expectedPendingDigest: string;
    totals: ExecutionAllowance; nowMs: number },
    materialize?: (run: ExperimentRunDocument, session: ClientSession) => Promise<Record<string, unknown>>) {
    const run = await runs.findOne({ _id: input.runId }, { session });
    if (!run?.execution) conflict("Run has no approval-only execution profile.");
    const campaign = await current(session, run.execution.campaignId, run);
    const totals = executionAllowanceSchema.parse(input.totals);
    const requestDigest = digest({ runId: input.runId, approvalId: input.approvalId, reference: input.reference,
      expectedPendingDigest: input.expectedPendingDigest, totals });
    const existing = campaign.approvals.find(item => item.approvalId === input.approvalId);
    if (existing) {
      if (existing.requestDigest !== requestDigest) conflict("Approval key was used for different totals.");
      return { approval: existing, runRevision: existing.runRevision! + 1, reused: true as const };
    }
    if (run.revision !== input.expectedRunRevision || campaign.revision !== input.expectedCampaignRevision) stale("Run or campaign revision changed.");
    if (run.status !== "paused" || !run.pendingApproval ||
        run.pendingApproval.requestDigest !== input.expectedPendingDigest || run.safeFailure || run.activeOperationId || run.preparation) {
      conflict("Run has no matching settled allowance pause.");
    }
    const old = campaign.allowance;
    for (const field of Object.keys(old) as Array<keyof ExecutionAllowance>) {
      if (totals[field] < old[field]) conflict("Approval cannot reduce a prior allowance.");
    }
    const field = ({ monetary: "maxMicrodollars", text_calls: "textCalls", image_calls: "imageCalls", steps: "steps",
      text_revisions: "textRevisions", image_revisions: "imageRevisions", no_progress: "noProgress" } as const)[run.pendingApproval.reason];
    if (totals[field] <= old[field]) conflict("Approval must increase the exhausted allowance.");
    if (run.pendingApproval.requiredTotal != null && totals[field] < run.pendingApproval.requiredTotal) {
      conflict("Approval does not fund the exact paused next action.");
    }
    if (totals.maxMicrodollars < campaign.reservedMicrodollars + campaign.settledMicrodollars ||
        totals.textCalls < run.counters.logicalText || totals.imageCalls < run.counters.logicalImage ||
        totals.steps < run.counters.steps || totals.textRevisions < run.textRevisions ||
        totals.imageRevisions < run.imageRevisions || totals.noProgress < (run.noProgressCount ?? 0)) {
      conflict("Approval is below retained counters or liabilities.");
    }
    const next = run.pendingApproval.nextAction;
    if (next && reason({ ...campaign, allowance: totals }, run, next.role, next.providerKind)) {
      conflict("Approval does not fund the exact paused next action across all allowances.");
    }
    const approval: ExecutionApprovalRecord = { approvalId: input.approvalId, reference: input.reference,
      requestDigest, predecessorApprovalId: campaign.approvals.at(-1)!.approvalId,
      previousTotals: old, totals, reason: run.pendingApproval.reason, channel: "operator_http",
      pendingRequestDigest: run.pendingApproval.requestDigest,
      runRevision: run.revision, campaignRevision: campaign.revision + 1, grantedAtMs: input.nowMs };
    const changed = await campaigns.updateOne({ _id: campaign._id, schemaVersion: "execution_v1", revision: campaign.revision },
      { $set: { allowance: totals, updatedAtMs: input.nowMs }, $push: { approvals: approval }, $inc: { revision: 1 } }, { session });
    if (changed.modifiedCount !== 1) stale("Campaign approval changed.");
    const runPatch = materialize ? await materialize(run, session) : {};
    const updated = await runs.findOneAndUpdate({ _id: run._id, revision: run.revision, status: "paused",
      activeOperationId: null }, { $set: { ...runPatch, status: "queued", pauseRequested: false,
        pendingApproval: null, updatedAtMs: input.nowMs }, $inc: { revision: 1 } },
    { session, returnDocument: "after" });
    if (!updated) stale("Run approval changed.");
    return { approval, runRevision: updated.revision, reused: false as const };
  }

  async function decline(session: ClientSession, input: { runId: string; declineId: string; reference: string;
    expectedRunRevision: number; expectedCampaignRevision: number; expectedPendingDigest: string; nowMs: number }) {
    const run = await runs.findOne({ _id: input.runId }, { session });
    if (!run?.execution) conflict("Run has no approval-only execution profile.");
    const campaign = await current(session, run.execution.campaignId, run);
    const requestDigest = digest({ runId: input.runId, declineId: input.declineId, reference: input.reference,
      expectedPendingDigest: input.expectedPendingDigest });
    const previous = campaign.declines.find(item => item.declineId === input.declineId);
    if (previous) {
      if (previous.requestDigest !== requestDigest) conflict("Decline key belongs to another decision.");
      return { runRevision: previous.runRevision, campaignRevision: previous.campaignRevision, reused: true as const };
    }
    const pending = run.pendingApproval;
    if (run.revision !== input.expectedRunRevision || campaign.revision !== input.expectedCampaignRevision) stale("Run or campaign revision changed.");
    if (run.status !== "paused" || !pending || pending.requestDigest !== input.expectedPendingDigest ||
        run.safeFailure || run.activeOperationId || run.preparation || pending.declineId) conflict("No undecided allowance request is current.");
    const decline: ExecutionDeclineRecord = { declineId: input.declineId, reference: input.reference,
      requestDigest, pendingRequestDigest: pending.requestDigest, previousTotals: campaign.allowance,
      totals: campaign.allowance, channel: "operator_http", campaignRevision: campaign.revision + 1,
      runRevision: run.revision + 1, declinedAtMs: input.nowMs };
    const appended = await campaigns.updateOne({ _id: campaign._id, schemaVersion: "execution_v1", revision: campaign.revision },
      { $push: { declines: decline }, $inc: { revision: 1 }, $set: { updatedAtMs: input.nowMs } }, { session });
    if (appended.modifiedCount !== 1) stale("Decline history changed before it was retained.");
    const changed = await runs.findOneAndUpdate({ _id: run._id, revision: run.revision, status: "paused",
      activeOperationId: null }, { $set: { pendingApproval: { ...pending, declinedAtMs: input.nowMs,
        declineId: input.declineId, declineReference: input.reference }, updatedAtMs: input.nowMs },
      $inc: { revision: 1 } }, { session, returnDocument: "after" });
    if (!changed) stale("Decline changed before it was retained.");
    return { runRevision: changed.revision, campaignRevision: campaign.revision + 1, reused: false as const };
  }

  return { current, create, claimRun, check, pause, reserveText, countImage, settleText,
    reserveRealImage, settleRealImage, approve, decline };
}
