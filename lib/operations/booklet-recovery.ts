import { createHash } from "node:crypto";
import type { ClientSession, Collection } from "mongodb";
import type { Database } from "@/db/client";
import { withMongoTransaction } from "@/db/client";
import { verifyM4Accounting } from "@/db/experiment-m4-accounting";
import { verifyMongoStructure } from "@/db/setup";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { selectBinding } from "@/lib/experiment-runner/config";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import { m4CanonicalJson } from "@/lib/experiment-runner/m4-request";
import { createWorkflowRuntime, type WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { inspectRecoveryWork } from "@/lib/operations/recovery-inspection";
import type { AssetStore } from "@/lib/assets/asset-store";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { CompletionReconciliationError } from "@/lib/operations/completion-failure";
import { isCompletionRecoveryRole } from "@/lib/operations/operation-recovery-outcome";
import { m4ObservedRoleResult } from "@/lib/experiment-runner/m4-observed-result";
import { operationBudgetRemainingMs } from "@/lib/operations/budget";
import { createLegacyCountFailureProof, validateLegacyCountFailureProof } from "@/lib/experiment-runner/m4-legacy-count-failure";
import { m4SourceFingerprint } from "@/db/experiment-text-sources";
import { m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { closeM4DecisionRejection, m4DecisionRecoveryGrant, m4DecisionRejectionFacts, verifyM4DecisionRejection } from "@/db/experiment-decision-rejection";
import { createExperimentPageIllustrationAssembly } from "@/db/experiment-page-illustrations";
import { createAssetStore } from "@/lib/assets/create-asset-store";
import { validateExperimentImage } from "@/lib/experiment-runner/image-validation";

export const BOOKLET_RECOVERY_CONTRACT = "booklet-recovery-v1";
export class BookletRecoveryError extends Error {
  constructor(public readonly code: string, public readonly stage?: string, public readonly errorKind?: string,
    public readonly diagnostic?: Pick<CompletionReconciliationError["diagnostic"], "elapsedMs" | "remainingBudgetMs"> &
      Partial<Pick<CompletionReconciliationError["diagnostic"], "cleanupOutcome" | "commitState">>) { super(code); }
}
function requireProof(value: unknown, code: string): asserts value {
  if (!value) throw new BookletRecoveryError(code);
}
export const recoveryDigest = (value: unknown) => createHash("sha256").update(m4CanonicalJson(value)).digest("hex");
const inspectionErrorKinds = new Set(["MongoOperationTimeoutError", "MongoNetworkError", "MongoServerError", "MongoServerSelectionError", "AbortError", "OperationBudgetExpired"]);
export async function inspectStep<T>(stage: string, action: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try { return await action(); }
  catch (error) {
    const diagnostic = { elapsedMs: Math.round(performance.now() - startedAt), remainingBudgetMs: operationBudgetRemainingMs() };
    if (error instanceof BookletRecoveryError) {
      throw new BookletRecoveryError(error.code, error.stage ?? stage, error.errorKind ?? "Error", { ...diagnostic, ...error.diagnostic });
    }
    if (error instanceof CompletionReconciliationError) {
      const { code, stage: completionStage, errorKind, ...diagnostic } = error.diagnostic;
      throw new BookletRecoveryError(code, completionStage, errorKind, diagnostic);
    }
    if (error instanceof ExperimentRepositoryError) throw new BookletRecoveryError(`repository_${error.code}`, stage, "ExperimentRepositoryError", diagnostic);
    const kind = error instanceof Error && inspectionErrorKinds.has(error.name) ? error.name : "Error";
    throw new BookletRecoveryError("inspection_or_verification_failed", stage, kind, diagnostic);
  }
}

/** Fixed operation names and sizes only; never emit returned records. */
async function recoveryRead<T>(operation: "target_state" | "campaign_reservations" | "target_materialization" | "current_sources", action: () => Promise<T>) {
  const startedAt = performance.now();
  const value = await inspectStep(`snapshot.${operation}`, action);
  console.error(JSON.stringify({ diagnostic: "recovery_read", operation,
    returnedRows: Array.isArray(value) ? value.length : value === null ? 0 : operation === "target_state" ? 4 : 1,
    returnedBytes: Buffer.byteLength(JSON.stringify(value)), elapsedMs: Math.round(performance.now() - startedAt),
    remainingBudgetMs: operationBudgetRemainingMs() }));
  return value;
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
  // Absence retains the original full-inventory checkpoint interpretation.
  scope?: "pre-generation-target-v1" | "decision-rejection-target-v1";
  sourceFingerprint?: string;
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
    requireProof([...(grant.completionRecoveries ?? []), ...(grant.preGenerationRecoveries ?? []),
      ...(grant.continuations ?? []).filter(item => item.preDeploymentRecovery === "decision_rejection_v1")]
      .filter(item => item.runId === target.runId && item.operationId === target.operationId).length === 1,
      "exact_completion_grant_missing");
    return grant;
  }
  function legacyGrant(target: RecoveryTarget) {
    return authority(target).preGenerationRecoveries?.find(item => item.runId === target.runId && item.operationId === target.operationId);
  }
  function decisionGrant(target: RecoveryTarget) {
    authority(target);
    return m4DecisionRecoveryGrant(config.m4!.authority!, target.runId, target.operationId);
  }
  // This preview reads original bytes without changing run eligibility. Apply
  // additionally runs the unchanged current J13 graph verifier before commit.
  async function decisionAssets(bookletId: string, session: ClientSession) {
    const assets = await c.assets.find({ bookletId }, { session }).sort({ _id: 1 }).toArray();
    const store = (deps.store ?? createAssetStore)();
    for (const asset of assets) {
      const metadata = JSON.parse(asset.metadataJson ?? "null") as { sha256?: string; byteLength?: number } | null;
      requireProof(metadata?.sha256 && metadata.byteLength && asset.width && asset.height, "asset_evidence_missing");
      const decoded = await validateExperimentImage(await store.get(asset.uri));
      requireProof(decoded.sha256 === metadata.sha256 && decoded.byteLength === metadata.byteLength &&
        decoded.width === asset.width && decoded.height === asset.height && decoded.mimeType === asset.mimeType, "asset_evidence_changed");
    }
    return Object.fromEntries(assets.map(asset => [asset._id, recoveryDigest(asset)]));
  }
  async function reservationRows(campaign: Awaited<ReturnType<typeof state>>["campaign"], session?: ClientSession) {
    const maxRequests = m4PolicySnapshot(config.m4!.authority!.policy).policy.maxRequests;
    const reservations = await recoveryRead("campaign_reservations", () => c.experiment_operations.find(
      { "m4Reservation.campaignId": campaign._id },
      { session, projection: { _id: 1, runId: 1, providerKind: 1, reservationCount: 1, m4Reservation: 1 } },
    ).sort({ _id: 1 }).limit(maxRequests + 1).toArray());
    requireProof(reservations.length <= maxRequests && reservations.length === campaign.requests &&
      reservations.every(row => row.providerKind === "text" && row.reservationCount === 1 &&
        row.m4Reservation?.policyHash === campaign.policyHash &&
        Number.isSafeInteger(row.m4Reservation.unsettledMicrodollars) && row.m4Reservation.unsettledMicrodollars >= 0) &&
      reservations.reduce((sum, row) => sum + (row.m4Reservation?.unsettledMicrodollars ?? NaN), 0) === campaign.reservedMicrodollars &&
      reservations.reduce((sum, row) => sum + (row.m4Reservation?.settledMicrodollars ?? 0), 0) === campaign.settledMicrodollars &&
      Object.entries(campaign.slots).every(([persona, runId]) =>
        reservations.filter(row => row.runId === runId).length === campaign.requestCounts[persona as keyof typeof campaign.slots]) &&
      reservations.every(row => Object.values(campaign.slots).includes(row.runId)), "campaign_accounting_mismatch");
    return Object.fromEntries(reservations.map(row => [row._id, recoveryDigest(row)]));
  }
  function snapshotScope(target: RecoveryTarget, previous?: Pick<RecoverySnapshot, "scope">) {
    const scope = previous ? previous.scope : decisionGrant(target) ? "decision-rejection-target-v1" as const
      : legacyGrant(target) ? "pre-generation-target-v1" as const : undefined;
    requireProof(scope === undefined || scope === "pre-generation-target-v1" && legacyGrant(target) ||
      scope === "decision-rejection-target-v1" && decisionGrant(target), "snapshot_scope_unsupported");
    return scope;
  }
  async function snapshot(target: RecoveryTarget, previous?: RecoverySnapshot): Promise<RecoverySnapshot> {
    const scope = snapshotScope(target, previous);
    const { run, op, campaign, booklet } = await recoveryRead("target_state", () => state(target));
    let rows: RecoverySnapshot["rows"];
    if (scope) {
      // This closure updates only the exact operation and run. Current sources
      // and campaign reservations are relevant; unrelated historical bodies are not.
      const reservations = await reservationRows(campaign);
      const materialized = await recoveryRead("target_materialization", () => c.artifact_versions.findOne(
        { sourceOperationId: target.operationId }, { projection: { _id: 1 } }));
      requireProof(!materialized, "unexpected_materialization");
      rows = {
        experiment_runs: { [run._id]: recoveryDigest(run) }, experiment_operations: { [op._id]: recoveryDigest(op) },
        experiment_campaigns: { [campaign._id]: recoveryDigest(campaign) }, booklets: { [booklet._id]: recoveryDigest(booklet) },
        campaign_reservations: reservations,
      };
    } else rows = await readRecoveryInventory(c);
    if (scope === "decision-rejection-target-v1") {
      rows.assets = await withMongoTransaction(database, async session => {
        await verifyM4Accounting(database, session, run, undefined, undefined, { authority: config.m4!.authority!, operationId: target.operationId });
        return decisionAssets(run.bookletId, session);
      });
    }
    const sourceFingerprint = legacyGrant(target) || decisionGrant(target) ? await recoveryRead("current_sources", () =>
      withMongoTransaction(database, session => m4SourceFingerprint(database, session, run))) : undefined;
    return inspectStep("snapshot.invariants", async () => ({ rows, campaignId: campaign._id, bookletId: booklet._id,
      ...(scope ? { scope } : {}),
      ...(sourceFingerprint ? { sourceFingerprint } : {}),
      runInvariant: recoveryDigest(omit(run, scope === "decision-rejection-target-v1"
        ? ["revision", "updatedAtMs", "activeOperationId", "pauseRequested"]
        : ["revision", "updatedAtMs", "activeOperationId", "safeFailure", "status", "pauseRequested", "progressFingerprint", "progressOperationId", "noProgressCount"])),
      operationInvariant: recoveryDigest(omit(op, scope === "decision-rejection-target-v1"
        ? ["state", "lifecycle", "safeFailure", "updatedAtMs", "m4DecisionRejection"]
        : ["state", "remoteStatus", "lifecycle", "resultFinalizationClaim", "resultJson", "resultDigest", "warningsJson", "materializationJson", "safeFailure", "updatedAtMs", "m4CompletionRecovery", "m4PreGenerationRecovery"])),
      campaignInvariant: recoveryDigest(scope === "decision-rejection-target-v1" ? campaign : omit(campaign, ["state", "revision", "updatedAtMs"])),
      bookletInvariant: recoveryDigest(scope === "decision-rejection-target-v1" ? booklet : omit(booklet, ["currentStage", "updatedAtMs"])),
      countersDigest: recoveryDigest(run.counters), deadlineAtMs: op.deadlineAtMs ?? 0,
      requestDigest: op.m4Preparation?.requestDigest ?? "", evidenceDigest: op.m4Observation?.evidenceDigest ?? "",
      wrapperDigest: op.m4Observation?.wrapperDigest ?? "",
      lifecycleOrigin: recoveryDigest({ startedAtMs: op.lifecycle?.startedAtMs ?? null, ownerId: op.lifecycle?.ownerId ?? null, stop: op.lifecycle?.stop ?? null }),
      priorEndedAtMs: op.lifecycle?.endedAtMs ?? null, priorTimeoutAtMs: op.lifecycle?.timeoutAtMs ?? null }));
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
    if (decisionGrant(target)) {
      const facts = m4DecisionRejectionFacts(config.m4!.authority!, run, op);
      requireProof(!releasingClaim && facts?.taskId === "J13" && run.status === "blocked" && run.safeFailure === "definite_failure" &&
        run.activeOperationId === op._id && !run.preparation && !run.generationCompletedAtMs && op.state === "started" &&
        !op.m4DecisionRejection && !op.m4Continuation && op.lifecycle && ["running", "reconciling"].includes(op.lifecycle.phase) &&
        op.lifecycle.attemptOutcome == null && op.deadlineAtMs != null && op.deadlineAtMs < now() &&
        campaign.state === "stopped" && campaign._id === grant.campaignId && campaign.grantReference === grant.reference,
      "unsupported_decision_recovery");
      requireProof(await withMongoTransaction(database, session => verifyM4DecisionRejection(database, session,
        config.m4!.authority!, run, { ...op, m4DecisionRejection: { ...facts, proofDigest: recoveryDigest(facts),
          reference: decisionGrant(target)!.reference, recordedAtMs: now() } })), "decision_output_or_owner_unresolved");
      requireProof(await c.artifacts.findOne({ experimentRunId: run._id, bookletId: run.bookletId, taskId: facts.taskId,
        subjectKind: facts.subjectKind, subjectId: facts.subjectId, currentVersionId: facts.artifactVersionId,
        state: { $in: ["draft", "approved"] } }, { projection: { _id: 1 } }), "decision_target_changed");
      return { run, op };
    }
    if (legacyGrant(target)) {
      requireProof(!releasingClaim && run.status === "blocked" && run.activeOperationId === op._id &&
        ["started", "unknown"].includes(op.state) && !op.m4PreGenerationRecovery && campaign.state === "stopped" &&
        campaign._id === grant.campaignId && campaign.grantReference === grant.reference,
      "unsupported_legacy_count_failure");
      return { run, op };
    }
    requireProof(run.mode === "balanced" && run.status === "blocked" && run.safeFailure === "definite_failure" &&
      run.activeOperationId === op._id && !run.preparation && !run.generationCompletedAtMs, "unsupported_run");
    requireProof(op.state === "started" && op.mode === "balanced" && isCompletionRecoveryRole(op) && op.providerKind === "text" &&
      op.reservationCount === 1 && op.deadlineAtMs !== null && op.deadlineAtMs < now() && op.workflowRunId && op.verifiedWorkflowId &&
      op.lifecycle && !op.lifecycle.stop && !op.m4CompletionRecovery && !op.resultJson && !op.materializationJson &&
      !op.authorizationClaim && (releasingClaim || !op.resultFinalizationClaim) && !op.imageCompletionClaim, "unsupported_operation");
    requireProof(op.m4Observation?.remoteStatus === "succeeded" && !op.m4Observation.issue && op.m4Observation.wrapperDigest &&
      op.m4Observation.evidenceDigest && op.m4Preparation?.requestDigest, "retained_evidence_missing");
    requireProof(campaign.state === "stopped" && campaign._id === grant.campaignId && run.m4?.policyHash === campaign.policyHash &&
      run.m4.policyJson === campaign.policyJson, "campaign_mismatch");
    if (op.role === "manager") {
      const result = m4ObservedRoleResult(run, op);
      requireProof(result.kind === "delegate" && result.payload.taskId === "J12" && result.payload.subjectKind === "page",
        "unsupported_manager_result");
    }
    return { run, op };
  }
  async function observe(target: RecoveryTarget) {
    const { run, op } = await eligible(target);
    const binding = selectBinding(config, op.role, op.taskId as Parameters<typeof selectBinding>[2], run.persona);
    requireProof(binding && binding.publishedWorkflowId === op.verifiedWorkflowId, "publication_changed");
    const result = await runtime.retrieve(binding, op.workflowRunId!, { deadlineAtMs: now() + 20_000 });
    const legacy = legacyGrant(target);
    if (legacy) {
      requireProof(result.kind === "execution", "remote_outcome_unverified");
      createLegacyCountFailureProof(m4PolicySnapshot(config.m4!.authority!.policy).policy, legacy, run, op, result.execution, now());
      return result;
    }
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
    const proof = await inspectStep("preview.digest", async () => ({ contract: BOOKLET_RECOVERY_CONTRACT,
      previewDigest: recoveryDigest({ target, snapshot: after, grant: authority(target) }), snapshot: after }));
    if (expectedDigest !== undefined) requireProof(proof.previewDigest === expectedDigest, "preview_changed");
    return { proof, observed };
  }
  async function preview(target: RecoveryTarget, closed = false) {
    // The authenticated response stays private to this invocation, never in a receipt.
    return (await preparePreview(target, closed)).proof;
  }
  async function verifyCompleted(target: RecoveryTarget, before: RecoverySnapshot) {
    authority(target);
    snapshotScope(target, before);
    const { run, op, campaign } = await state(target);
    if (decisionGrant(target)) {
      requireProof(before.scope === "decision-rejection-target-v1" && run.revision === target.expectedRevision + 1 &&
        run.status === "blocked" && run.pauseRequested && run.safeFailure === "definite_failure" && !run.activeOperationId &&
        op.state === "failed" && op.safeFailure === "definite_failure" && !op.m4Continuation &&
        op.lifecycle?.phase === "finished" && op.lifecycle.attemptOutcome === "failed" && op.lifecycle.unresolved === false &&
        campaign.state === "stopped" && campaign.grantReference === authority(target).reference &&
        await withMongoTransaction(database, session => verifyM4DecisionRejection(database, session, config.m4!.authority!, run, op)),
      "decision_recovery_unverified");
      const after = await snapshot(target, before);
      for (const key of ["runInvariant", "operationInvariant", "campaignInvariant", "bookletInvariant", "countersDigest", "deadlineAtMs", "lifecycleOrigin", "sourceFingerprint"] as const)
        requireProof(after[key] === before[key], "preservation_mismatch");
      requireProof((before.priorEndedAtMs === null || op.lifecycle.endedAtMs === before.priorEndedAtMs) &&
        (before.priorTimeoutAtMs === null || op.lifecycle.timeoutAtMs === before.priorTimeoutAtMs), "attempt_history_changed");
      for (const name of Object.keys(before.rows)) {
        requireProof(recoveryDigest(Object.keys(after.rows[name])) === recoveryDigest(Object.keys(before.rows[name])), "inventory_changed");
        for (const [id, digest] of Object.entries(before.rows[name])) {
          if (name === "experiment_runs" && id === target.runId || name === "experiment_operations" && id === target.operationId) continue;
          requireProof(after.rows[name][id] === digest, "retained_data_changed");
        }
      }
      await quiet(target, true);
      return { verified: true as const, outcome: "failure_closed" as const, accounting: "preserved" as const,
        admission: "closed" as const, runId: target.runId, operationId: target.operationId, providerPosts: 0 };
    }
    if (legacyGrant(target)) {
      requireProof(validateLegacyCountFailureProof(m4PolicySnapshot(config.m4!.authority!.policy).policy, run, op) &&
        run.status === "blocked" && run.revision === target.expectedRevision + 1 && run.safeFailure === "definite_failure" && run.pauseRequested && !run.activeOperationId &&
        campaign.state === "stopped" && campaign._id === authority(target).campaignId &&
        campaign.grantReference === authority(target).reference && !op.m4Continuation, "legacy_failure_closure_unverified");
      const after = await snapshot(target, before);
      requireProof(before.sourceFingerprint && after.sourceFingerprint === before.sourceFingerprint, "source_state_changed");
      for (const key of ["runInvariant", "operationInvariant", "campaignInvariant", "bookletInvariant", "countersDigest", "deadlineAtMs", "lifecycleOrigin"] as const) {
        requireProof(after[key] === before[key], "preservation_mismatch");
      }
      requireProof((before.priorEndedAtMs === null || op.lifecycle?.endedAtMs === before.priorEndedAtMs) &&
        (before.priorTimeoutAtMs === null || op.lifecycle?.timeoutAtMs === before.priorTimeoutAtMs), "attempt_history_changed");
      for (const name of before.scope ? Object.keys(before.rows) : inventoryNames) {
        requireProof(recoveryDigest(Object.keys(after.rows[name])) === recoveryDigest(Object.keys(before.rows[name])), "inventory_changed");
        for (const [id, digest] of Object.entries(before.rows[name])) {
          if (name === "experiment_runs" && id === target.runId || name === "experiment_operations" && id === target.operationId) continue;
          requireProof(after.rows[name][id] === digest, "retained_data_changed");
        }
      }
      requireProof(Object.entries(legacyGrant(target)!).every(([key, value]) =>
        op.m4PreGenerationRecovery![key as keyof typeof op.m4PreGenerationRecovery] === value), "legacy_grant_changed");
      await quiet(target, true);
      return { verified: true as const, outcome: "failure_closed" as const, accounting: "preserved" as const,
        admission: "closed" as const, runId: target.runId, operationId: target.operationId, providerPosts: 0 };
    }
    requireProof(run.status === "paused" && run.pauseRequested && !run.activeOperationId && !run.safeFailure &&
      op.state === "succeeded" && op.remoteStatus === "succeeded" && op.lifecycle?.unresolved === false && op.resultJson && op.materializationJson &&
      op.m4CompletionRecovery?.requestDigest === before.requestDigest && op.m4CompletionRecovery.evidenceDigest === before.evidenceDigest &&
      campaign.state === "active", "completion_unverified");
    const after = await snapshot(target, before);
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
    if (op.role === "manager") {
      requireProof(JSON.parse(op.materializationJson!).delegatedTaskId === "J12", "delegation_unverified");
      // A manager completion records its existing delegation, not new persona
      // outputs. Every artifact/approval/edge and the booklet stay byte-identical.
      for (const name of ["artifacts", "artifact_versions", "artifact_dependencies", "approvals", "booklets"]) {
        requireProof(recoveryDigest(after.rows[name]) === recoveryDigest(before.rows[name]), "unexpected_materialization");
      }
    } else {
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
    }
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
    requireProof(recoveryDigest({ target, snapshot: proof.snapshot, grant: authority(target) }) === expectedDigest, "grant_changed");
    const legacy = legacyGrant(target);
    if (decisionGrant(target)) {
      await withMongoTransaction(database, async session => {
        const run = await c.experiment_runs.findOne({ _id: target.runId }, { session });
        const op = await c.experiment_operations.findOne({ _id: target.operationId, runId: target.runId }, { session });
        const campaign = run?.m4 ? await c.experiment_campaigns.findOne({ _id: run.m4.campaignId }, { session }) : null;
        const booklet = run ? await c.booklets.findOne({ _id: run.bookletId }, { session }) : null;
        const control = await c.deployment_control.findOne({ environment: "_staging" }, { session });
        requireProof(run && op && campaign?.state === "stopped" && booklet && run.revision === target.expectedRevision &&
          control?.maintenance && !control.draining && control.activeMutations === 0 && (control.interruptedMutations ?? 0) === 0 &&
          !(control.mutationOwners ?? []).length && recoveryDigest(run) === proof.snapshot.rows.experiment_runs[run._id] &&
          recoveryDigest(op) === proof.snapshot.rows.experiment_operations[op._id] &&
          recoveryDigest(campaign) === proof.snapshot.rows.experiment_campaigns[campaign._id] &&
          recoveryDigest(booklet) === proof.snapshot.rows.booklets[booklet._id] &&
          await m4SourceFingerprint(database, session, run) === proof.snapshot.sourceFingerprint &&
          recoveryDigest(await reservationRows(campaign, session)) === recoveryDigest(proof.snapshot.rows.campaign_reservations) &&
          recoveryDigest(await decisionAssets(run.bookletId, session)) === recoveryDigest(proof.snapshot.rows.assets), "decision_state_changed");
        const closed = await closeM4DecisionRejection(database, session, config.m4!.authority!, run, op, now());
        requireProof(closed?.revision === target.expectedRevision + 1 && closed.activeOperationId === null, "decision_closure_failed");
        // Source verifiers re-read saved eligibility. Stage paused status only
        // inside this transaction; restore blocked status before accounting/commit.
        await c.experiment_runs.updateOne({ _id: run._id, revision: closed.revision }, { $set: { status: "paused", pauseRequested: true } }, { session });
        await createExperimentPageIllustrationAssembly({ database, store: (deps.store ?? createAssetStore)() })
          .verifyVersion({ runId: run._id, versionId: op.m4DecisionRejection?.artifactVersionId ?? m4DecisionRejectionFacts(config.m4!.authority!, run, op)!.artifactVersionId }, session);
        const paused = await c.experiment_runs.findOneAndUpdate({ _id: run._id, revision: closed.revision },
          { $set: { status: "blocked" } }, { session, returnDocument: "after" });
        requireProof(paused, "decision_state_changed");
        await verifyM4Accounting(database, session, paused, undefined, undefined, { authority: config.m4!.authority!, operationId: op._id });
      });
      return proof;
    }
    if (legacy) {
      requireProof(observed.kind === "execution", "remote_outcome_unverified");
      await withMongoTransaction(database, async session => {
        const run = await c.experiment_runs.findOne({ _id: target.runId }, { session });
        const op = await c.experiment_operations.findOne({ _id: target.operationId, runId: target.runId }, { session });
        const campaign = run?.m4 ? await c.experiment_campaigns.findOne({ _id: run.m4.campaignId }, { session }) : null;
        requireProof(run && op && run.revision === target.expectedRevision && campaign?.state === "stopped" && campaign._id === authority(target).campaignId &&
          campaign.grantReference === authority(target).reference && campaign.policyHash === run.m4?.policyHash &&
          campaign.policyJson === run.m4.policyJson &&
          !await c.artifact_versions.findOne({ sourceOperationId: target.operationId }, { session, projection: { _id: 1 } }), "legacy_state_changed");
        requireProof(proof.snapshot.sourceFingerprint && await m4SourceFingerprint(database, session, run) === proof.snapshot.sourceFingerprint,
          "source_state_changed");
        if (proof.snapshot.scope) {
          const booklet = await c.booklets.findOne({ _id: run.bookletId }, { session });
          const control = await c.deployment_control.findOne({ environment: "_staging" }, { session });
          requireProof(control?.maintenance && !control.draining && control.activeMutations === 0 &&
            (control.interruptedMutations ?? 0) === 0 && !(control.mutationOwners ?? []).length, "admission_changed");
          requireProof(recoveryDigest(run) === proof.snapshot.rows.experiment_runs[run._id] &&
            recoveryDigest(op) === proof.snapshot.rows.experiment_operations[op._id] &&
            recoveryDigest(campaign) === proof.snapshot.rows.experiment_campaigns[campaign._id] &&
            recoveryDigest(booklet) === proof.snapshot.rows.booklets[run.bookletId] &&
            recoveryDigest(await reservationRows(campaign, session)) === recoveryDigest(proof.snapshot.rows.campaign_reservations), "state_changed");
        }
        const legacyProof = createLegacyCountFailureProof(m4PolicySnapshot(config.m4!.authority!.policy).policy, legacy, run, op, observed.execution, now());
        const changed = await c.experiment_operations.updateOne({ _id: op._id, state: op.state }, { $set: {
          m4PreGenerationRecovery: legacyProof, remoteStatus: "failed", state: "failed", safeFailure: "definite_failure", updatedAtMs: now(),
          lifecycle: { ...op.lifecycle!, phase: "finished", attemptOutcome: "failed", unresolved: false,
            endedAtMs: op.lifecycle!.endedAtMs ?? now(), lastProgressAtMs: now() },
        } }, { session });
        requireProof(changed.modifiedCount === 1, "legacy_state_changed");
        const blocked = await c.experiment_runs.updateOne({ _id: run._id, revision: target.expectedRevision, activeOperationId: op._id },
          { $set: { activeOperationId: null, status: "blocked", safeFailure: "definite_failure", pauseRequested: true, updatedAtMs: now() },
            $inc: { revision: 1 } }, { session });
        requireProof(blocked.modifiedCount === 1, "legacy_state_changed");
      });
      return proof;
    }
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
    snapshotScope(target, before);
    const { op } = await eligible(target, true);
    const claim = op.resultFinalizationClaim;
    requireProof(claim && typeof claim.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(claim.id) &&
      Number.isSafeInteger(claim.expiresAtMs) && claim.expiresAtMs >= 0 && claim.expiresAtMs <= now() && !op.resultDigest,
    "claim_not_releasable");
    await quiet(target, true);
    const current = await snapshot(target, before);
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
    requireProof(recoveryDigest(await snapshot(target, before)) === recoveryDigest(before), "claim_release_unverified");
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
