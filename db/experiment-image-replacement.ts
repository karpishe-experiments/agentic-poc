import { createHash, randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";
import { withMongoTransaction, type Database } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { createExecutionAllowanceLedger } from "@/db/experiment-execution-allowance";
import { m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import { experimentImageRequestSchema, imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { realImageResultSchema, verifyRealImageRequest } from "@/lib/experiment-runner/real-image-contract";
import { validateExperimentImage } from "@/lib/experiment-runner/image-validation";
import { verifyCurrentPageIllustrationSources } from "@/db/experiment-pages";
import { assertCurrentImageSources } from "@/db/experiment-images";
import { currentMutationOwnerId } from "@/lib/application/deployment-control";
import type { AssetStore } from "@/lib/assets/asset-store";
import { realExecutionPolicyFromM4TechnicalProfile, type ExecutionAllowance } from "@/lib/experiment-runner/execution-policy";
import { configurationSnapshot, selectBinding, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { diagnosticExecutionAmendment, operationConfiguration } from "@/lib/experiment-runner/execution-amendment";
import { createWorkflowRuntime, type WorkflowRuntime } from "@/lib/experiment-runner/transport";

function conflict(message: string): never { throw new ExperimentRepositoryError("conflict", message); }
const hash = (value: unknown) => m4Hash(m4CanonicalJson(value));
export function imageReplacementEvidence(run: ExperimentRunDocument, op: ExperimentOperationDocument) {
  return hash({ runId: run._id, profile: run.execution, configurationHash: run.configurationHash,
    operationId: op._id, workflowRunId: op.workflowRunId, verifiedWorkflowId: op.verifiedWorkflowId,
    deadlineAtMs: op.deadlineAtMs, inputFingerprint: op.inputFingerprint,
    imageRequestJson: op.imageRequestJson, sources: op.dependencyVersionIds,
    preparation: op.realImagePreparation, observation: op.realImageObservation, reservation: op.realImageReservation });
}

export async function hasApprovedImageReplacement(database: Database, session: ClientSession,
  run: ExperimentRunDocument, op: ExperimentOperationDocument) {
  const approval = op.imageReplacement && run.imageReplacementApprovals?.find(a => a.approvalId === op.imageReplacement!.approvalId);
  if (!approval || approval.operationId !== op._id || approval.replacementOperationId !== op.imageReplacement?.replacementOperationId ||
      approval.evidenceDigest !== imageReplacementEvidence(run, op) || approval.evidenceDigest !== op.imageReplacement.evidenceDigest ||
      op.state !== "unknown" || op.role !== "image" || op.remoteStatus !== "failed" && op.remoteStatus !== "stopped" ||
      op.authorizationClaim || op.resultFinalizationClaim || op.imageCompletionClaim || op.resultJson || op.materializationJson) return false;
  const next = await database.collections.experiment_operations.findOne({ _id: approval.replacementOperationId, runId: run._id }, { session });
  return !!next && next.replacesImageOperationId === op._id && next.subjectKind === op.subjectKind && next.subjectId === op.subjectId &&
    next.inputFingerprint === op.inputFingerprint && next.imageRequestJson === op.imageRequestJson && next.attempt === op.attempt + 1;
}

export function createImageReplacementService(deps: { database: Database; config: BookletRunnerConfig; store: AssetStore;
  runtime?: WorkflowRuntime; now?: () => number }) {
  const db = deps.database, now = deps.now ?? Date.now, ledger = createExecutionAllowanceLedger(db);
  const runtime = deps.runtime ?? createWorkflowRuntime(deps.config);
  function amendment(run: ExperimentRunDocument, reference: string) {
    const real = deps.config.real;
    if (real?.state !== "ready") conflict("Reviewed Real configuration is unavailable.");
    const profile = realExecutionPolicyFromM4TechnicalProfile(real.sourcePolicy, real.tokenPolicy,
      real.bindings.map(({ apiKey: _key, ...binding }) => { void _key; return binding; }), real);
    return diagnosticExecutionAmendment(run, profile, m4CanonicalJson(configurationSnapshot(deps.config, run.persona, "real")), reference, now());
  }
  async function state(session: ClientSession, runId: string, operationId: string) {
    const run = await db.collections.experiment_runs.findOne({ _id: runId }, { session });
    const op = await db.collections.experiment_operations.findOne({ _id: operationId, runId }, { session });
    if (!run?.execution || run.mode !== "real" || run.status !== "blocked" || run.safeFailure !== "unknown_outcome" ||
        !(run.activeOperationId === operationId || run.activeOperationId === null && run.imageReplacementParking?.operationId === operationId) ||
        run.preparation || run.pendingApproval || run.allowanceAdjustment || !op ||
        op.role !== "image" || op.providerKind !== "image" || op.state !== "unknown" || !op.workflowRunId ||
        !op.verifiedWorkflowId || !op.deadlineAtMs || op.deadlineAtMs >= now() || op.reservationCount !== 1 ||
        !op.realImagePreparation || !op.realImageObservation || !op.realImageReservation ||
        op.imageReplacement || op.resultJson || op.materializationJson ||
        op.authorizationClaim || op.resultFinalizationClaim || op.imageCompletionClaim) conflict("Image replacement requires a terminal unknown attempt with no active owner or saved image.");
    const observation = realImageResultSchema.parse(JSON.parse(op.realImageObservation.resultJson));
    if (observation.status !== "unknown_outcome" || !observation.dispatchStarted || observation.output || observation.usage ||
        op.realImageReservation.settledMicrodollars !== null || op.realImageReservation.unsettledMicrodollars !== op.realImageReservation.planningHoldMicrodollars) conflict("Original image liability is not intact.");
    const controls = await db.collections.deployment_control.find({ "mutationOwners.runId": runId }, { session }).toArray();
    if (controls.some(c => c.mutationOwners?.some(o => o.runId === runId && o.id !== currentMutationOwnerId()))) conflict("Another mutation owns the run.");
    const others = await db.collections.experiment_operations.find({ runId, _id: { $ne: operationId }, $or: [
      { state: { $in: ["prepared", "started", "unknown"] } }, { authorizationClaim: { $ne: null } },
      { resultFinalizationClaim: { $ne: null } }, { imageCompletionClaim: { $ne: null } }] }, { session }).toArray();
    for (const other of others) if (!await hasApprovedImageReplacement(db, session, run, other)) conflict("Other unresolved work prevents replacement.");
    if (await db.collections.assets.findOne({ _id: operationId }, { session })) conflict("Original image already has saved bytes.");
    const request = experimentImageRequestSchema.parse(JSON.parse(op.imageRequestJson ?? "null"));
    if (imageRequestFingerprint(request) !== op.inputFingerprint) conflict("Saved image request differs.");
    const alreadySaved = await db.collections.experiment_operations.findOne({ runId, role: "image", state: "succeeded",
      inputFingerprint: op.inputFingerprint, subjectId: op.subjectId }, { session, projection: { _id: 1 } });
    if (alreadySaved) conflict("The target image already has a completed attempt.");
    const originalRequest = verifyRealImageRequest(JSON.parse(op.realImagePreparation.requestJson));
    for (const reference of originalRequest.references) {
      const asset = await db.collections.assets.findOne({ _id: reference.assetId, bookletId: run.bookletId }, { session });
      const version = await db.collections.artifact_versions.findOne({ _id: reference.versionId }, { session });
      const artifact = version && await db.collections.artifacts.findOne({ _id: version.artifactId, experimentRunId: run._id,
        currentVersionId: version._id, state: "approved" }, { session });
      if (!asset || !artifact) conflict("An original reference is missing or no longer current.");
      const bytes = await deps.store.get(asset.uri), image = await validateExperimentImage(bytes);
      if (image.sha256 !== reference.sha256 || image.byteLength !== reference.byteLength || image.mimeType !== reference.mimeType ||
          image.width !== reference.width || image.height !== reference.height) conflict("Original reference bytes changed.");
    }
    if (op.taskId === "J13") {
      if (await db.collections.artifacts.findOne({ experimentRunId: runId, taskId: "J13", subjectId: op.subjectId, currentVersionId: { $ne: null } }, { session })) conflict("The target page already has a saved image.");
      const sources = await verifyCurrentPageIllustrationSources(db, session, run, op.subjectId, deps.store);
      if (hash(sources.request.request) !== hash(request)) conflict("Approved image sources changed.");
    } else await assertCurrentImageSources(db, session, run, request);
    const campaign = await ledger.current(session, run.execution.campaignId, run);
    if (run.imageReplacementParking?.operationId === op._id && run.imageReplacementParking.evidenceDigest !== imageReplacementEvidence(run, op)) conflict("Parked image evidence changed.");
    return { run, op, campaign, evidenceDigest: imageReplacementEvidence(run, op) };
  }
  async function observe(run: ExperimentRunDocument, op: ExperimentOperationDocument) {
    const current = selectBinding(deps.config, "image", null, run.persona, run.mode);
    const original = operationConfiguration(run, op).find(b => b.role === "image" && b.taskId === null);
    if (!original || original.appId !== current.appId || original.publishedWorkflowId !== op.verifiedWorkflowId) conflict("Original image publication is unavailable for inspection.");
    const binding = { ...current, publishedWorkflowId: original.publishedWorkflowId };
    const result = await runtime.retrieve(binding, op.workflowRunId!, { deadlineAtMs: now() + 30_000 });
    if (result.kind !== "execution" || result.execution.id !== op.workflowRunId || result.execution.workflow_id !== op.verifiedWorkflowId ||
        !["failed", "stopped"].includes(result.execution.status) || Object.keys(result.execution.outputs ?? {}).length) conflict("Original execution is not proven terminal without a result.");
    return result.execution.status;
  }
  async function preview(runId: string, operationId: string) {
    const saved = await withMongoTransaction(db, session => state(session, runId, operationId));
    const terminalStatus = await observe(saved.run, saved.op);
    const update = amendment(saved.run, "Replacement preview");
    const expiresAtMs = now() + 300_000;
    return { runId, operationId, expectedRevision: saved.run.revision, expectedCampaignRevision: saved.campaign.revision,
      evidenceDigest: saved.evidenceDigest, previewDigest: hash({ evidence: saved.evidenceDigest, campaignRevision: saved.campaign.revision, amendmentId: update?.id ?? null, expiresAtMs }),
      executionAmendment: update ? { id: update.id, baseProfileHash: update.baseProfileHash, profileHash: update.profileHash,
        publications: JSON.parse(update.configurationJson) } : null,
      expiresAtMs, terminalStatus, target: { taskId: saved.op.taskId, subjectId: saved.op.subjectId },
      retainedLiabilityMicrodollars: saved.op.realImageReservation!.unsettledMicrodollars,
      totals: saved.campaign.allowance, settledMicrodollars: saved.campaign.settledMicrodollars, reservedMicrodollars: saved.campaign.reservedMicrodollars };
  }
  async function approve(input: { runId: string; operationId: string; approvalId: string; reference: string;
    previewDigest: string; expiresAtMs: number; expectedRevision: number; expectedCampaignRevision: number;
    acknowledgeUnknownCharge: true; totals?: ExecutionAllowance }) {
    if (input.acknowledgeUnknownCharge !== true || !input.reference.trim()) conflict("Explicit approval of the unknown charge is required.");
    const requestDigest = hash(input);
    const existingRun = await db.collections.experiment_runs.findOne({ _id: input.runId });
    const existing = existingRun?.imageReplacementApprovals?.find(a => a.approvalId === input.approvalId);
    if (existing) { if (existing.requestDigest !== requestDigest) conflict("Approval key has different terms."); return { ...existing, reused: true }; }
    if (input.expiresAtMs <= now() || input.expiresAtMs > now() + 300_000) conflict("Replacement preview expired; refresh it.");
    const before = await withMongoTransaction(db, session => state(session, input.runId, input.operationId));
    const terminalStatus = await observe(before.run, before.op);
    try { return await withMongoTransaction(db, async session => {
      const repeated = (await db.collections.experiment_runs.findOne({ _id: input.runId }, { session }))?.imageReplacementApprovals?.find(a => a.approvalId === input.approvalId);
      if (repeated) {
        if (repeated.requestDigest !== requestDigest) conflict("Approval key has different terms.");
        return { ...repeated, reused: true };
      }
      const saved = await state(session, input.runId, input.operationId);
      let { run, campaign } = saved;
      const { op, evidenceDigest } = saved;
      const update = amendment(run, input.reference);
      if (run.revision !== input.expectedRevision || campaign.revision !== input.expectedCampaignRevision ||
          hash({ evidence: evidenceDigest, campaignRevision: campaign.revision, amendmentId: update?.id ?? null, expiresAtMs: input.expiresAtMs }) !== input.previewDigest) conflict("Replacement preview changed; refresh it.");
      if (input.totals && hash(input.totals) !== hash(campaign.allowance)) {
        await ledger.adjust(session, { runId: run._id, approvalId: input.approvalId, reference: input.reference,
          expectedRunRevision: run.revision, expectedCampaignRevision: campaign.revision, totals: input.totals, nowMs: now() });
        run = (await db.collections.experiment_runs.findOne({ _id: run._id }, { session }))!;
        campaign = await ledger.current(session, run.execution!.campaignId, run);
      }
      if (campaign.allowance.imageCalls <= run.counters.logicalImage || campaign.allowance.steps <= run.counters.steps ||
          campaign.allowance.maxMicrodollars <= campaign.reservedMicrodollars + campaign.settledMicrodollars) conflict("Approve sufficient additional allowance before replacing this image.");
      const replacementOperationId = randomUUID();
      const replacement: ExperimentOperationDocument = { _id: replacementOperationId, runId: run._id, role: "image", taskId: op.taskId,
        subjectKind: op.subjectKind, subjectId: op.subjectId, mode: "real", providerKind: "image", state: "prepared",
        attempt: op.attempt + 1, inputFingerprint: op.inputFingerprint, imageRequestJson: op.imageRequestJson,
        expectedTargetVersionId: op.expectedTargetVersionId, dependencyVersionIds: op.dependencyVersionIds,
        parentWorkflowRunId: op.parentWorkflowRunId, idempotencyKey: createHash("sha256").update(`replacement:${input.approvalId}`).digest("hex"),
        workflowRunId: null, reservationCount: 0, deadlineAtMs: now() + 300_000,
        resultJson: null, resultDigest: null, materializationJson: null, warningsJson: "[]", safeFailure: null,
        replacesImageOperationId: op._id, createdAtMs: now(), updatedAtMs: now(),
        ...(update ? { executionAmendmentId: update.id } : {}),
        lifecycle: { startedAtMs: now(), ownerId: randomUUID(), phase: "preparing", lastProgressAtMs: now() } };
      await db.collections.experiment_operations.insertOne(replacement, { session });
      const linked = await db.collections.experiment_operations.updateOne({ _id: op._id, runId: run._id, imageReplacement: { $exists: false } },
        { $set: { remoteStatus: terminalStatus as "failed" | "stopped", imageReplacement: { approvalId: input.approvalId, replacementOperationId, evidenceDigest } } }, { session });
      if (linked.modifiedCount !== 1) conflict("Original attempt changed before replacement approval.");
      const approval = { approvalId: input.approvalId, operationId: op._id, replacementOperationId, reference: input.reference,
        requestDigest, evidenceDigest, approvedAtMs: now(),
        ...await (async () => {
          if (op.taskId !== "J13") return {};
          const jobs = (await db.collections.generation_jobs.find({ bookletId: run.bookletId, jobType: "dify_pages",
            status: { $in: ["pending", "running", "paused", "unknown", "partial"] } }, { session }).toArray())
            .filter(job => JSON.parse(job.inputJson).runId === run._id);
          if (jobs.length !== 1) conflict("Replacement requires one retained page batch.");
          const items = await db.collections.generation_items.find({ jobId: jobs[0]._id, itemKey: op.subjectId }, { session }).toArray();
          if (items.length !== 1 || !items[0].resultJson || !["running", "unknown"].includes(items[0].status) || items[0].assetId) conflict("Page batch ownership changed.");
          const item = items[0], prior = JSON.parse(item.resultJson!);
          if (prior.operationId !== op._id || prior.assetId || prior.pageVersionId) conflict("Page batch does not own the original unknown image.");
          const bound = await db.collections.generation_items.updateOne({ _id: item._id, resultJson: item.resultJson }, { $set: {
            status: "running", startedAtMs: now(), finishedAtMs: null,
            resultJson: JSON.stringify({ ...prior, operationId: replacementOperationId,
              replacedOperationIds: [...prior.replacedOperationIds ?? [], op._id] }) }, $inc: { attemptCount: 1 } }, { session });
          if (bound.modifiedCount !== 1) conflict("Page batch changed before replacement approval.");
          await db.collections.generation_jobs.updateOne({ _id: jobs[0]._id }, { $set: { status: "running", updatedAtMs: now() } }, { session });
          return { batch: { itemId: item._id, previousStatus: item.status, previousResultJson: item.resultJson! } };
        })() };
      const updated = await db.collections.experiment_runs.updateOne({ _id: run._id, revision: run.revision, activeOperationId: run.activeOperationId },
        { $set: { activeOperationId: replacementOperationId, status: "queued", pauseRequested: false, safeFailure: null, updatedAtMs: now() },
          $inc: { revision: 1 }, $push: { imageReplacementApprovals: approval,
            ...(update && !run.executionAmendments?.some(a => a.id === update.id) ? { executionAmendments: update } : {}) } }, { session });
      if (updated.modifiedCount !== 1) conflict("Run ownership changed before approval.");
      return { ...approval, reused: false };
    }); } catch (error) {
      // A concurrent identical approval can hit the unique operation key before
      // Mongo labels the transaction retryable. Reconcile its committed receipt.
      const row = await db.collections.experiment_runs.findOne({ _id: input.runId }).catch(() => null);
      const saved = row?.imageReplacementApprovals?.find(a => a.approvalId === input.approvalId);
      if (saved && saved.requestDigest === requestDigest) return { ...saved, reused: true };
      throw error;
    }
  }
  return { preview, approve };
}
