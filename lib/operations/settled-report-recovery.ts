import type { Database } from "@/db/client";
import type { ExperimentOperationDocument } from "@/db/documents";
import { withMongoTransaction } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { verifyExecutionAccounting } from "@/db/experiment-execution-accounting";
import { hasApprovedImageReplacement } from "@/db/experiment-image-replacement";
import { verifyCurrentPaginationSources } from "@/db/experiment-pages";
import { createExperimentPageIllustrationAssembly } from "@/db/experiment-page-illustrations";
import { createVerificationAttempt } from "@/lib/experiment-runner/verification-attempt";
import type { AssetStore } from "@/lib/assets/asset-store";
import { createAssetStore } from "@/lib/assets/create-asset-store";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { operationConfiguration } from "@/lib/experiment-runner/execution-amendment";
import { m4ObservedRoleResult } from "@/lib/experiment-runner/m4-observed-result";
import { m4Hash } from "@/lib/experiment-runner/m4-request";
import { createWorkflowRuntime, type WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { BOOKLET_RECOVERY_CONTRACT, BookletRecoveryError, recoveryDigest,
  type RecoverySnapshot, type RecoveryTarget } from "@/lib/operations/booklet-recovery";
import { inspectRecoveryWork } from "@/lib/operations/recovery-inspection";
import { operationBudgetRemainingMs } from "@/lib/operations/budget";

const scope = "settled-report-completion-v1" as const;
const omit = (value: object, keys: string[]) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
function proof(value: unknown, code: string): asserts value { if (!value) throw new BookletRecoveryError(code); }

// Local database proofs include decimal cost estimates. They are not M4 wire
// requests: retain the repository's JSON ordering without changing its wire hash.
function reportJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    proof(item === null || ["string", "boolean"].includes(typeof item) ||
      typeof item === "number" && Number.isFinite(item) ||
      typeof item === "object" && (Array.isArray(item) || Object.getPrototypeOf(item) === Object.prototype),
    "snapshot_value_unsupported");
    if (Array.isArray(item)) proof(Object.keys(item).length === item.length, "snapshot_value_unsupported");
    return item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item;
  });
}
const reportDigest = (value: unknown) => m4Hash(reportJson(value));
const operationInvariant = (op: ExperimentOperationDocument) => reportDigest(omit(op,
  ["state", "lifecycle", "safeFailure", "updatedAtMs", "resultFinalizationClaim",
    "resultJson", "resultDigest", "materializationJson", "warningsJson"]));

// Reconstruct only candidate prefixes in memory. A caller must match the full
// original snapshot digest before accepting one. No diagnostic is removed from
// storage. Retention eviction, edits and unrelated changes cannot match it.
export function diagnosticAppendBaselines(op: ExperimentOperationDocument, nowMs: number) {
  const errors = op.externalErrors;
  if (!Array.isArray(errors) || errors.length === 0 || errors.length > 20 ||
      new Set(errors.map(error => error.id)).size !== errors.length) return [];
  const candidates: ExperimentOperationDocument[] = [];
  for (let length = errors.length - 1; length >= 0; length--) {
    const suffix = errors.slice(length);
    if (!suffix.every(error => error.schemaVersion === "booklet_external_error_v1" && error.service === "booklet" &&
      error.stage === "result_transaction" && error.attemptNumber === op.attempt &&
      Number.isFinite(Date.parse(error.timestamp)) && Date.parse(error.timestamp) >= op.updatedAtMs &&
      Date.parse(error.timestamp) <= nowMs)) continue;
    candidates.push({ ...op, externalErrors: errors.slice(0, length) });
    if (length === 0) {
      const absent = { ...op };
      delete absent.externalErrors;
      candidates.push(absent);
    }
  }
  return candidates;
}

