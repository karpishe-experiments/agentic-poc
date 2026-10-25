import type { ClientSession } from "mongodb";
import { z } from "zod";
import { withMongoTransaction, type Database } from "@/db/client";
import type { ExperimentOperationDocument } from "@/db/documents";
import { createExperimentCampaignLedger, type M4Authority } from "@/db/experiment-campaign";
import { createExperimentRepository, ExperimentRepositoryError } from "@/db/experiment-repository";
import { closeM4KnownFailure } from "@/db/experiment-provider-failure";
import { m4OperationFingerprint } from "@/db/experiment-text-sources";
import { opaqueIdSchema } from "@/lib/contracts/common";
import type { RoleResult } from "@/lib/contracts/experiment-runner";
import { savedConfigurationSchema, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { assessM4ProviderResult, m4ProviderWrapperSchema } from "@/lib/experiment-runner/m4-provider-result";
import { m4ObservedRoleResult } from "@/lib/experiment-runner/m4-observed-result";
import { M4CreativeOutputError } from "@/lib/experiment-runner/m4-output";
import { m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import { m4MaximumCharge, m4ModelBucket } from "@/lib/experiment-runner/m4-policy";
import { m4PreGenerationFailure } from "@/lib/experiment-runner/m4-pre-generation-failure";
import { mergeAuthoritativeCount } from "@/lib/experiment-runner/context-diagnostics";
import type { WorkflowRuntime, RuntimeResult } from "@/lib/experiment-runner/transport";

const identity = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema,
  nowMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) });
type Observation = NonNullable<ExperimentOperationDocument["m4Observation"]>;
type Outcome = { kind: "pending" | "blocked" } | { kind: "result"; result: RoleResult; reused: boolean;
  pauseRequested: boolean; stopRequested: boolean };
function conflict(): never { throw new ExperimentRepositoryError("conflict", "M4 observation identity is not current."); }

