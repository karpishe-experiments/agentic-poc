import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentCampaignDocument, ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { CASES, personaSchema } from "@/lib/contracts/experiment-runner";
import { m4Digest, m4GrantSchema, m4MaximumCharge, m4ModelBucket, m4PolicySnapshot, type M4Grant } from "@/lib/experiment-runner/m4-policy";

export type M4Authority = { policy: unknown; grant: M4Grant };
export class CampaignAdmissionError extends Error {
  constructor(message: string, public readonly reason: "conflict" | "limit_exhausted" = "conflict") { super(message); this.name = "CampaignAdmissionError"; }
}
const requireState = (condition: unknown, message: string): void => { if (!condition) throw new CampaignAdmissionError(message); };
const requireAllowance = (condition: unknown, message: string): void => { if (!condition) throw new CampaignAdmissionError(message, "limit_exhausted"); };

// Reviewed staging configuration supplies policy + explicit grant. A public
// request cannot create authority or change the frozen campaign allowance.
export function createExperimentCampaignLedger(database: Database, authority: M4Authority) {
  const snapshot = m4PolicySnapshot(authority.policy);
  const grant = Object.freeze(m4GrantSchema.parse(authority.grant));
  const campaigns = database.collections.experiment_campaigns;
  async function current(session: ClientSession): Promise<ExperimentCampaignDocument> {
    const campaign = await campaigns.findOne({ _id: grant.campaignId }, { session });
    requireState(campaign && campaign.policyHash === snapshot.hash && campaign.policyJson === snapshot.json &&
      campaign.grantReference === grant.reference, "Campaign policy or grant differs.");
    return campaign!;
  }
  async function touch(campaign: ExperimentCampaignDocument, session: ClientSession, values: Partial<ExperimentCampaignDocument>, nowMs: number) {
    const changed = await campaigns.updateOne({ _id: campaign._id, revision: campaign.revision },
      { $set: { ...values, updatedAtMs: nowMs }, $inc: { revision: 1 } }, { session });
    requireState(changed.modifiedCount === 1, "Campaign changed during admission.");
  }
  async function create(session: ClientSession, nowMs: number) {
    requireState(process.env.DEPLOYMENT_ENV !== "_prod", "M4 is unavailable in production.");
    const prior = await campaigns.findOne({ _id: grant.campaignId }, { session });
    if (prior) return current(session);
    const empty = Object.fromEntries(personaSchema.options.map((p) => [p, null])) as ExperimentCampaignDocument["slots"];
    const counts = Object.fromEntries(personaSchema.options.map((p) => [p, 0])) as ExperimentCampaignDocument["requestCounts"];
    const campaign: ExperimentCampaignDocument = { _id: grant.campaignId, schemaVersion: "m4_v1",
      policyHash: snapshot.hash, policyJson: snapshot.json, grantReference: grant.reference,
      state: "active", revision: 0, slots: empty, requests: 0, judgeRunIds: [], requestCounts: counts,
      reservedMicrodollars: 0, settledMicrodollars: 0, createdAtMs: nowMs, updatedAtMs: nowMs };
    await campaigns.insertOne(campaign, { session });
    return campaign;
  }
  async function claimPersona(session: ClientSession, run: Pick<ExperimentRunDocument, "_id" | "persona" | "mode" | "predecessorRunId" | "configurationJson">, campaignId: string, nowMs: number) {
    requireState(campaignId === grant.campaignId && run.mode === "balanced" && !run.predecessorRunId, "M4 requires one initial run in the granted campaign.");
    const campaign = await current(session);
    requireState(campaign.state === "active", "Campaign is not active.");
    const slot = campaign.slots[run.persona];
    requireState(slot === null || slot === run._id, "Persona already has its initial run.");
    const previous = run.persona === "enthusiast_parent" ? "playful_kid" : run.persona === "professional_creator" ? "enthusiast_parent" : null;
    if (previous) {
      const prior = await database.collections.experiment_runs.findOne({ _id: campaign.slots[previous] ?? "", "m4.campaignId": campaign._id }, { session });
      requireState(prior?.status === "completed" && prior.evaluationStatus === "complete" && prior.generationCompletedAtMs != null,
        "The preceding persona has not completed generation and evaluation.");
    }
    const expected = snapshot.policy.publications.filter((p) => p.persona === null || p.persona === run.persona)
      .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({ role, taskId, appId, publishedWorkflowId, toolProviderId,
        ...(finalPageIllustration === true ? { finalPageIllustration } : {}) }));
    // Binding order is not identity. Compare complete entries as a multiset so
    // duplicates/missing entries still fail. Never reorder the saved snapshot:
    // its historical serialization and hash remain authoritative for that run.
    const normalize = (value: unknown[]) => JSON.stringify(value.map((entry) => JSON.stringify(entry, (_k, v: unknown) => v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : v)).sort());
    requireState(normalize(JSON.parse(run.configurationJson)) === normalize(expected), "Run publications differ from the frozen manifest.");
    if (slot === null) await touch(campaign, session, { slots: { ...campaign.slots, [run.persona]: run._id } }, nowMs);
    return { campaignId: campaign._id, policyHash: snapshot.hash, policyJson: snapshot.json };
  }
  async function reserve(session: ClientSession, run: ExperimentRunDocument, operation: ExperimentOperationDocument, requestDigest: string, nowMs: number) {
    m4Digest.parse(requestDigest);
    requireState(run.mode === "balanced" && operation.mode === "balanced" && operation.providerKind === "text" &&
      operation.runId === run._id && run.m4?.campaignId === grant.campaignId && run.m4.policyHash === snapshot.hash &&
      run.m4.policyJson === snapshot.json, "Text claim has no matching M4 policy.");
    const bucket = m4ModelBucket(operation.role, run.generationCompletedAtMs != null);
    const maximumMicrodollars = m4MaximumCharge(snapshot.policy, bucket);
    const expected = { campaignId: grant.campaignId, policyHash: snapshot.hash, requestDigest, bucket, maximumMicrodollars };
    if (operation.m4Reservation) {
      requireState(Object.entries(expected).every(([key, value]) => operation.m4Reservation![key as keyof typeof expected] === value), "Reservation identity changed.");
      return operation.m4Reservation;
    }
    requireState(operation.state === "prepared" && operation.reservationCount === 0 && run.activeOperationId === operation._id &&
      !run.pauseRequested && (run.status === "queued" || run.status === "running") &&
      operation.deadlineAtMs != null && operation.deadlineAtMs > nowMs, "Operation cannot reserve provider work.");
    const campaign = await current(session);
    requireState(campaign.state === "active" && campaign.slots[run.persona] === run._id, "Campaign has no active persona slot.");
    requireAllowance(campaign.requests < snapshot.policy.maxRequests && campaign.requestCounts[run.persona] < CASES[run.persona].llmLimit,
      "Campaign request allowance is exhausted.");
    requireAllowance(bucket !== "judge" || campaign.judgeRunIds.length < snapshot.policy.maxJudges && !campaign.judgeRunIds.includes(run._id), "Judge allowance is exhausted.");
    requireAllowance(campaign.settledMicrodollars + campaign.reservedMicrodollars + maximumMicrodollars <= snapshot.policy.maxMicrodollars,
      "Campaign monetary allowance is exhausted.");
    const reservation = { ...expected, unsettledMicrodollars: maximumMicrodollars, settledMicrodollars: null, evidenceDigest: null };
    const saved = await database.collections.experiment_operations.updateOne({ _id: operation._id, state: "prepared", reservationCount: 0, m4Reservation: { $exists: false } },
      { $set: { m4Reservation: reservation } }, { session });
    requireState(saved.modifiedCount === 1, "Operation reservation changed.");
    await touch(campaign, session, { requests: campaign.requests + 1,
      requestCounts: { ...campaign.requestCounts, [run.persona]: campaign.requestCounts[run.persona] + 1 },
      judgeRunIds: bucket === "judge" ? [...campaign.judgeRunIds, run._id] : campaign.judgeRunIds,
      reservedMicrodollars: campaign.reservedMicrodollars + maximumMicrodollars }, nowMs);
    return reservation;
  }
  // Called only after authenticated provider evidence is attributed. Unknown or
  // failed requests retain their maximum: there is deliberately no release API.
  async function settle(session: ClientSession, operation: ExperimentOperationDocument, evidence: { digest: string; chargeMicrodollars: number }, nowMs: number) {
    m4Digest.parse(evidence.digest);
    requireState(Number.isSafeInteger(evidence.chargeMicrodollars) && evidence.chargeMicrodollars >= 0, "Invalid attributable charge.");
    const reservation = operation.m4Reservation;
    requireState(reservation && reservation.campaignId === grant.campaignId && reservation.policyHash === snapshot.hash, "No matching reservation.");
    if (reservation!.evidenceDigest !== null) {
      if (reservation!.evidenceDigest !== evidence.digest || reservation!.settledMicrodollars !== evidence.chargeMicrodollars) {
        await stop(session, nowMs);
        return "conflict" as const;
      }
      return "reused" as const;
    }
    const campaign = await current(session);
    requireState(campaign.reservedMicrodollars >= reservation!.maximumMicrodollars, "Campaign reservation totals conflict.");
    // A disclosed fee assumption is not attributable usage. Keep it reserved
    // after model-token settlement and label its cost unavailable in reports.
    const countHold = snapshot.policy.countChargeStatus === "assumed" ? snapshot.policy.countChargeCeilingMicrodollars : 0;
    const overLimit = evidence.chargeMicrodollars + countHold > reservation!.maximumMicrodollars;
    const saved = await database.collections.experiment_operations.updateOne({ _id: operation._id, "m4Reservation.evidenceDigest": null },
      { $set: { "m4Reservation.evidenceDigest": evidence.digest, "m4Reservation.settledMicrodollars": evidence.chargeMicrodollars,
        "m4Reservation.unsettledMicrodollars": countHold } }, { session });
    requireState(saved.modifiedCount === 1, "Settlement changed concurrently.");
    await touch(campaign, session, { reservedMicrodollars: campaign.reservedMicrodollars - reservation!.maximumMicrodollars + countHold,
      settledMicrodollars: campaign.settledMicrodollars + evidence.chargeMicrodollars,
      ...(overLimit ? { state: "stopped" as const } : {}) }, nowMs);
    return "settled" as const;
  }
  async function stop(session: ClientSession, nowMs: number) {
    const campaign = await current(session);
    if (campaign.state === "active") await touch(campaign, session, { state: "stopped" }, nowMs);
  }
  async function continueFailure(session: ClientSession, run: ExperimentRunDocument, operation: ExperimentOperationDocument, nowMs: number) {
    const permission = grant.continuations?.find((item) => item.runId === run._id && item.operationId === operation._id);
    requireState(permission && !operation.m4Continuation && run.m4?.campaignId === grant.campaignId &&
      run.m4.policyHash === snapshot.hash && run.m4.policyJson === snapshot.json, "No unused continuation grant matches this failure.");
    const campaign = await current(session);
    requireState(campaign.state === "stopped" && campaign.slots[run.persona] === run._id, "Campaign cannot continue this run.");
    requireAllowance(campaign.requests < snapshot.policy.maxRequests && campaign.requestCounts[run.persona] < CASES[run.persona].llmLimit &&
      run.counters.steps < run.limits.steps && run.counters.logicalText < run.limits.text &&
      campaign.settledMicrodollars + campaign.reservedMicrodollars + m4MaximumCharge(snapshot.policy, "decision") <= snapshot.policy.maxMicrodollars,
      "Continuation has no remaining allowance.");
    const runIds = Object.values(campaign.slots).filter((value): value is string => value !== null);
    requireState(!await database.collections.experiment_operations.findOne({ runId: { $in: runIds }, $or: [
      { state: { $in: ["prepared", "started", "unknown"] } }, { "lifecycle.unresolved": true },
      ...["authorizationClaim", "resultFinalizationClaim", "imageCompletionClaim"].map((key) => ({ [`${key}.expiresAtMs`]: { $gt: nowMs } })),
    ] }, { session, projection: { _id: 1 } }), "Campaign has unresolved operation work.");
    requireState(!await database.collections.experiment_runs.findOne({ _id: { $in: runIds }, $or: [
      { activeOperationId: { $ne: null } }, { preparation: { $ne: null } },
    ] }, { session, projection: { _id: 1 } }), "Campaign has active or unresolved preparation.");
    const provenance = { reference: permission!.reference, evidenceDigest: operation.m4Observation!.evidenceDigest!,
      requestDigest: operation.m4Reservation!.requestDigest, resumedAtMs: nowMs, runRevision: run.revision,
      campaignRevision: campaign.revision, nextOperationId: null };
    const saved = await database.collections.experiment_operations.updateOne({ _id: operation._id, runId: run._id,
      state: "failed", m4Continuation: { $exists: false } }, { $set: { m4Continuation: provenance } }, { session });
    requireState(saved.modifiedCount === 1, "Continuation was already consumed.");
    await touch(campaign, session, { state: "active" }, nowMs);
  }
  return { snapshot, grant, create, claimPersona, reserve, settle, stop, continueFailure };
}