// The existing candidate-recovery host owns admission, backup and quiescence.
// Only the original settled report can materialize. No provider POST is exposed.
export function createSettledReportRecovery(deps: { database: Database; config: BookletRunnerConfig;
  runtime?: WorkflowRuntime; store?: AssetStore; now?: () => number }) {
  const db = deps.database, c = db.collections, now = deps.now ?? Date.now;
  const runtime = deps.runtime ?? createWorkflowRuntime(deps.config, (url, init) => {
    proof((init?.method ?? "GET") === "GET", "provider_mutation_forbidden");
    return fetch(url, { ...init, redirect: "error" });
  });
  const repository = createExperimentRepository(db, { realExecutionEnabled: true,
    store: () => deps.store ?? createAssetStore() });

  async function state(target: RecoveryTarget, completed = false) {
    const [run, op] = await Promise.all([
      c.experiment_runs.findOne({ _id: target.runId }),
      c.experiment_operations.findOne({ _id: target.operationId, runId: target.runId }),
    ]);
    proof(run?.execution && run.mode === "real" && run.generationCompletedAtMs != null && !run.preparation &&
      !run.pendingApproval && !run.allowanceAdjustment && !run.pendingDecisionJson && op && op.mode === "real" &&
      ["tester", "judge"].includes(op.role) && op.taskId === null && op.subjectKind === "book" && op.subjectId === run.bookletId &&
      op.providerKind === "text" && op.realReportPreparation && op.m4Observation?.issue === null &&
      op.m4Observation.remoteStatus === "succeeded" && op.remoteStatus !== "failed" && op.remoteStatus !== "stopped" &&
      op.workflowRunId && op.verifiedWorkflowId &&
      op.reservationCount === 1 && op.m4Reservation?.settledMicrodollars != null &&
      op.deadlineAtMs != null && op.deadlineAtMs < now() &&
      !op.authorizationClaim && !op.resultFinalizationClaim && !op.imageCompletionClaim, "settled_report_ineligible");
    proof(run.revision === target.expectedRevision + (completed ? 1 : 0), "revision_changed");
    proof(completed ? run.status === "paused" && run.pauseRequested && !run.safeFailure && !run.activeOperationId &&
      op.state === "succeeded" && op.resultJson && op.materializationJson && !op.safeFailure && op.lifecycle?.unresolved === false
      : run.status === "blocked" && run.safeFailure === "unknown_outcome" && run.activeOperationId === op._id &&
        ["started", "unknown"].includes(op.state) && !op.resultJson && !op.resultDigest && !op.materializationJson,
    "settled_report_owner_changed");
    const result = m4ObservedRoleResult(run, op);
    if (completed) proof(op.resultJson === reportJson(result) && op.resultDigest === m4Hash(op.resultJson) &&
      JSON.parse(op.materializationJson!).reportRole === op.role, "settled_report_result_changed");
    return { run, op, result };
  }
  async function quiet(target: RecoveryTarget, closed: boolean, completed = false) {
    const { run } = await state(target, completed);
    const targets = [{ runId: run._id, operationId: target.operationId }];
    // Explicitly approved superseded images keep their unknown liabilities.
    // Their existing proof, not a broad run exclusion, permits this inspection.
    await withMongoTransaction(db, async session => {
      const originals = await c.experiment_operations.find({ runId: run._id, imageReplacement: { $exists: true } }, { session }).toArray();
      for (const original of originals) {
        proof(await hasApprovedImageReplacement(db, session, run, original), "replacement_proof_changed");
        targets.push({ runId: run._id, operationId: original._id });
      }
    });
    const report = await inspectRecoveryWork(db, { environment: "_staging", nowMs: now(), validatedTargets: targets });
    proof(report.outcome === "clear", "other_work");
    proof(report.admission?.maintenance === closed && !report.admission.draining, "admission_changed");
  }
  async function observe(target: RecoveryTarget, completed = false) {
    const { run, op } = await state(target, completed);
    const saved = operationConfiguration(run, op).find(item => item.role === op.role && item.taskId === null);
    const bindings = (deps.config.real?.bindings ?? []).filter(item => item.role === op.role && item.taskId === null &&
      item.persona === (op.role === "tester" ? run.persona : null));
    proof(saved && bindings.length === 1 && bindings[0].apiKey && saved.appId === bindings[0].appId &&
      saved.publishedWorkflowId === bindings[0].publishedWorkflowId && saved.publishedWorkflowId === op.verifiedWorkflowId,
    "saved_publication_unavailable");
    const remote = await runtime.retrieve(bindings[0], op.workflowRunId!, { deadlineAtMs: now() + 10_000 });
    proof(remote.kind === "execution" && remote.execution.id === op.workflowRunId &&
      remote.execution.workflow_id === op.verifiedWorkflowId && remote.execution.status === "succeeded" &&
      (!op.workflowTaskId || !remote.execution.task_id || remote.execution.task_id === op.workflowTaskId) &&
      typeof remote.execution.outputs?.booklet_provider_result === "string" &&
      m4Hash(remote.execution.outputs.booklet_provider_result) === op.m4Observation!.wrapperDigest, "remote_evidence_changed");
  }
  async function snapshot(target: RecoveryTarget, completed = false): Promise<RecoverySnapshot> {
    const { run, op } = await state(target, completed);
    const [artifacts, campaign, booklet, operations, approvals, assets, messages] = await Promise.all([
      c.artifacts.find({ experimentRunId: run._id }).toArray(),
      c.experiment_campaigns.findOne({ _id: run.execution!.campaignId }),
      c.booklets.findOne({ _id: run.bookletId }),
      c.experiment_operations.find({ runId: run._id }).toArray(),
      c.approvals.find({ bookletId: run.bookletId }).toArray(),
      c.assets.find({ bookletId: run.bookletId }).toArray(),
      c.messages.find({ bookletId: run.bookletId }).toArray(),
    ]);
    const versions = await c.artifact_versions.find({ artifactId: { $in: artifacts.map(item => item._id) } }).toArray();
    proof(campaign && booklet, "target_missing");
    const inventory = { experiment_runs: [run], experiment_operations: operations,
      experiment_campaigns: [campaign], booklets: [booklet], artifacts, artifact_versions: versions,
      artifact_dependencies: await c.artifact_dependencies.find({ downstreamVersionId: { $in: versions.map(item => item._id) } }).toArray(),
      approvals, assets, messages };
    return { scope, rows: Object.fromEntries(Object.entries(inventory).map(([name, rows]) =>
      [name, Object.fromEntries(rows.map(row => [row._id, reportDigest(row)]))])),
    runInvariant: reportDigest(omit(run, ["revision", "updatedAtMs", "activeOperationId", "safeFailure", "status", "pauseRequested", "evaluationStatus"])),
    operationInvariant: operationInvariant(op),
    campaignInvariant: reportDigest(campaign), bookletInvariant: reportDigest(booklet), campaignId: campaign._id, bookletId: booklet._id,
    countersDigest: reportDigest(run.counters), deadlineAtMs: op.deadlineAtMs!, requestDigest: op.m4Preparation!.requestDigest,
    evidenceDigest: op.m4Observation!.evidenceDigest!, wrapperDigest: op.m4Observation!.wrapperDigest!,
    lifecycleOrigin: reportDigest(omit(op.lifecycle ?? {}, ["phase", "attemptOutcome", "unresolved", "endedAtMs", "lastProgressAtMs", "recoveredAtMs", "timeoutAtMs"])),
    priorEndedAtMs: op.lifecycle?.endedAtMs ?? null, priorTimeoutAtMs: op.lifecycle?.timeoutAtMs ?? null };
  }
  const digest = (target: RecoveryTarget, saved: RecoverySnapshot) => recoveryDigest({ contract: BOOKLET_RECOVERY_CONTRACT, target, saved });
  async function preview(target: RecoveryTarget, closed = false) {
    await quiet(target, closed);
    const before = await snapshot(target);
    await observe(target);
    const after = await snapshot(target);
    proof(recoveryDigest(before) === recoveryDigest(after), "state_changed");
    return { contract: BOOKLET_RECOVERY_CONTRACT, previewDigest: digest(target, after), snapshot: after };
  }
  async function verifyCompleted(target: RecoveryTarget, before: RecoverySnapshot) {
    proof(before.scope === scope, "snapshot_scope_unsupported");
    await quiet(target, true, true);
    await observe(target, true);
    const after = await snapshot(target, true);
    for (const key of ["runInvariant", "operationInvariant", "campaignInvariant", "bookletInvariant", "countersDigest", "deadlineAtMs",
      "requestDigest", "evidenceDigest", "wrapperDigest", "lifecycleOrigin"] as const) proof(after[key] === before[key], "preservation_mismatch");
    const { op } = await state(target, true);
    proof(before.priorEndedAtMs == null || op.lifecycle?.endedAtMs === before.priorEndedAtMs, "attempt_history_changed");
    proof(before.priorTimeoutAtMs == null || op.lifecycle?.timeoutAtMs === before.priorTimeoutAtMs, "attempt_history_changed");
    for (const [name, rows] of Object.entries(before.rows)) {
      proof(recoveryDigest(Object.keys(rows).sort()) === recoveryDigest(Object.keys(after.rows[name]).sort()), "inventory_changed");
      for (const [id, hash] of Object.entries(rows)) {
        if (name === "experiment_runs" && id === target.runId || name === "experiment_operations" && id === target.operationId) continue;
        proof(after.rows[name][id] === hash, "retained_data_changed");
      }
    }
    await withMongoTransaction(db, async session => {
      const run = await c.experiment_runs.findOne({ _id: target.runId, revision: target.expectedRevision + 1 }, { session });
      proof(run, "state_changed");
      await verifyExecutionAccounting(db, session, run);
      // Repeated/lost-ack verification must read storage again. Unchanged database
      // hashes alone cannot prove that retained original bytes still exist.
      const store = deps.store ?? createAssetStore();
      const attempt = createVerificationAttempt(store);
      await verifyCurrentPaginationSources(db, session, run, store, { attempt });
      const pages = await c.artifacts.find({ experimentRunId: run._id, taskId: "J13" }, { session }).toArray();
      const assembly = createExperimentPageIllustrationAssembly({ database: db, store });
      for (const page of pages) {
        proof(page.currentVersionId, "target_missing");
        await assembly.verifyVersion({ runId: run._id, versionId: page.currentVersionId }, session, attempt);
      }
    });
    return { verified: true as const, outcome: "report_completed" as const, accounting: "preserved" as const,
      admission: "closed" as const, runId: target.runId, operationId: target.operationId, providerPosts: 0 };
  }
  async function apply(target: RecoveryTarget, expected: string,
    checkpoint: (value: { contract: string; previewDigest: string; snapshot: RecoverySnapshot }) => Promise<void>) {
    const current = await preview(target, true);
    proof(current.previewDigest === expected, "preview_changed");
    // Preserve the normal 60-second lease and leave cleanup time. A short
    // remaining maintenance window must stop before recording write intent.
    const remaining = operationBudgetRemainingMs();
    proof(remaining === null || remaining >= 70_000, "insufficient_completion_budget");
    await checkpoint(current);
    // Preview already checked global ownership and stable inventory around the
    // authenticated GET in this invocation. The host keeps admission closed and
    // the app stopped. Recheck the target and admission before normal completion;
    // its transaction independently checks current sources and accounting.
    const { run, op, result } = await state(target);
    proof(reportDigest(run) === current.snapshot.rows.experiment_runs[run._id] &&
      reportDigest(op) === current.snapshot.rows.experiment_operations[op._id], "state_changed");
    const admission = await c.deployment_control.findOne({ environment: "_staging" });
    proof(admission?.maintenance && !admission.draining && admission.activeMutations === 0 &&
      (admission.interruptedMutations ?? 0) === 0 && !(admission.mutationOwners ?? []).length, "admission_changed");
    const writeRemaining = operationBudgetRemainingMs();
    proof(writeRemaining === null || writeRemaining >= 65_000, "insufficient_completion_budget");
    await repository.completeOperation({ envelope: { runId: run._id, operationId: op._id, workflowRunId: op.workflowRunId!,
      inputFingerprint: op.inputFingerprint, result }, parentWorkflowRunId: op.parentWorkflowRunId, nowMs: now() });
    return current;
  }
  async function verifyUnapplied(target: RecoveryTarget, expected: string) {
    proof((await preview(target, true)).previewDigest === expected, "state_changed");
    return { verified: true as const, outcome: "unapplied" as const, admission: "closed" as const, providerPosts: 0 };
  }
  async function verifyDiagnosticUnapplied(target: RecoveryTarget, expected: string) {
    const current = await preview(target, true);
    const { op } = await state(target);
    proof(reportDigest(op) === current.snapshot.rows.experiment_operations[op._id], "state_changed");
    const matched = diagnosticAppendBaselines(op, now()).some(baseline => {
      const reconstructed = { ...current.snapshot, operationInvariant: operationInvariant(baseline),
        rows: { ...current.snapshot.rows, experiment_operations: {
          ...current.snapshot.rows.experiment_operations, [op._id]: reportDigest(baseline) } } };
      return digest(target, reconstructed) === expected;
    });
    proof(matched, "diagnostic_append_unproved");
    return { verified: true as const, outcome: "unapplied" as const, admission: "closed" as const,
      proof: "diagnostic_append_only" as const, providerPosts: 0 };
  }
  const unsupported = async (): Promise<never> => { throw new BookletRecoveryError("settled_report_has_no_claim_release"); };
  return { preview, apply, verifyCompleted, verifyUnapplied, verifyDiagnosticUnapplied, deferCompletedVerification: true as const,
    previewClaimRelease: unsupported, applyClaimRelease: unsupported, verifyClaimRelease: unsupported };
}
