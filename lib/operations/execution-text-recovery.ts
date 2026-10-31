import { createHash } from "node:crypto";
import type { ClientSession } from "mongodb";
import { withMongoTransaction, type Database } from "@/db/client";
import { closeExecutionTextFailure, hasExecutionTextFailure } from "@/db/experiment-execution-text-failure";
import { verifyExecutionAccounting } from "@/db/experiment-execution-accounting";
import { verifyMongoStructure } from "@/db/setup";
import { savedConfigurationSchema, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { createWorkflowRuntime, type WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { BOOKLET_RECOVERY_CONTRACT, BookletRecoveryError, recoveryDigest,
  type RecoverySnapshot, type RecoveryTarget } from "@/lib/operations/booklet-recovery";
import { inspectRecoveryWork } from "@/lib/operations/recovery-inspection";

const retained = Object.freeze({ runId: "f811de3a-f4af-4b9e-88a7-7d8d597c5d21",
  operationId: "b48a84f9-ef4f-48b3-b353-87b6790d1dcf",
  profileHash: "9fab201953ff06cba920713dded4a8f623f28fa44fbeb9fc34bf6a7390a80f8e" });
const scope = "execution-text-failure-target-v1" as const;
function requireProof(value: unknown, code: string): asserts value {
  if (!value) throw new BookletRecoveryError(code);
}
const omit = (value: object, keys: string[]) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

/** Exact retained manager closure. The host owns admission, backup and process quiescence. */
export function createExecutionTextFailureRecovery(deps: { database: Database; config: BookletRunnerConfig;
  runtime?: WorkflowRuntime; now?: () => number }) {
  const { database, config } = deps, c = database.collections;
  const now = deps.now ?? Date.now;
  const runtime = deps.runtime ?? createWorkflowRuntime(config, (url, init) => {
    requireProof((init?.method ?? "GET") === "GET", "provider_mutation_forbidden");
    return fetch(url, { ...init, redirect: "error" });
  });
  function targetIdentity(target: RecoveryTarget) {
    requireProof(target.runId === retained.runId && target.operationId === retained.operationId &&
      Number.isSafeInteger(target.expectedRevision) && target.expectedRevision >= 0, "unsupported_execution_target");
  }
  async function state(target: RecoveryTarget, session?: ClientSession) {
    targetIdentity(target);
    const run = await c.experiment_runs.findOne({ _id: target.runId }, { session });
    const op = await c.experiment_operations.findOne({ _id: target.operationId, runId: target.runId }, { session });
    requireProof(run && op && run.execution?.profileHash === retained.profileHash &&
      run.mode === "real" && run.persona === "playful_kid" && !run.generationCompletedAtMs && !run.preparation &&
      op.role === "manager" && op.providerKind === "text" && op.m4Observation?.issue === "provider_failure" &&
      op.deadlineAtMs != null && op.deadlineAtMs < now() &&
      !op.authorizationClaim && !op.resultFinalizationClaim && !op.imageCompletionClaim, "unsupported_execution_state");
    requireProof(!await c.generation_jobs.findOne({ bookletId: run.bookletId, jobType: "dify_pages" }, { session, projection: { _id: 1 } }),
      "unexpected_page_batch");
    const campaign = await c.experiment_campaigns.findOne({ _id: run.execution.campaignId }, { session });
    const booklet = await c.booklets.findOne({ _id: run.bookletId }, { session });
    requireProof(campaign && booklet, "target_missing");
    return { run, op, campaign, booklet };
  }
  async function failureProof(target: RecoveryTarget, completed: boolean) {
    return withMongoTransaction(database, async session => {
      const current = await state(target, session);
      const { run, op } = current;
      requireProof(run.revision === target.expectedRevision + (completed ? 1 : 0), "revision_changed");
      requireProof(await hasExecutionTextFailure(database, session, run, op, now()), "execution_failure_unverified");
      if (completed) {
        requireProof(run.status === "blocked" && run.safeFailure === "definite_failure" && run.pauseRequested && !run.activeOperationId &&
          op.state === "failed" && op.safeFailure === "definite_failure" && op.lifecycle?.phase === "finished" &&
          op.lifecycle.attemptOutcome === "failed" && op.lifecycle.unresolved === false, "execution_closure_unverified");
        await verifyExecutionAccounting(database, session, run);
      } else requireProof(run.status === "blocked" && run.activeOperationId === op._id && ["started", "unknown"].includes(op.state),
        "unsupported_execution_owner");
      return current;
    });
  }
  async function quiet(target: RecoveryTarget, closed: boolean) {
    const report = await inspectRecoveryWork(database, { environment: "_staging", nowMs: now(),
      validatedTargets: [{ runId: target.runId, operationId: target.operationId }] });
    if (report.outcome === "inspection_error") throw new BookletRecoveryError("inspection_error",
      report.inspectionError?.stage, report.inspectionError?.errorKind);
    requireProof(report.outcome === "clear", "other_work");
    requireProof(report.admission?.maintenance === closed && !report.admission.draining, "admission_changed");
  }
  async function observe(target: RecoveryTarget) {
    const { run, op } = await state(target);
    const saved = savedConfigurationSchema.parse(JSON.parse(run.configurationJson)).find(binding => binding.role === "manager" && binding.taskId === null);
    const credentials = [...config.bindings, ...(config.real?.bindings ?? [])].filter(binding => binding.appId === saved?.appId);
    requireProof(saved && credentials.length > 0 && credentials.every(binding => binding.apiKey === credentials[0].apiKey) &&
      saved.publishedWorkflowId === op.verifiedWorkflowId && op.workflowRunId, "saved_publication_unavailable");
    const binding = { ...credentials[0], ...saved, taskId: null, persona: null };
    const result = await runtime.retrieve(binding, op.workflowRunId, { deadlineAtMs: now() + 20_000 });
    requireProof(result.kind === "execution" && result.execution.id === op.workflowRunId &&
      result.execution.workflow_id === op.verifiedWorkflowId && result.execution.status === op.m4Observation?.remoteStatus &&
      (!op.workflowTaskId || !result.execution.task_id || result.execution.task_id === op.workflowTaskId), "remote_evidence_changed");
    const wrapper = result.execution.outputs?.booklet_provider_result;
    requireProof(typeof wrapper === "string" && createHash("sha256").update(wrapper).digest("hex") === op.m4Observation?.wrapperDigest,
      "remote_evidence_changed");
  }
  async function snapshot(target: RecoveryTarget, session?: ClientSession): Promise<RecoverySnapshot> {
    const { run, op, campaign, booklet } = await state(target, session);
    const fingerprint = (rows: { _id: string }[]) => Object.fromEntries(rows.map(row => [row._id, recoveryDigest(row)]));
    // Reads are sequential so the same snapshot can be checked inside Mongo's transaction.
    const reservations = await c.experiment_operations.find({ runId: run._id }, { session, projection: { _id: 1, runId: 1,
      providerKind: 1, reservationCount: 1, m4Reservation: 1, realImageReservation: 1,
      executionAllowanceCancellation: 1 } }).sort({ _id: 1 }).toArray();
    const artifacts = await c.artifacts.find({ bookletId: run.bookletId }, { session, projection: { _id: 1, bookletId: 1,
      taskId: 1, subjectKind: 1, subjectId: 1, currentVersionId: 1, state: 1, experimentRunId: 1 } }).sort({ _id: 1 }).toArray();
    const approvals = await c.approvals.find({ bookletId: run.bookletId }, { session }).sort({ _id: 1 }).toArray();
    const assets = await c.assets.find({ bookletId: run.bookletId }, { session, projection: { _id: 1, bookletId: 1,
      uri: 1, kind: 1, mimeType: 1, width: 1, height: 1, metadataJson: 1 } }).sort({ _id: 1 }).toArray();
    const versions = await c.artifact_versions.find({ artifactId: { $in: artifacts.map(row => row._id) } },
      { session, projection: { _id: 1, artifactId: 1, versionNumber: 1, schemaVersion: 1, sourceOperationId: 1,
        dependencyVersionIdsJson: 1, sourceVersionId: 1, sourceExecutionBatchId: 1, createdAtMs: 1 } }).sort({ _id: 1 }).toArray();
    const dependencies = await c.artifact_dependencies.find({ downstreamVersionId: { $in: versions.map(row => row._id) } },
      { session, projection: { _id: 1, upstreamVersionId: 1, downstreamVersionId: 1 } }).sort({ _id: 1 }).toArray();
    const rows = { experiment_runs: { [run._id]: recoveryDigest(run) }, experiment_operations: { [op._id]: recoveryDigest(op) },
      experiment_campaigns: { [campaign._id]: recoveryDigest(campaign) }, booklets: { [booklet._id]: recoveryDigest(booklet) },
      reservations: fingerprint(reservations), artifacts: fingerprint(artifacts), artifact_versions: fingerprint(versions),
      artifact_dependencies: fingerprint(dependencies), approvals: fingerprint(approvals), assets: fingerprint(assets) };
    return { scope, rows, campaignId: campaign._id, bookletId: booklet._id,
      runInvariant: recoveryDigest(omit(run, ["revision", "updatedAtMs", "activeOperationId", "safeFailure", "status", "pauseRequested"])),
      operationInvariant: recoveryDigest(omit(op, ["state", "remoteStatus", "lifecycle", "safeFailure", "updatedAtMs"])),
      campaignInvariant: recoveryDigest(campaign), bookletInvariant: recoveryDigest(booklet), countersDigest: recoveryDigest(run.counters),
      deadlineAtMs: op.deadlineAtMs!, requestDigest: op.m4Preparation!.requestDigest,
      evidenceDigest: op.m4Observation!.evidenceDigest!, wrapperDigest: op.m4Observation!.wrapperDigest!,
      lifecycleOrigin: recoveryDigest(omit(op.lifecycle!, ["phase", "attemptOutcome", "unresolved", "endedAtMs", "lastProgressAtMs"])),
      priorEndedAtMs: op.lifecycle!.endedAtMs ?? null, priorTimeoutAtMs: op.lifecycle!.timeoutAtMs ?? null };
  }
  const digest = (target: RecoveryTarget, value: RecoverySnapshot) => recoveryDigest({ target, snapshot: value, authority: retained });
  async function prepare(target: RecoveryTarget, closed: boolean, expected?: string) {
    await verifyMongoStructure(database);
    await failureProof(target, false);
    await quiet(target, closed);
    const before = await snapshot(target);
    await observe(target);
    await quiet(target, closed);
    const after = await snapshot(target);
    requireProof(recoveryDigest(before) === recoveryDigest(after), "state_changed");
    const proof = { contract: BOOKLET_RECOVERY_CONTRACT, previewDigest: digest(target, after), snapshot: after };
    requireProof(expected === undefined || expected === proof.previewDigest, "preview_changed");
    return proof;
  }
  async function preview(target: RecoveryTarget, closed = false) { return prepare(target, closed); }
  async function verifyCompleted(target: RecoveryTarget, before: RecoverySnapshot) {
    requireProof(before.scope === scope, "snapshot_scope_unsupported");
    const { op } = await failureProof(target, true);
    await observe(target);
    const after = await snapshot(target);
    for (const key of ["runInvariant", "operationInvariant", "campaignInvariant", "bookletInvariant", "countersDigest", "deadlineAtMs",
      "requestDigest", "evidenceDigest", "wrapperDigest", "lifecycleOrigin", "priorTimeoutAtMs"] as const)
      requireProof(after[key] === before[key], "preservation_mismatch");
    requireProof(before.priorEndedAtMs === null || op.lifecycle!.endedAtMs === before.priorEndedAtMs, "attempt_history_changed");
    for (const name of Object.keys(before.rows)) {
      requireProof(recoveryDigest(Object.keys(after.rows[name])) === recoveryDigest(Object.keys(before.rows[name])), "inventory_changed");
      for (const [id, row] of Object.entries(before.rows[name])) {
        if (name === "experiment_runs" && id === target.runId || name === "experiment_operations" && id === target.operationId) continue;
        requireProof(after.rows[name][id] === row, "retained_data_changed");
      }
    }
    await quiet(target, true);
    return { verified: true as const, outcome: "failure_closed" as const, accounting: "preserved" as const,
      admission: "closed" as const, runId: target.runId, operationId: target.operationId, providerPosts: 0 };
  }
  async function apply(target: RecoveryTarget, expected: string,
    checkpoint: (proof: { contract: string; previewDigest: string; snapshot: RecoverySnapshot }) => Promise<void>) {
    const proof = await prepare(target, true, expected);
    await checkpoint(proof);
    await quiet(target, true);
    requireProof(await closeExecutionTextFailure(database, { ...target, nowMs: now(), validate: async (session, run, op) => {
      await state(target, session);
      const control = await c.deployment_control.findOne({ environment: "_staging" }, { session });
      requireProof(control?.maintenance && !control.draining && control.activeMutations === 0 &&
        (control.interruptedMutations ?? 0) === 0 && !(control.mutationOwners ?? []).length &&
        recoveryDigest(run) === proof.snapshot.rows.experiment_runs[run._id] &&
        recoveryDigest(op) === proof.snapshot.rows.experiment_operations[op._id], "state_changed");
      const campaign = await c.experiment_campaigns.findOne({ _id: proof.snapshot.campaignId }, { session });
      const booklet = await c.booklets.findOne({ _id: proof.snapshot.bookletId }, { session });
      requireProof(recoveryDigest(campaign) === proof.snapshot.campaignInvariant && recoveryDigest(booklet) === proof.snapshot.bookletInvariant,
        "state_changed");
      requireProof(recoveryDigest(await snapshot(target, session)) === recoveryDigest(proof.snapshot), "state_changed");
    }, validateAfter: (session, run) => verifyExecutionAccounting(database, session, run) }), "execution_closure_failed");
    return proof;
  }
  async function verifyUnapplied(target: RecoveryTarget, expected: string) {
    await failureProof(target, false);
    await quiet(target, true);
    requireProof(digest(target, await snapshot(target)) === expected, "state_changed");
    return { verified: true as const, outcome: "unapplied" as const, admission: "closed" as const, providerPosts: 0 };
  }
  const unsupported = async (): Promise<never> => { throw new BookletRecoveryError("unsupported_execution_claim_release"); };
  return { preview, apply, verifyCompleted, verifyUnapplied,
    previewClaimRelease: unsupported, applyClaimRelease: unsupported, verifyClaimRelease: unsupported };
}
