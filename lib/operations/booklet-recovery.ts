import { createHash } from "node:crypto";
import type { Collection } from "mongodb";
import type { Database } from "@/db/client";
import { withMongoTransaction } from "@/db/client";
import { verifyM4Accounting } from "@/db/experiment-m4-accounting";
import { verifyMongoStructure } from "@/db/setup";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import { m4CanonicalJson } from "@/lib/experiment-runner/m4-request";
import { createWorkflowRuntime, type WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { inspectRecoveryWork } from "@/lib/operations/recovery-inspection";
import type { AssetStore } from "@/lib/assets/asset-store";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { CompletionReconciliationError } from "@/lib/operations/completion-failure";

export const BOOKLET_RECOVERY_CONTRACT = "booklet-recovery-v1";
export class BookletRecoveryError extends Error {
  constructor(public readonly code: string, public readonly stage?: string, public readonly errorKind?: string,
    public readonly diagnostic?: Pick<CompletionReconciliationError["diagnostic"], "elapsedMs" | "remainingBudgetMs" | "cleanupOutcome" | "commitState">) { super(code); }
}
function requireProof(value: unknown, code: string): asserts value {
  if (!value) throw new BookletRecoveryError(code);
}
export const recoveryDigest = (value: unknown) => createHash("sha256").update(m4CanonicalJson(value)).digest("hex");
const inspectionErrorKinds = new Set(["MongoOperationTimeoutError", "MongoNetworkError", "MongoServerError", "MongoServerSelectionError", "AbortError", "OperationBudgetExpired"]);
async function inspectStep<T>(stage: string, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error instanceof BookletRecoveryError) throw error;
    if (error instanceof CompletionReconciliationError) {
      const { code, stage: completionStage, errorKind, ...diagnostic } = error.diagnostic;
      throw new BookletRecoveryError(code, completionStage, errorKind, diagnostic);
    }
    if (error instanceof ExperimentRepositoryError) throw new BookletRecoveryError(`repository_${error.code}`, stage, "ExperimentRepositoryError");
    const kind = error instanceof Error && inspectionErrorKinds.has(error.name) ? error.name : "Error";
    throw new BookletRecoveryError("inspection_or_verification_failed", stage, kind);
  }
}

/** Keep the complete preservation proof, but do not retain one long history cursor. */
export async function readRecoveryFingerprints(collection: Collection<{ _id: string }>): Promise<Record<string, string>> {
  const rows: Record<string, string> = {};
  // Each query finishes its own bounded cursor. Larger pages reduce sequential
  // round trips over retained history without extending the operation budget.
  const pageSize = 256;
  let after: string | undefined;
  for (;;) {
    const page = await collection.find(after === undefined ? {} : { _id: { $gt: after } }, { batchSize: pageSize })
      .sort({ _id: 1 }).limit(pageSize).toArray();
    for (const row of page) {
      requireProof(typeof row._id === "string" && (after === undefined || row._id > after), "snapshot_identity_order_invalid");
      rows[row._id] = recoveryDigest(row);
      after = row._id;
    }
    if (page.length < pageSize) return rows;
  }
}
const omit = (value: object, keys: string[]) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const inventoryNames = ["experiment_runs", "experiment_operations", "experiment_campaigns", "experiment_delegations",
  "booklets", "artifacts", "artifact_versions", "artifact_dependencies", "approvals", "assets", "messages"] as const;