// Internal authenticated observation only. No caller-supplied outputs, provider
// POST, completion, callback, or public route is accepted by this service.
export function createM4ProviderResults(database: Database, authority: M4Authority,
  config: BookletRunnerConfig, runtime: WorkflowRuntime) {
  const ledger = createExperimentCampaignLedger(database, authority);
  const bindings = structuredClone(config.bindings);
  const repository = createExperimentRepository(database);
  async function load(session: ClientSession, input: z.infer<typeof identity>) {
    const run = await database.collections.experiment_runs.findOne({ _id: input.runId }, { session });
    const operation = await database.collections.experiment_operations.findOne({ _id: input.operationId, runId: input.runId }, { session });
    const prep = operation?.m4Preparation, reservation = operation?.m4Reservation;
    if (!run || !operation || run.mode !== "balanced" || operation.mode !== "balanced" || operation.providerKind !== "text" ||
        operation.role === "image" || !["started", "unknown"].includes(operation.state) || run.activeOperationId !== operation._id ||
        ["completed", "failed"].includes(run.status) || operation.reservationCount !== 1 || operation.dispatchStartedAtMs == null ||
        !operation.workflowRunId || !prep || !reservation || run.m4?.campaignId !== ledger.grant.campaignId ||
        run.m4.policyHash !== ledger.snapshot.hash || run.m4.policyJson !== ledger.snapshot.json ||
        prep.policyHash !== ledger.snapshot.hash || reservation.policyHash !== ledger.snapshot.hash ||
        reservation.campaignId !== ledger.grant.campaignId || prep.configurationHash !== run.configurationHash ||
        prep.operationFingerprint !== m4OperationFingerprint(operation) ||
        reservation.bucket !== m4ModelBucket(operation.role, run.generationCompletedAtMs != null) ||
        reservation.maximumMicrodollars !== m4MaximumCharge(ledger.snapshot.policy, reservation.bucket) ||
        prep.requestDigest !== reservation.requestDigest || prep.requestDigest !== m4Hash(prep.requestJson) ||
        prep.parentWorkflowRunId !== operation.parentWorkflowRunId || prep.publishedWorkflowId !== operation.verifiedWorkflowId) conflict();
    const expected = ledger.snapshot.policy.publications.find((item) => item.role === operation.role && item.taskId === operation.taskId &&
      item.persona === (operation.role === "tester" ? run.persona : null));
    const saved = savedConfigurationSchema.parse(JSON.parse(run.configurationJson)).find((item) => item.role === operation.role && item.taskId === operation.taskId);
    const candidates = bindings.filter((item) => item.role === operation.role && item.taskId === operation.taskId &&
      item.persona === (operation.role === "tester" ? run.persona : null));
    const binding = candidates[0];
    if (!expected || !saved || candidates.length !== 1 || !binding.apiKey ||
        [saved, binding].some((item) => item.appId !== expected.appId || item.publishedWorkflowId !== expected.publishedWorkflowId ||
          item.toolProviderId !== expected.toolProviderId || item.finalPageIllustration !== expected.finalPageIllustration) ||
        expected.publishedWorkflowId !== prep.publishedWorkflowId) conflict();
    return { run, operation, binding, prep };
  }
  async function block(input: z.infer<typeof identity>): Promise<Outcome> {
    if (await closeM4KnownFailure(database, { policy: ledger.snapshot.policy, grant: ledger.grant }, input) === "closed") return { kind: "blocked" };
    // Missing, conflicting or unattributed evidence preserves the unresolved lane.
    const run = await repository.getRun(input.runId);
    if (run && run.status !== "blocked" && run.status !== "completed" && run.status !== "failed") {
      await repository.blockRun({ runId: input.runId, category: "unknown_outcome", nowMs: input.nowMs });
    }
    return { kind: "blocked" };
  }
  async function observe(raw: unknown): Promise<Outcome> {
    const input = identity.parse(raw);
    const before = await withMongoTransaction(database, (session) => load(session, input));
    let remote: RuntimeResult;
    try { remote = await runtime.retrieve(before.binding, before.operation.workflowRunId!); }
    catch { remote = { kind: "unknown" }; }
    // A read failure or running execution is observation uncertainty, never
    // permission to release the maximum or start another generation request.
    const execution = remote.kind === "execution" || remote.kind === "accepted" ? remote.execution : null;
    const identityMismatch = execution && (execution.id !== before.operation.workflowRunId ||
      execution.workflow_id !== before.prep.publishedWorkflowId ||
      before.operation.workflowTaskId && execution.task_id && execution.task_id !== before.operation.workflowTaskId);
    if (!execution || execution.status === "running" || identityMismatch) {
      const stopped = await withMongoTransaction(database, async (session) => {
        const current = await load(session, input);
        if (current.operation.workflowRunId !== before.operation.workflowRunId || current.prep.requestDigest !== before.prep.requestDigest) conflict();
        if (identityMismatch || remote.kind === "conflict" || current.operation.m4Observation && execution?.status === "running") {
          if (current.operation.m4Observation) await database.collections.experiment_operations.updateOne({ _id: current.operation._id },
            { $set: { "m4Observation.issue": "conflicting_evidence" } }, { session });
          await ledger.stop(session, input.nowMs); return true;
        }
        return false;
      });
      return stopped ? block(input) : { kind: "pending" };
    }
    const value = execution.outputs?.booklet_provider_result;
    const wrapperText = typeof value === "string" && Buffer.byteLength(value, "utf8") <= 2_500_000 ? value : null;
    let parsed: ReturnType<typeof m4ProviderWrapperSchema.safeParse> = m4ProviderWrapperSchema.safeParse(null);
    let originalContent: string | null = null;
    let preGeneration: ReturnType<typeof m4PreGenerationFailure> = null;
    if (wrapperText !== null) {
      try {
        const rawWrapper: unknown = JSON.parse(wrapperText);
        preGeneration = m4PreGenerationFailure(rawWrapper, ledger.snapshot.policy, before.operation);
        parsed = m4ProviderWrapperSchema.safeParse(rawWrapper);
        const creative = z.object({ content: z.string().max(2 * 1024 * 1024) }).safeParse(rawWrapper);
        if (creative.success) originalContent = creative.data.content;
      } catch { /* No arbitrary error/body is saved. */ }
    }
    let assessment: ReturnType<typeof assessM4ProviderResult> | null = null;
    if (parsed.success) {
      try { assessment = assessM4ProviderResult(parsed.data, ledger.snapshot.policy, before.operation); } catch { /* Retain bounded evidence, but no attribution. */ }
    }
    const evidenceJson = preGeneration ? m4CanonicalJson(preGeneration) : parsed.success ? m4CanonicalJson(parsed.data.providerEvidence) : null;
    const observation: Observation = { workflowRunId: execution.id, publishedWorkflowId: execution.workflow_id,
      wrapperDigest: wrapperText === null ? null : m4Hash(wrapperText), content: originalContent,
      evidenceJson, evidenceDigest: evidenceJson === null ? null : m4Hash(evidenceJson), remoteStatus: execution.status,
      observedAtMs: input.nowMs, issue: preGeneration ? "provider_failure" : wrapperText === null ? "missing_wrapper" : !assessment ? "invalid_evidence" :
        execution.status !== "succeeded" || !assessment.canMaterialize ? "provider_failure" : null };
    const retained = await withMongoTransaction(database, async (session) => {
      const current = await load(session, input);
      if (current.operation.workflowRunId !== before.operation.workflowRunId ||
          current.prep.requestDigest !== before.prep.requestDigest || current.prep.contextJson !== before.prep.contextJson) conflict();
      const prior = current.operation.m4Observation;
      const changed = prior && (prior.wrapperDigest !== observation.wrapperDigest || prior.remoteStatus !== observation.remoteStatus);
      if (changed || prior?.issue === "conflicting_evidence") {
        await database.collections.experiment_operations.updateOne({ _id: current.operation._id },
          { $set: { "m4Observation.issue": "conflicting_evidence" } }, { session });
        await ledger.stop(session, input.nowMs); return { stopped: true, reused: false };
      }
      if (!prior) {
        // Count evidence was authenticated above; this optional measurement has
        // no authority over settlement or materialization.
        const diagnostics = current.operation.contextDiagnostics;
        const counted = preGeneration?.failureEvidence.countedInputTokens ??
          (parsed.success && assessment && !assessment.violations.some(code => ["model_mismatch", "tier_mismatch", "stdio_unverified"].includes(code))
            ? parsed.data.providerEvidence.countedInputTokens : null);
        const saved = await database.collections.experiment_operations.updateOne({ _id: current.operation._id, m4Observation: { $exists: false } },
          { $set: { m4Observation: observation, ...(diagnostics ? { contextDiagnostics: mergeAuthoritativeCount(diagnostics, counted) } : {}) } }, { session });
        if (saved.modifiedCount !== 1) conflict();
      }
      if (assessment?.chargeUpperMicrodollars != null) {
        const settlement = await ledger.settle(session, current.operation, { digest: assessment.evidenceDigest, chargeMicrodollars: assessment.chargeUpperMicrodollars }, input.nowMs);
        if (settlement === "conflict") {
          await database.collections.experiment_operations.updateOne({ _id: current.operation._id },
            { $set: { "m4Observation.issue": "conflicting_evidence" } }, { session });
          return { stopped: true, reused: !!prior };
        }
      }
      if (!prior && !observation.issue && before.run.generationCompletedAtMs != null && ["tester", "judge"].includes(before.operation.role)) {
        const reservations = await database.collections.experiment_operations.find({ runId: before.run._id, providerKind: "text" },
          { session, projection: { m4Reservation: 1 } }).toArray();
        const upper = reservations.reduce((sum, item) => sum + (item.m4Reservation?.settledMicrodollars ?? 0) +
          (item.m4Reservation?.unsettledMicrodollars ?? 0), 0);
        // Freeze the report's cost snapshot here, including its own request.
        // A later judge request must not change an earlier report on inspection.
        await database.collections.experiment_operations.updateOne({ _id: current.operation._id }, { $set: {
          "m4Observation.costEvidence": { status: "partial", actualUsd: null, estimatedUsd: upper / 1_000_000,
            explanation: "Frozen-price upper charge allocation for this run through this report, including retained count allowances. Invoice cost is unavailable; token-count endpoint charges remain an assumption when marked assumed in the saved policy." },
        } }, { session });
      }
      if (observation.issue) await ledger.stop(session, input.nowMs);
      return { stopped: observation.issue !== null, reused: !!prior };
    });
    if (retained.stopped) return block(input);
    // Evidence and attributable usage have committed before creative parsing.
    let result: RoleResult;
    const saved = await repository.getOperation(before.operation._id);
    if (!saved) conflict();
    try {
      result = m4ObservedRoleResult(before.run, saved);
    } catch (error) {
      if (!(error instanceof M4CreativeOutputError)) throw error;
      await withMongoTransaction(database, async (session) => {
        const current = await load(session, input);
        if (current.operation.m4Observation?.wrapperDigest !== observation.wrapperDigest) conflict();
        if (current.operation.m4Observation.issue !== "conflicting_evidence") {
          await database.collections.experiment_operations.updateOne({ _id: current.operation._id },
            { $set: { "m4Observation.issue": "creative_invalid" } }, { session });
        }
        await ledger.stop(session, input.nowMs);
      });
      return block(input);
    }
    const currentState = await withMongoTransaction(database, async (session) => {
      const current = await load(session, input);
      const campaign = await database.collections.experiment_campaigns.findOne({ _id: ledger.grant.campaignId }, { session });
      return { admitted: !!campaign && campaign.policyHash === ledger.snapshot.hash &&
        current.operation.m4Observation?.wrapperDigest === observation.wrapperDigest,
        pauseRequested: current.run.pauseRequested, stopRequested: !!current.operation.lifecycle?.stop };
    });
    // Pause/Stop never replay paid work. The existing completion owner decides
    // whether this exact in-flight result can still materialize.
    return currentState.admitted ? { kind: "result", result, reused: retained.reused,
      pauseRequested: currentState.pauseRequested, stopRequested: currentState.stopRequested } : { kind: "blocked" };
  }
  return { observe };
}
