import { withMongoTransaction, type Database } from "@/db/client";
import { createImageReplacementService, imageReplacementEvidence } from "@/db/experiment-image-replacement";
import { createAssetStore } from "@/lib/assets/create-asset-store";
import type { AssetStore } from "@/lib/assets/asset-store";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import type { WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { inspectRecoveryWork } from "@/lib/operations/recovery-inspection";
import { BOOKLET_RECOVERY_CONTRACT, BookletRecoveryError, recoveryDigest,
  type RecoverySnapshot, type RecoveryTarget } from "@/lib/operations/booklet-recovery";

function requireProof(value: unknown, code: string): asserts value { if (!value) throw new BookletRecoveryError(code); }
const omit = (value: object, keys: string[]) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

/** Deployment preparation only. No reservation, allowance grant or replacement is created. */
export function createImageReplacementParkingRecovery(deps: { database: Database; config: BookletRunnerConfig;
  runtime?: WorkflowRuntime; store?: AssetStore; now?: () => number }) {
  const db = deps.database, c = db.collections, now = deps.now ?? Date.now;
  const replacement = createImageReplacementService({ ...deps, store: deps.store ?? createAssetStore() });
  async function quiet(target: RecoveryTarget, closed: boolean, parked: boolean) {
    const op = await c.experiment_operations.findOne({ _id: target.operationId, runId: target.runId });
    const run = await c.experiment_runs.findOne({ _id: target.runId });
    requireProof(run && op, "image_parking_target_missing");
    let batch: { generationJobId: string; generationItemId: string } | undefined;
    if (op.taskId === "J13") {
      const jobs = (await c.generation_jobs.find({ bookletId: run.bookletId, jobType: "dify_pages" }).toArray())
        .filter(job => JSON.parse(job.inputJson).runId === run._id && ["running", "paused", "unknown", "partial", "pending"].includes(job.status));
      requireProof(jobs.length === 1, "image_batch_ownership_changed");
      const items = await c.generation_items.find({ jobId: jobs[0]._id, itemKey: op.subjectId }).toArray();
      requireProof(items.length === 1 && items[0].resultJson && ["running", "unknown"].includes(items[0].status) && !items[0].assetId,
        "image_batch_ownership_changed");
      const result = JSON.parse(items[0].resultJson!);
      requireProof(result.operationId === op._id && !result.assetId && !result.pageVersionId, "image_batch_ownership_changed");
      batch = { generationJobId: jobs[0]._id, generationItemId: items[0]._id };
    }
    const report = await inspectRecoveryWork(db, { environment: "_staging", nowMs: now(),
      validatedTargets: [{ runId: target.runId, operationId: target.operationId, parked, ...batch }] });
    requireProof(report.outcome === "clear", "other_work");
    requireProof(report.admission?.maintenance === closed && !report.admission.draining, "admission_changed");
  }
  async function snapshot(target: RecoveryTarget): Promise<RecoverySnapshot> {
    const run = await c.experiment_runs.findOne({ _id: target.runId });
    const op = await c.experiment_operations.findOne({ _id: target.operationId, runId: target.runId });
    requireProof(run?.execution && op?.realImagePreparation && op.realImageObservation && op.realImageReservation, "image_parking_target_missing");
    const campaign = await c.experiment_campaigns.findOne({ _id: run.execution.campaignId });
    const booklet = await c.booklets.findOne({ _id: run.bookletId });
    requireProof(campaign && booklet, "image_parking_target_missing");
    const artifacts = await c.artifacts.find({ experimentRunId: run._id }).toArray();
    const versions = await c.artifact_versions.find({ artifactId: { $in: artifacts.map(a => a._id) } }).toArray();
    const jobs = await c.generation_jobs.find({ bookletId: run.bookletId }).toArray();
    const inventory = {
      experiment_runs: [run], experiment_operations: await c.experiment_operations.find({ runId: run._id }).toArray(),
      experiment_campaigns: [campaign], booklets: [booklet], artifacts, artifact_versions: versions,
      artifact_dependencies: await c.artifact_dependencies.find({ downstreamVersionId: { $in: versions.map(v => v._id) } }).toArray(),
      approvals: await c.approvals.find({ experimentRunId: run._id }).toArray(), assets: await c.assets.find({ bookletId: run.bookletId }).toArray(),
      messages: await c.messages.find({ bookletId: run.bookletId }).toArray(),
      experiment_delegations: await c.experiment_delegations.find({ runId: run._id }).toArray(),
      generation_jobs: jobs, generation_items: await c.generation_items.find({ jobId: { $in: jobs.map(j => j._id) } }).toArray(),
    };
    return { scope: "image-replacement-parking-v1", rows: Object.fromEntries(Object.entries(inventory).map(([name, rows]) =>
      [name, Object.fromEntries(rows.map(row => [row._id, recoveryDigest(row)]))])),
      runInvariant: recoveryDigest(omit(run, ["revision", "activeOperationId", "pauseRequested", "updatedAtMs", "imageReplacementParking"])),
      operationInvariant: recoveryDigest(op), campaignInvariant: recoveryDigest(campaign), bookletInvariant: recoveryDigest(booklet),
      campaignId: campaign._id, bookletId: booklet._id, countersDigest: recoveryDigest(run.counters), deadlineAtMs: op.deadlineAtMs!,
      requestDigest: op.realImagePreparation.requestDigest, evidenceDigest: imageReplacementEvidence(run, op),
      wrapperDigest: op.realImageObservation.resultDigest, lifecycleOrigin: recoveryDigest(op.lifecycle),
      priorEndedAtMs: op.lifecycle?.endedAtMs ?? null, priorTimeoutAtMs: op.lifecycle?.timeoutAtMs ?? null };
  }
  const digest = (target: RecoveryTarget, saved: RecoverySnapshot) => recoveryDigest({ contract: BOOKLET_RECOVERY_CONTRACT, target, saved });
  async function preview(target: RecoveryTarget, closed = false) {
    const inspected = await replacement.preview(target.runId, target.operationId);
    requireProof(inspected.expectedRevision === target.expectedRevision, "state_changed");
    const run = await c.experiment_runs.findOne({ _id: target.runId });
    requireProof(run?.activeOperationId === target.operationId && !run.imageReplacementParking, "image_parking_already_changed");
    await quiet(target, closed, false);
    const saved = await snapshot(target);
    return { contract: BOOKLET_RECOVERY_CONTRACT, previewDigest: digest(target, saved), snapshot: saved };
  }
  async function apply(target: RecoveryTarget, expected: string,
    checkpoint: (proof: { contract: string; previewDigest: string; snapshot: RecoverySnapshot }) => Promise<void>) {
    const proof = await preview(target, true);
    requireProof(proof.previewDigest === expected, "preview_changed");
    await checkpoint(proof);
    await quiet(target, true, false);
    await withMongoTransaction(db, async session => {
      const run = await c.experiment_runs.findOne({ _id: target.runId }, { session });
      const op = await c.experiment_operations.findOne({ _id: target.operationId, runId: target.runId }, { session });
      const control = await c.deployment_control.findOne({ environment: "_staging" }, { session });
      requireProof(run && op && recoveryDigest(run) === proof.snapshot.rows.experiment_runs[run._id] &&
        recoveryDigest(op) === proof.snapshot.operationInvariant && control?.maintenance && !control.draining &&
        control.activeMutations === 0 && (control.interruptedMutations ?? 0) === 0 && !control.mutationOwners?.length, "state_changed");
      const parked = await c.experiment_runs.updateOne({ _id: run._id, revision: target.expectedRevision, activeOperationId: op._id },
        { $set: { activeOperationId: null, pauseRequested: true, updatedAtMs: now(),
          imageReplacementParking: { operationId: op._id, evidenceDigest: proof.snapshot.evidenceDigest,
            originalRevision: target.expectedRevision, parkedAtMs: now() } }, $inc: { revision: 1 } }, { session });
      requireProof(parked.modifiedCount === 1, "image_parking_failed");
    });
    return proof;
  }
  async function verifyCompleted(target: RecoveryTarget, before: RecoverySnapshot) {
    requireProof(before.scope === "image-replacement-parking-v1", "snapshot_scope_unsupported");
    const inspected = await replacement.preview(target.runId, target.operationId);
    const run = await c.experiment_runs.findOne({ _id: target.runId });
    requireProof(run?.revision === target.expectedRevision + 1 && run.activeOperationId === null && run.pauseRequested &&
      run.imageReplacementParking?.operationId === target.operationId &&
      run.imageReplacementParking.originalRevision === target.expectedRevision && inspected.evidenceDigest === before.evidenceDigest,
    "image_parking_unverified");
    const after = await snapshot(target);
    for (const key of ["runInvariant", "operationInvariant", "campaignInvariant", "bookletInvariant", "countersDigest", "deadlineAtMs",
      "requestDigest", "evidenceDigest", "wrapperDigest", "lifecycleOrigin", "priorEndedAtMs", "priorTimeoutAtMs"] as const) {
      requireProof(after[key] === before[key], "preservation_mismatch");
    }
    for (const [name, rows] of Object.entries(before.rows)) {
      requireProof(recoveryDigest(Object.keys(rows).sort()) === recoveryDigest(Object.keys(after.rows[name]).sort()), "inventory_changed");
      if (name !== "experiment_runs") requireProof(recoveryDigest(rows) === recoveryDigest(after.rows[name]), "retained_data_changed");
    }
    await quiet(target, true, true);
    return { verified: true as const, outcome: "image_parked" as const, accounting: "preserved" as const,
      admission: "closed" as const, runId: target.runId, operationId: target.operationId, providerPosts: 0 };
  }
  async function verifyUnapplied(target: RecoveryTarget, expected: string) {
    requireProof((await preview(target, true)).previewDigest === expected, "state_changed");
    return { verified: true as const, outcome: "unapplied" as const, admission: "closed" as const, providerPosts: 0 };
  }
  const unsupported = async (): Promise<never> => { throw new BookletRecoveryError("image_parking_has_no_claim_release"); };
  return { preview, apply, verifyCompleted, verifyUnapplied,
    previewClaimRelease: unsupported, applyClaimRelease: unsupported, verifyClaimRelease: unsupported };
}