/** Bound concurrency, stop scheduling after failure, and settle every started read. */
export async function readRecoveryInventory(collections: Pick<Database["collections"], typeof inventoryNames[number]>) {
  const results: Record<string, string>[] = [];
  const failures: { index: number; error: unknown }[] = [];
  let next = 0;
  const worker = async () => {
    while (!failures.length && next < inventoryNames.length) {
      const index = next++; const name = inventoryNames[index];
      try {
        results[index] = await inspectStep(`snapshot.${name}`, () => readRecoveryFingerprints(collections[name] as unknown as Collection<{ _id: string }>));
      } catch (error) { failures.push({ index, error }); }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (failures.length) throw failures.sort((a, b) => a.index - b.index)[0].error;
  return Object.fromEntries(inventoryNames.map((name, index) => [name, results[index]]));
}
export type RecoveryTarget = { runId: string; operationId: string; expectedRevision: number };
export type ClaimReleaseProof = { previewDigest: string; claim: { id: string; expiresAtMs: number }; operationDigest: string;
  restoreAs: "missing" | "null" };
export type RecoverySnapshot = {
  rows: Record<string, Record<string, string>>;
  runInvariant: string; operationInvariant: string; campaignInvariant: string; bookletInvariant: string;
  campaignId: string; bookletId: string; countersDigest: string; deadlineAtMs: number;
  requestDigest: string; evidenceDigest: string; wrapperDigest: string;
  lifecycleOrigin: string; priorEndedAtMs: number | null; priorTimeoutAtMs: number | null;
};

/** No provider mutation is available to this service. The host owns admission and process quiescence. */
export function createBookletRecovery(deps: { database: Database; config: BookletRunnerConfig; runtime?: WorkflowRuntime; store?: () => AssetStore; now?: () => number }) {
  const { database, config } = deps;
  const now = deps.now ?? Date.now;
  const c = database.collections;
  const deny = async (): Promise<never> => { throw new BookletRecoveryError("provider_mutation_forbidden"); };
  const rawRuntime = deps.runtime ?? createWorkflowRuntime(config, (url, init) => {
    requireProof((init?.method ?? "GET") === "GET", "provider_mutation_forbidden");
    return fetch(url, { ...init, redirect: "error" });
  });
  const runtime: WorkflowRuntime = { retrieve: rawRuntime.retrieve.bind(rawRuntime), start: deny, stop: deny };

  async function state(target: RecoveryTarget) {
    const run = await c.experiment_runs.findOne({ _id: target.runId });
    const op = await c.experiment_operations.findOne({ _id: target.operationId, runId: target.runId });
    requireProof(run && op && run.m4, "target_missing");
    const campaign = await c.experiment_campaigns.findOne({ _id: run.m4.campaignId });
    const booklet = await c.booklets.findOne({ _id: run.bookletId });
    requireProof(campaign && booklet, "target_missing");
    return { run, op, campaign, booklet };
  }
  function authority(target: RecoveryTarget) {
    requireProof(config.m4?.state === "granted" && config.m4.authority, "grant_missing");
    const grant = config.m4.authority.grant;
    requireProof(grant.completionRecoveries?.filter(item => item.runId === target.runId && item.operationId === target.operationId).length === 1,
      "exact_completion_grant_missing");
    return grant;
  }
  async function snapshot(target: RecoveryTarget): Promise<RecoverySnapshot> {
    const { run, op, campaign, booklet } = await inspectStep("snapshot.target_state", () => state(target));
    // Recovery is deliberately infrequent. Hash the retained data without exporting its contents.
    const rows = await readRecoveryInventory(c);
    return { rows, campaignId: campaign._id, bookletId: booklet._id,
      runInvariant: recoveryDigest(omit(run, ["revision", "updatedAtMs", "activeOperationId", "safeFailure", "status", "pauseRequested", "progressFingerprint", "progressOperationId", "noProgressCount"])),
      operationInvariant: recoveryDigest(omit(op, ["state", "remoteStatus", "lifecycle", "resultFinalizationClaim", "resultJson", "resultDigest", "warningsJson", "materializationJson", "safeFailure", "updatedAtMs", "m4CompletionRecovery"])),
      campaignInvariant: recoveryDigest(omit(campaign, ["state", "revision", "updatedAtMs"])),
      bookletInvariant: recoveryDigest(omit(booklet, ["currentStage", "updatedAtMs"])),
      countersDigest: recoveryDigest(run.counters), deadlineAtMs: op.deadlineAtMs ?? 0,
      requestDigest: op.m4Preparation?.requestDigest ?? "", evidenceDigest: op.m4Observation?.evidenceDigest ?? "",
      wrapperDigest: op.m4Observation?.wrapperDigest ?? "",
      lifecycleOrigin: recoveryDigest({ startedAtMs: op.lifecycle?.startedAtMs ?? null, ownerId: op.lifecycle?.ownerId ?? null, stop: op.lifecycle?.stop ?? null }),
      priorEndedAtMs: op.lifecycle?.endedAtMs ?? null, priorTimeoutAtMs: op.lifecycle?.timeoutAtMs ?? null };
  }
  async function quiet(target: RecoveryTarget, closed: boolean) {
    const report = await inspectRecoveryWork(database, { environment: "_staging", nowMs: now(), validatedTargets: [{ runId: target.runId, operationId: target.operationId }] });
    if (report.outcome === "inspection_error") throw new BookletRecoveryError("inspection_error", report.inspectionError?.stage, report.inspectionError?.errorKind);
    requireProof(report.outcome === "clear", "other_work");
    requireProof(report.admission?.maintenance === closed && !report.admission.draining, "admission_changed");
    return report;
  }
  async function eligible(target: RecoveryTarget, releasingClaim = false) {
    const grant = authority(target);
    const { run, op, campaign } = await state(target);
    requireProof(run.revision === target.expectedRevision, "revision_changed");
    requireProof(run.mode === "balanced" && run.status === "blocked" && run.safeFailure === "definite_failure" &&
      run.activeOperationId === op._id && !run.preparation && !run.generationCompletedAtMs, "unsupported_run");
    requireProof(op.state === "started" && op.mode === "balanced" && op.role === "specialist" && op.taskId === "J11" && op.providerKind === "text" &&
      op.reservationCount === 1 && op.deadlineAtMs !== null && op.deadlineAtMs < now() && op.workflowRunId && op.verifiedWorkflowId &&
      op.lifecycle && !op.lifecycle.stop && !op.m4CompletionRecovery && !op.resultJson && !op.materializationJson &&
      !op.authorizationClaim && (releasingClaim || !op.resultFinalizationClaim) && !op.imageCompletionClaim, "unsupported_operation");
    requireProof(op.m4Observation?.remoteStatus === "succeeded" && !op.m4Observation.issue && op.m4Observation.wrapperDigest &&
      op.m4Observation.evidenceDigest && op.m4Preparation?.requestDigest, "retained_evidence_missing");
    requireProof(campaign.state === "stopped" && campaign._id === grant.campaignId && run.m4?.policyHash === campaign.policyHash &&
      run.m4.policyJson === campaign.policyJson, "campaign_mismatch");
    return { run, op };
  }
  async function observe(target: RecoveryTarget) {
    const { op } = await eligible(target);
    const binding = config.bindings.find(item => item.role === "specialist" && item.taskId === "J11");
    requireProof(binding && binding.publishedWorkflowId === op.verifiedWorkflowId, "publication_changed");
    const result = await runtime.retrieve(binding, op.workflowRunId!, { deadlineAtMs: now() + 20_000 });
    requireProof(result.kind === "execution" && result.execution.status === "succeeded" && result.execution.id === op.workflowRunId &&
      result.execution.workflow_id === op.verifiedWorkflowId, "remote_outcome_unverified");
    const wrapper = result.execution.outputs?.booklet_provider_result;
    requireProof(typeof wrapper === "string" && createHash("sha256").update(wrapper).digest("hex") === op.m4Observation?.wrapperDigest,
      "remote_evidence_changed");
    requireProof(!op.workflowTaskId || !result.execution.task_id || op.workflowTaskId === result.execution.task_id,
      "remote_evidence_changed");
    return result;
  }
  async function preparePreview(target: RecoveryTarget, closed: boolean, expectedDigest?: string) {
    await inspectStep("catalog", () => verifyMongoStructure(database));
    await inspectStep("eligibility", () => eligible(target));
    await quiet(target, closed);
    // A fresh preview must prove stability across the GET. Apply already pins
    // that complete snapshot in expectedDigest, so compare one fresh post-GET
    // snapshot to it rather than scanning the same inventory twice again.
    const before = expectedDigest === undefined ? await snapshot(target) : undefined;
    const observed = await inspectStep("remote_observation", () => observe(target));
    await quiet(target, closed);
    const after = await snapshot(target);
    if (before) requireProof(recoveryDigest(after) === recoveryDigest(before), "state_changed");
    const proof = { contract: BOOKLET_RECOVERY_CONTRACT, previewDigest: recoveryDigest({ target, snapshot: after, grant: authority(target) }), snapshot: after };
    if (expectedDigest !== undefined) requireProof(proof.previewDigest === expectedDigest, "preview_changed");
    return { proof, observed };
  }
  async function preview(target: RecoveryTarget, closed = false) {
    // The authenticated response stays private to this invocation, never in a receipt.
    return (await preparePreview(target, closed)).proof;
  }
  async function verifyCompleted(target: RecoveryTarget, before: RecoverySnapshot) {
    authority(target);
    const { run, op, campaign } = await state(target);
    requireProof(run.status === "paused" && run.pauseRequested && !run.activeOperationId && !run.safeFailure &&
      op.state === "succeeded" && op.remoteStatus === "succeeded" && op.lifecycle?.unresolved === false && op.resultJson && op.materializationJson &&
      op.m4CompletionRecovery?.requestDigest === before.requestDigest && op.m4CompletionRecovery.evidenceDigest === before.evidenceDigest &&
      campaign.state === "active", "completion_unverified");
    const after = await snapshot(target);
    requireProof(op.lifecycle?.attemptOutcome === "failed" && op.lifecycle.recoveredAtMs &&
      (before.priorEndedAtMs === null || op.lifecycle.endedAtMs === before.priorEndedAtMs) &&
      (before.priorTimeoutAtMs === null || op.lifecycle.timeoutAtMs === before.priorTimeoutAtMs), "attempt_history_changed");
    for (const key of ["runInvariant", "operationInvariant", "campaignInvariant", "bookletInvariant", "countersDigest", "deadlineAtMs", "lifecycleOrigin"] as const) {
      requireProof(after[key] === before[key], "preservation_mismatch");
    }
    const allowed: Record<string, string[]> = { experiment_runs: [target.runId], experiment_operations: [target.operationId],
      experiment_campaigns: [before.campaignId], booklets: [before.bookletId] };
    for (const name of inventoryNames) {
      for (const [id, digest] of Object.entries(before.rows[name])) requireProof(allowed[name]?.includes(id) || after.rows[name][id] === digest, "retained_data_changed");
      if (!["artifacts", "artifact_versions", "artifact_dependencies", "approvals"].includes(name)) {
        requireProof(recoveryDigest(Object.keys(after.rows[name])) === recoveryDigest(Object.keys(before.rows[name])), "inventory_changed");
      }
    }
    const artifact = await c.artifacts.findOne({ experimentRunId: target.runId, taskId: "J11" });
    requireProof(artifact?.state === "approved", "artifact_unverified");
    const version = await c.artifact_versions.findOne({ _id: artifact.currentVersionId!, sourceOperationId: target.operationId });
    requireProof(version, "version_unverified");
    const approvals = await c.approvals.find({ artifactVersionId: version._id }).toArray();
    requireProof(approvals.length === 1 && approvals[0].origin === "delegated" && approvals[0].delegationId === run.activeDelegationId &&
      approvals[0].experimentRunId === target.runId, "approval_unverified");
    const edges = await c.artifact_dependencies.find({ downstreamVersionId: version._id }).toArray();
    requireProof(recoveryDigest(edges.map(edge => edge.upstreamVersionId).sort()) === recoveryDigest([...op.dependencyVersionIds].sort()) &&
      recoveryDigest(JSON.parse(version.dependencyVersionIdsJson)) === recoveryDigest(op.dependencyVersionIds), "lineage_unverified");
    const additions = (name: string) => Object.keys(after.rows[name]).filter(id => !before.rows[name][id]);
    requireProof(recoveryDigest(additions("artifacts")) === recoveryDigest([artifact._id]) &&
      recoveryDigest(additions("artifact_versions")) === recoveryDigest([version._id]) && additions("approvals").length === 1 &&
      additions("artifact_dependencies").length === op.dependencyVersionIds.length, "unexpected_materialization");
    await withMongoTransaction(database, session => verifyM4Accounting(database, session, run));
    await quiet(target, true);
    return { verified: true as const, outcome: "completed" as const, accounting: "preserved" as const,
      admission: "closed" as const, runId: target.runId, operationId: target.operationId, providerPosts: 0 };
  }
  async function apply(target: RecoveryTarget, expectedDigest: string,
    beforeMutation: (proof: { contract: string; previewDigest: string; snapshot: RecoverySnapshot }) => Promise<void>) {
    const { proof, observed } = await preparePreview(target, true, expectedDigest);
    await beforeMutation(proof);
    // Checkpoint I/O grants no permission to mutate: repeat currentness and
    // ownership checks, then use the normal source/approval/accounting services.
    await eligible(target);
    await quiet(target, true);
    await inspectStep("completion_reconciliation", () => createExperimentDispatcher({ database, config, runtime, now, store: deps.store, uploadReference: deny, mutate: deny })
      .reconcileRetainedCompletion(target, observed));
    return proof;
  }
  async function verifyUnapplied(target: RecoveryTarget, expectedDigest: string) {
    await eligible(target);
    await quiet(target, true);
    const current = await snapshot(target);
    requireProof(recoveryDigest({ target, snapshot: current, grant: authority(target) }) === expectedDigest, "state_changed");
    return { verified: true as const, outcome: "unapplied" as const, admission: "closed" as const, providerPosts: 0 };
  }
  async function previewClaimRelease(target: RecoveryTarget, before: RecoverySnapshot): Promise<ClaimReleaseProof> {
    const { op } = await eligible(target, true);
    const claim = op.resultFinalizationClaim;
    requireProof(claim && typeof claim.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(claim.id) &&
      Number.isSafeInteger(claim.expiresAtMs) && claim.expiresAtMs >= 0 && claim.expiresAtMs <= now() && !op.resultDigest,
    "claim_not_releasable");
    await quiet(target, true);
    const current = await snapshot(target);
    requireProof(current.rows.experiment_operations[target.operationId] === recoveryDigest(op), "claim_state_changed");
    const originalDigest = before.rows.experiment_operations?.[target.operationId];
    const missing = omit(op, ["resultFinalizationClaim"]);
    const restoreAs = recoveryDigest(missing) === originalDigest ? "missing"
      : recoveryDigest({ ...missing, resultFinalizationClaim: null }) === originalDigest ? "null" : null;
    requireProof(restoreAs, "claim_not_only_change");
    current.rows.experiment_operations[target.operationId] = originalDigest;
    requireProof(recoveryDigest(current) === recoveryDigest(before), "claim_not_only_change");
    const proof: Omit<ClaimReleaseProof, "previewDigest"> = { claim, restoreAs, operationDigest: recoveryDigest(op) };
    return { ...proof, previewDigest: recoveryDigest({ target, before, proof, grant: authority(target) }) };
  }
  async function verifyClaimRelease(target: RecoveryTarget, before: RecoverySnapshot) {
    await eligible(target);
    await quiet(target, true);
    requireProof(recoveryDigest(await snapshot(target)) === recoveryDigest(before), "claim_release_unverified");
    return { verified: true as const, outcome: "claim_released" as const, admission: "closed" as const,
      accounting: "preserved" as const, providerPosts: 0 };
  }
  async function applyClaimRelease(target: RecoveryTarget, before: RecoverySnapshot, expectedDigest: string,
    beforeMutation: (proof: ClaimReleaseProof) => Promise<void>) {
    const proof = await previewClaimRelease(target, before);
    requireProof(proof.previewDigest === expectedDigest, "preview_changed");
    await beforeMutation(proof);
    requireProof((await previewClaimRelease(target, before)).previewDigest === expectedDigest, "preview_changed");
    await withMongoTransaction(database, async session => {
      const op = await c.experiment_operations.findOne({ _id: target.operationId, runId: target.runId }, { session });
      const run = await c.experiment_runs.findOne({ _id: target.runId }, { session });
      const control = await c.deployment_control.findOne({ environment: "_staging" }, { session });
      requireProof(op && recoveryDigest(op) === proof.operationDigest && run?.revision === target.expectedRevision &&
        recoveryDigest(run) === before.rows.experiment_runs[target.runId], "claim_state_changed");
      requireProof(control?.maintenance && !control.draining && control.activeMutations === 0 &&
        (control.interruptedMutations ?? 0) === 0 && !(control.mutationOwners ?? []).length, "admission_changed");
      const result = await c.experiment_operations.updateOne({ _id: target.operationId, runId: target.runId,
        state: "started", resultFinalizationClaim: proof.claim }, proof.restoreAs === "missing"
        ? { $unset: { resultFinalizationClaim: "" } } : { $set: { resultFinalizationClaim: null } }, { session });
      requireProof(result.modifiedCount === 1, "claim_state_changed");
    });
    return verifyClaimRelease(target, before);
  }
  return { preview, verifyCompleted, verifyUnapplied, apply, previewClaimRelease, applyClaimRelease, verifyClaimRelease };
}
