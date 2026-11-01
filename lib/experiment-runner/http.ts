import { controlState, controlStateProjection, hasRetainedDecisionContinuation } from "@/lib/experiment-runner/control-state";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Collection } from "mongodb";
import { getDatabase, type Database } from "@/db/client";
import { createExperimentRepository, ExperimentRepositoryError } from "@/db/experiment-repository";
import { withMongoTransaction } from "@/db/client";
import { createExecutionAllowanceLedger, ExecutionAllowanceError, type ExecutionCampaignDocument } from "@/db/experiment-execution-allowance";
import { defaultExecutionAllowance, executionAllowanceSchema, executionPolicyFromM4TechnicalProfile, realExecutionPolicyFromM4TechnicalProfile, executionPolicySnapshot } from "@/lib/experiment-runner/execution-policy";
import { createExperimentCompletionService } from "@/db/experiment-completion";
import { createExperimentImageRepository } from "@/db/experiment-images";
import { createExperimentPageBatchRepository } from "@/db/experiment-page-batches";
import { experimentPageBatchSchema } from "@/lib/contracts/experiment-page-batches";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { diagnosticAssetStore, measurePhase } from "@/lib/experiment-runner/diagnostics";
import { createExperimentImageStorage } from "@/lib/experiment-runner/image-storage";
import { ExperimentImageValidationError, MAX_EXPERIMENT_IMAGE_BYTES } from "@/lib/experiment-runner/image-validation";
import { createAssetStore } from "@/lib/assets/create-asset-store";
import type { AssetStore } from "@/lib/assets/asset-store";
import sharp from "sharp";
import { configurationSnapshot, savedConfigurationSchema, validToolKey, type ConfigState, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { readM4RunnerConfig } from "@/lib/experiment-runner/m4-config";
import { m4AdmittedTokenPolicy, m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { m4AuthorizationEnvelope, m4Hash } from "@/lib/experiment-runner/m4-request";
import { createWorkflowRuntime, type WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { createRunInputSchema, experimentTaskSchema, resultEnvelopeSchema, personaSchema } from "@/lib/contracts/experiment-runner";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { hasValidBasicAuthorization } from "@/lib/http/basic-auth";
import { assertMutationsAllowed, runTrackedMutation } from "@/lib/application/deployment-control";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import { readStreamChunk } from "@/lib/operations/read-stream";
import { RECONCILIATION_RESERVE_MS, withOperationBudget } from "@/lib/operations/budget";
import { checkProbeReadiness, probeIdentitySchema } from "@/lib/experiment-runner/probe-preflight";
import { operationRecoveryOutcome } from "@/lib/operations/operation-recovery-outcome";
import type { ContextDiagnostics } from "@/lib/experiment-runner/context-diagnostics";
import { runTiming, runAttention } from "@/lib/experiment-runner/run-summary";
import { runAccounting } from "@/lib/experiment-runner/run-accounting";
import { externalError, redactExternalError } from "@/lib/experiment-runner/external-errors";
import { createImageReplacementService } from "@/db/experiment-image-replacement";

const identity = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema, workflowRunId: opaqueIdSchema, parentWorkflowRunId: opaqueIdSchema.nullable() });
const imageIdentity = identity.extend({ inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/) });
const realImageEvidence = imageIdentity.extend({ result: z.unknown() });
const control = z.strictObject({ expectedRevision: z.number().int().nonnegative() });
const runControl = control.extend({ responseMode: z.literal("receipt").optional() });
const campaignGrant = z.strictObject({ mode: z.enum(["balanced", "real"]), persona: personaSchema,
  reference: z.string().trim().min(1).max(500), maxMicrodollars: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  predecessorRunId: opaqueIdSchema.optional(), totals: executionAllowanceSchema.omit({ maxMicrodollars: true }).optional() });
const approvalBase = { expectedRevision: z.number().int().nonnegative(),
  expectedCampaignRevision: z.number().int().nonnegative(), expectedPendingDigest: z.string().regex(/^[a-f0-9]{64}$/),
  reference: z.string().trim().min(1).max(500) };
const approvalGrant = z.union([
  z.strictObject({ action: z.literal("image_replacement"), operationId: opaqueIdSchema,
    expectedRevision: z.number().int().nonnegative(), expectedCampaignRevision: z.number().int().nonnegative(),
    previewDigest: z.string().regex(/^[a-f0-9]{64}$/), expiresAtMs: z.number().int().positive(),
    reference: z.string().trim().min(1).max(500), acknowledgeUnknownCharge: z.literal(true), totals: executionAllowanceSchema.optional() }),
  z.strictObject({ action: z.literal("adjust"), expectedRevision: z.number().int().nonnegative(),
    expectedCampaignRevision: z.number().int().nonnegative(), reference: z.string().trim().min(1).max(500), totals: executionAllowanceSchema }),
  z.strictObject({ ...approvalBase, action: z.literal("approve"), totals: executionAllowanceSchema }),
  z.strictObject({ ...approvalBase, action: z.literal("decline") }),
]);
const operationControl = z.union([control.extend({ operationId: opaqueIdSchema }), control.extend({ preparationId: opaqueIdSchema })]);
const pageSelection = control.extend({ batch: experimentPageBatchSchema });
const failure = identity.extend({ category: z.enum(["definite_failure", "unknown_outcome"]) });
const result = identity.extend({ inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/), result: resultEnvelopeSchema.shape.result });
const headers = { "Cache-Control": "no-store" };
const errorMessages: Record<string, string> = {
  invalid_request: "Request is invalid.", invalid_result: "Result is invalid.", not_found: "Resource was not found.",
  stale_revision: "The run revision changed. Read its current state.",
  conflict: "Saved state conflicts with the request.", unavailable: "Runner is temporarily unavailable.",
  runner_unavailable: "Runner configuration is unavailable.", unauthorized: "Authentication is required.",
  invalid_origin: "Request origin is not allowed.", mode_unavailable: "This run mode is unavailable.",
  invalid_image: "Image content is invalid.", image_too_large: "Image content exceeds the size limit.",
};
function reply(status: number, code: string) { return Response.json({ error: { code, message: errorMessages[code] ?? "Request failed." } }, { status, headers }); }
function data(value: unknown, status = 200) { return Response.json({ data: value }, { status, headers }); }
function safeError(error: unknown): Response {
  const diagnostic = externalError({ service: "booklet", stage: "api", error });
  const detailed = (status: number, code: string) => Response.json({ error: { code,
    message: error instanceof Error ? String(redactExternalError(error.message).value) : errorMessages[code], diagnostic } }, { status, headers });
  if (error instanceof ExperimentImageValidationError) return detailed(error.code === "too_large" ? 413 : 422, error.code === "too_large" ? "image_too_large" : "invalid_image");
  if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof RangeError) return detailed(400, "invalid_request");
  if (error instanceof ExperimentRepositoryError) {
    if (error.code === "not_found") return detailed(404, "not_found");
    if (error.code === "invalid_input") return detailed(400, "invalid_request");
    if (error.code === "invalid_result") return detailed(422, "invalid_result");
    return detailed(409, "conflict");
  }
  if (error instanceof ExecutionAllowanceError) return detailed(409, error.code === "stale_revision" ? "stale_revision" : "conflict");
  return detailed(503, "unavailable");
}
const materialization = z.object({
  artifactId: opaqueIdSchema.optional(), versionId: opaqueIdSchema.optional(), approvalId: opaqueIdSchema.nullable().optional(),
  questionId: opaqueIdSchema.optional(), delegationId: opaqueIdSchema.optional(), revokedDelegationId: opaqueIdSchema.optional(),
  reviewGroupId: opaqueIdSchema.nullable().optional(), approvalIds: z.array(opaqueIdSchema).optional(),
  answeredQuestionId: opaqueIdSchema.optional(), delegatedTaskId: experimentTaskSchema.optional(),
  warnings: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
}).strip();
function resultSummary(json: string | null): unknown {
  if (!json) return {};
  return materialization.parse(JSON.parse(json) as unknown);
}
async function boundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new RangeError("Body limit");
  if (!request.body) throw new SyntaxError("Body required");
  const reader = request.body.getReader();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await readStreamChunk(reader, signal);
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new RangeError("Body limit"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let decoded: string;
  try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new SyntaxError("Invalid UTF-8"); }
  return JSON.parse(decoded) as unknown;
}
async function boundedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new ExperimentImageValidationError("too_large");
  if (!request.body) throw new ExperimentImageValidationError("empty");
  const reader = request.body.getReader();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await readStreamChunk(reader, signal);
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new ExperimentImageValidationError("too_large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
function imageQuery(request: Request): z.infer<typeof imageIdentity> {
  const query = new URL(request.url).searchParams;
  const allowed = new Set(["runId", "operationId", "workflowRunId", "parentWorkflowRunId", "inputFingerprint"]);
  for (const key of query.keys()) if (!allowed.has(key) || query.getAll(key).length !== 1) throw new SyntaxError("Invalid image identity query.");
  return imageIdentity.parse({
    runId: query.get("runId"), operationId: query.get("operationId"), workflowRunId: query.get("workflowRunId"),
    parentWorkflowRunId: query.get("parentWorkflowRunId") || null, inputFingerprint: query.get("inputFingerprint"),
  });
}
function stableUuid(key: string, namespace: string): string {
  const hex = createHash("sha256").update(namespace).update(":").update(key).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function available(state: ConfigState): Response | null { return state.enabled ? null : reply(state.reason === "invalid" ? 503 : 404, state.reason === "invalid" ? "runner_unavailable" : "not_found"); }
function browserAuth(request: Request, state: ConfigState, write: boolean): Response | null {
  const unavailable = available(state);
  if (unavailable) return unavailable;
  if (!hasValidBasicAuthorization(request.headers.get("authorization"))) return reply(401, "unauthorized");
  if (write && state.enabled && request.headers.get("origin") !== state.config.publicOrigin) return reply(403, "invalid_origin");
  return null;
}
function campaignProfile(state: ConfigState, mode: "balanced" | "real") {
  if (!state.enabled) return null;
  const authority = state.config.m4?.state === "granted" ? state.config.m4.authority : undefined;
  if (mode === "real") {
    const real = state.config.real;
    return real?.state === "ready" ? realExecutionPolicyFromM4TechnicalProfile(real.sourcePolicy, real.tokenPolicy,
      real.bindings.map(({ role, taskId, persona, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) =>
        ({ role, taskId, persona, appId, publishedWorkflowId, toolProviderId, ...(finalPageIllustration ? { finalPageIllustration } : {}) })), real) : null;
  }
  return authority?.grant.tokenPolicy ? executionPolicyFromM4TechnicalProfile(m4PolicySnapshot(authority.policy).policy,
    authority.grant.tokenPolicy) : null;
}
function toolAuth(request: Request, state: ConfigState): Response | null {
  const unavailable = available(state);
  if (unavailable) return unavailable;
  if (state.enabled && !validToolKey(request.headers.get("x-booklet-tool-key"), state.config.callbackKey)) return reply(401, "unauthorized");
  return null;
}
export function createBookletRunnerHttp(deps: { database?: () => Database; config?: () => ConfigState; mutate?: typeof runTrackedMutation; store?: () => AssetStore; admit?: typeof assertMutationsAllowed; runtime?: (config: BookletRunnerConfig) => WorkflowRuntime } = {}) {
  const database = deps.database ?? getDatabase;
  const config = deps.config ?? readM4RunnerConfig;
  const mutate = deps.mutate ?? runTrackedMutation;
  const store = deps.store ?? createAssetStore;
  const admit = deps.admit ?? assertMutationsAllowed;
  function services(state: ConfigState) {
    const db = database();
    // One client for this callback, never a cross-request verification cache.
    const callbackStore = diagnosticAssetStore(store());
    const authority = state.enabled && state.config.m4?.state === "granted" ? state.config.m4.authority : undefined;
    return { repository: createExperimentRepository(db, { store: () => callbackStore,
      ...(authority ? { m4Authority: authority, m4ExecutionEnabled: true as const } : {}),
      ...(state.enabled && state.config.real?.state === "ready" ? { realExecutionEnabled: true as const } : {}) }),
      context: createExperimentContextService(db, { store: () => callbackStore }) };
  }
  async function run(operation: () => Promise<Response>, budgetMs = 30_000) { try { return await withOperationBudget(Date.now() + budgetMs, operation); } catch (error) { return safeError(error); } }
  function withContinuation<T extends { runId: string }>(view: T, state: ConfigState) {
    const grants = state.enabled && state.config.m4?.state === "granted" ? state.config.m4.authority?.grant.continuations : undefined;
    return hasRetainedDecisionContinuation(view, grants) ? { ...view, retainedDecisionContinuation: true as const } : view;
  }
  async function runSummaries(request: Request, state: ConfigState) {
    const query = new URL(request.url).searchParams;
    const page = z.coerce.number().int().min(0).max(10000).parse(query.get("page") ?? 0);
    const limit = z.coerce.number().int().min(1).max(50).parse(query.get("limit") ?? 20);
    const collections = database().collections;
    const rows = await collections.experiment_runs.find({}, { projection: {
      _id: 1, bookletId: 1, predecessorRunId: 1, persona: 1, mode: 1, status: 1, revision: 1, pauseRequested: 1,
      counters: 1, limits: 1, safeFailure: 1, failureDiagnostics: 1, activeOperationId: 1, evaluationStatus: 1, generationCompletedAtMs: 1,
      preparation: 1, "pendingApproval.reason": 1, "pendingApproval.requestDigest": 1,
      "pendingApproval.requiredTotal": 1, "pendingApproval.nextAction": 1, "pendingApproval.declinedAtMs": 1,
      "execution.campaignId": 1, brief: 1, createdAtMs: 1, updatedAtMs: 1, terminalAtMs: 1,
    } }).sort({ createdAtMs: -1, _id: -1 }).skip(page * limit).limit(limit + 1).toArray();
    const selected = rows.slice(0, limit);
    const bookletIds = [...new Set(selected.map(row => row.bookletId).filter((id): id is string => !!id))];
    const booklets = bookletIds.length ? await collections.booklets.find({ _id: { $in: bookletIds } },
      { projection: { _id: 1, workingTitle: 1 } }).toArray() : [];
    const titles = new Map(booklets.map(booklet => [booklet._id, booklet.workingTitle]));
    const campaignIds = selected.flatMap(row => row.execution ? [row.execution.campaignId] : []);
    const campaignRows = campaignIds.length ? await collections.experiment_campaigns.find({ _id: { $in: campaignIds } },
      { projection: { _id: 1, schemaVersion: 1, allowance: 1, runId: 1, revision: 1,
        textRequests: 1, imageRequests: 1, reservedMicrodollars: 1, settledMicrodollars: 1 } }).toArray() : [];
    const executionLimits = new Map(campaignRows.map(row => [row._id, row as unknown as {
      _id: string; schemaVersion?: string; runId?: string; revision?: number;
      textRequests?: number; imageRequests?: number; reservedMicrodollars?: number; settledMicrodollars?: number;
      allowance?: { maxMicrodollars: number; textCalls: number; imageCalls: number; steps: number;
        textRevisions: number; imageRevisions: number; noProgress: number } }]));
    const runIds = selected.map(row => row._id);
    const measured = runIds.length ? await collections.experiment_operations.find({ runId: { $in: runIds } },
      { projection: { _id: 1, runId: 1, role: 1, taskId: 1, reservationCount: 1,
        "m4Reservation.unsettledMicrodollars": 1, "m4Reservation.settledMicrodollars": 1,
        "realImageReservation.unsettledMicrodollars": 1, "realImageReservation.settledMicrodollars": 1,
        "contextDiagnostics.warnings": 1 } }).toArray() : [];
    const warningCounts = new Map<string, { measuredOperations: number; warningCount: number }>();
    const operationsByRun = new Map<string, typeof measured>();
    for (const operation of measured) {
      const group = operationsByRun.get(operation.runId) ?? [];
      group.push(operation);
      operationsByRun.set(operation.runId, group);
    }
    for (const operation of measured as Array<{ runId: string; contextDiagnostics?: Pick<ContextDiagnostics, "warnings"> }>) {
      if (!operation.contextDiagnostics) continue;
      const current = warningCounts.get(operation.runId) ?? { measuredOperations: 0, warningCount: 0 };
      current.measuredOperations += 1;
      current.warningCount += operation.contextDiagnostics.warnings?.length ?? 0;
      warningCounts.set(operation.runId, current);
    }
    return { runs: selected.map(row => withContinuation({ runId: row._id, bookletId: row.bookletId,
      title: titles.get(row.bookletId) || row.brief || null,
      contextWarningSummary: warningCounts.get(row._id) ?? null,
      predecessorRunId: row.predecessorRunId, persona: row.persona, mode: row.mode, status: row.status,
      revision: row.revision, createdAtMs: row.createdAtMs, updatedAtMs: row.updatedAtMs, terminalAtMs: row.terminalAtMs ?? null,
      timing: runTiming(row), attention: runAttention(row),
      runAccounting: runAccounting(row.mode, operationsByRun.get(row._id) ?? [], row.counters?.payableText ?? 0,
        row.counters?.payableImage ?? 0),
      currentTask: (operationsByRun.get(row._id) ?? []).find(operation => operation._id === row.activeOperationId)?.taskId ?? (operationsByRun.get(row._id) ?? []).find(operation => operation._id === row.activeOperationId)?.role ?? null,
      pauseRequested: row.pauseRequested, counters: row.counters, limits: (() => {
        const campaign = row.execution ? executionLimits.get(row.execution.campaignId) : null;
        return campaign?.schemaVersion === "execution_v1" && campaign.runId === row._id && campaign.allowance ?
          { text: campaign.allowance.textCalls, image: campaign.allowance.imageCalls, steps: campaign.allowance.steps } : row.limits;
      })(),
      pendingApproval: row.pendingApproval ?? null,
      executionAllowance: (() => {
        const campaign = row.execution ? executionLimits.get(row.execution.campaignId) : null;
        return campaign?.schemaVersion === "execution_v1" && campaign.runId === row._id && campaign.allowance ? {
          campaignId: campaign._id, revision: campaign.revision, totals: campaign.allowance,
          reservedMicrodollars: campaign.reservedMicrodollars, settledMicrodollars: campaign.settledMicrodollars,
          textRequests: campaign.textRequests, imageRequests: campaign.imageRequests,
          latestApprovalReference: null,
        } : null;
      })(),
      safeFailure: row.safeFailure, failureDiagnostics: row.failureDiagnostics ?? null, activeOperationId: row.activeOperationId, evaluationStatus: row.evaluationStatus,
      generationStatus: row.generationCompletedAtMs ? "complete" : "in_progress",
      preparation: row.preparation ? { identity: row.preparation.ownerId, startedAtMs: row.preparation.startedAtMs,
        deadlineAtMs: row.preparation.deadlineAtMs, unresolved: row.preparation.unresolved ?? false } : null,
    }, state)), page, hasMore: rows.length > limit };
  }
  return {
    imageReplacementPreview(request: Request, runId: string) { return run(async () => {
      const state = config(); const denied = browserAuth(request, state, false); if (denied) return denied;
      if (!state.enabled) return reply(503, "unavailable");
      const operationId = opaqueIdSchema.parse(new URL(request.url).searchParams.get("operationId"));
      return data(await createImageReplacementService({ database: database(), config: state.config, store: store() })
        .preview(opaqueIdSchema.parse(runId), operationId));
    }); },
    externalErrors(request: Request, runId: string) { return run(async () => {
      const state = config(); const denied = browserAuth(request, state, false); if (denied) return denied;
      const id = opaqueIdSchema.parse(runId);
      const savedRun = await database().collections.experiment_runs.findOne({ _id: id }, { projection: { _id: 1, externalErrors: 1 } });
      if (!savedRun) return reply(404, "not_found");
      const page = z.coerce.number().int().min(0).max(100_000).parse(new URL(request.url).searchParams.get("page") ?? 0);
      const rows = await database().collections.experiment_operations.find({ runId: id }, { projection: {
        _id: 1, role: 1, taskId: 1, workflowRunId: 1, attempt: 1, createdAtMs: 1, deadlineAtMs: 1,
        externalErrors: 1, realImageObservation: 1, m4Observation: 1,
      } }).sort({ createdAtMs: 1, _id: 1 }).skip(page * 20).limit(21).toArray();
      return data({ page, hasMore: rows.length > 20, runErrors: redactExternalError(savedRun.externalErrors ?? []).value,
        operations: rows.slice(0, 20).map(row => ({ operationId: row._id, role: row.role, taskId: row.taskId,
        workflowRunId: row.workflowRunId, attempt: row.attempt, startedAtMs: row.createdAtMs, deadlineAtMs: row.deadlineAtMs,
        errors: redactExternalError(row.externalErrors ?? []).value,
        textEvidence: redactExternalError(row.m4Observation ?? null).value,
        providerEvidence: row.realImageObservation ? redactExternalError(JSON.parse(row.realImageObservation.resultJson)).value : null })) });
    }); },
    campaigns(request: Request) { return run(async () => {
      const state = config(); const denied = browserAuth(request, state, false); if (denied) return denied;
      const query = new URL(request.url).searchParams;
      const mode = z.enum(["balanced", "real"]).parse(query.get("mode"));
      const persona = personaSchema.parse(query.get("persona"));
      const page = z.coerce.number().int().min(0).max(100_000).parse(query.get("page") ?? 0);
      const policy = campaignProfile(state, mode);
      if (!policy) return reply(422, "mode_unavailable");
      const profileHash = executionPolicySnapshot(policy).hash;
      const collection = database().collections.experiment_campaigns as unknown as Collection<ExecutionCampaignDocument>;
      const rows = await collection.find({ schemaVersion: "execution_v1", mode, persona, profileHash, runId: null },
        { projection: { _id: 1, predecessorRunId: 1, allowance: 1, createdAtMs: 1 } })
        .sort({ createdAtMs: -1, _id: 1 }).skip(page * 5).limit(6).toArray();
      return data({ campaigns: rows.slice(0, 5).map(row => ({ campaignId: row._id,
        predecessorRunId: row.predecessorRunId, totals: executionAllowanceSchema.parse(row.allowance), createdAtMs: row.createdAtMs })),
        page, hasMore: rows.length > 5 });
    }); },
    campaign(request: Request) { return run(async () => {
      const state = config(); const denied = browserAuth(request, state, true); if (denied) return denied;
      if (!state.enabled) return reply(503, "runner_unavailable");
      const key = opaqueIdSchema.safeParse(request.headers.get("idempotency-key"));
      if (!key.success) return reply(400, "invalid_request");
      const body = campaignGrant.parse(await boundedJson(request, 4096));
      const policy = campaignProfile(state, body.mode);
      if (!policy) return reply(422, "mode_unavailable");
      const campaignId = stableUuid(key.data, "execution-campaign");
      const approvalId = stableUuid(key.data, "execution-initial-approval");
      const totals = body.totals ? executionAllowanceSchema.parse({ ...body.totals, maxMicrodollars: body.maxMicrodollars }) :
        defaultExecutionAllowance(body.persona, body.maxMicrodollars);
      const ledger = createExecutionAllowanceLedger(database());
      const campaign = await mutate(() => withMongoTransaction(database(), session => ledger.create(session, {
        campaignId, mode: body.mode, persona: body.persona, profile: policy,
        predecessorRunId: body.predecessorRunId ?? null, approvalId, reference: body.reference,
        totals, nowMs: Date.now() })), {});
      return data({ campaignId: campaign._id, approvalId: campaign.approvals[0].approvalId,
        profileHash: campaign.profileHash, totals: campaign.allowance, revision: campaign.revision,
        predecessorRunId: campaign.predecessorRunId, runId: campaign.runId }, campaign.createdAtMs === campaign.updatedAtMs ? 201 : 200);
    }); },
    approval(request: Request, runId: string) { return run(async () => {
      const state = config(); const denied = browserAuth(request, state, true); if (denied) return denied;
      const key = opaqueIdSchema.safeParse(request.headers.get("idempotency-key"));
      if (!key.success) return reply(400, "invalid_request");
      const body = approvalGrant.parse(await boundedJson(request, 4096));
      if (body.action === "image_replacement") {
        if (!state.enabled) return reply(503, "unavailable");
        const saved = await mutate(() => createImageReplacementService({ database: database(), config: state.config, store: store() })
          .approve({ ...body, runId: opaqueIdSchema.parse(runId), approvalId: key.data }), { runId });
        return data({ runId, ...saved });
      }
      if (body.action === "adjust") {
        const saved = await mutate(() => withMongoTransaction(database(), session =>
          createExecutionAllowanceLedger(database()).adjust(session, { runId: opaqueIdSchema.parse(runId),
            approvalId: key.data, reference: body.reference, expectedRunRevision: body.expectedRevision,
            expectedCampaignRevision: body.expectedCampaignRevision, totals: body.totals, nowMs: Date.now() })), { runId });
        return data({ runId, ...saved });
      }
      if (body.action === "decline") {
        const saved = await mutate(() => withMongoTransaction(database(), session =>
          createExecutionAllowanceLedger(database()).decline(session, { runId: opaqueIdSchema.parse(runId),
            declineId: key.data, reference: body.reference, expectedRunRevision: body.expectedRevision,
            expectedCampaignRevision: body.expectedCampaignRevision, expectedPendingDigest: body.expectedPendingDigest,
            nowMs: Date.now() })), { runId });
        return data({ runId, declineId: key.data, ...saved, status: "paused" });
      }
      const saved = await mutate(() => services(state).repository.approveExecutionAllowance({ runId: opaqueIdSchema.parse(runId),
          approvalId: key.data, reference: body.reference, expectedRunRevision: body.expectedRevision,
          expectedCampaignRevision: body.expectedCampaignRevision, expectedPendingDigest: body.expectedPendingDigest,
          totals: body.totals, nowMs: Date.now() }), { runId });
      return data({ runId, approvalId: saved.approval.approvalId, campaignRevision: saved.approval.campaignRevision,
        runRevision: saved.runRevision, totals: saved.approval.totals, reused: saved.reused });
    }); },
    probePreflight(request: Request) { return run(async () => {
      const state = config(); const denied = browserAuth(request, state, false); if (denied) return denied;
      if (!state.enabled) return reply(503, "runner_unavailable");
      const query = new URL(request.url).searchParams;
      const identity = probeIdentitySchema.parse({ appId: query.get("appId"), publication: query.get("publication") });
      return data(await checkProbeReadiness(database(), state.config, identity));
    }); },
    summaries(request: Request) { return run(async () => {
      const state = config(); const denied = browserAuth(request, state, false); if (denied) return denied;
      return data(await runSummaries(request, state));
    }); },
    operationControl(request: Request, runId: string, action: "inspect" | "stop") { return run(async () => {
      const state = config(); const denied = browserAuth(request, state, true); if (denied) return denied;
      if (!state.enabled) return reply(503, "runner_unavailable");
      const body = operationControl.parse(await boundedJson(request, 4096));
      const dispatcher = createExperimentDispatcher({ database: database(), config: state.config, store });
      await mutate(async () => { if ("preparationId" in body) await dispatcher.inspectPreparation({ runId: opaqueIdSchema.parse(runId), ...body, stop: action === "stop" });
        else await dispatcher.inspect({ runId: opaqueIdSchema.parse(runId), ...body, ...(action === "stop" ? { stop: "manual" as const } : {}) }); },
      { admitted: true, runId, ...("operationId" in body ? { operationId: body.operationId } : {}) });
      const view = await services(state).context.getRunView(runId);
      if (!("operationId" in body) || !view) return data(view);
      const [savedRun, savedOperation] = await Promise.all([
        database().collections.experiment_runs.findOne({ _id: runId }),
        database().collections.experiment_operations.findOne({ _id: body.operationId, runId }),
      ]);
      return data({ ...view, recovery: operationRecoveryOutcome({ run: savedRun, operation: savedOperation,
        completionRecoveries: state.config.m4?.state === "granted" ? state.config.m4.authority?.grant.completionRecoveries : undefined }) });
    }); },
    imageFixture(request: Request) { return run(async () => {
      const denied = toolAuth(request, config()); if (denied) return denied;
      const input = imageQuery(request);
      await admit({ admitted: true });
      await measurePhase(input, "fixture_authorization", () => createExperimentImageRepository(database(), { store }).authorizeFixture(input));
      const rgb = Buffer.from(input.inputFingerprint.slice(0, 6), "hex");
      const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();
      return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/png", "X-Content-Type-Options": "nosniff" } });
    }); },
    imageComplete(request: Request) { return run(async () => {
      const denied = toolAuth(request, config()); if (denied) return denied;
      const input = imageQuery(request);
      const content = await boundedBytes(request, MAX_EXPERIMENT_IMAGE_BYTES);
      const completed = await measurePhase(input, "image_callback", () => mutate(() => createExperimentImageStorage({
      database: database(), store: diagnosticAssetStore(store()) }).complete({ identity: input, content }), { admitted: true, runId: input.runId, operationId: input.operationId }));
      return data({ assetId: completed.asset?._id, sha256: completed.operation.imageCompletionDigest, state: completed.operation.state, reused: completed.reused });
    }); },
    imageEvidence(request: Request) { return run(async () => {
      const state = config(); const denied = toolAuth(request, state); if (denied) return denied;
      if (!state.enabled || state.config.real?.state !== "ready") return reply(422, "mode_unavailable");
      // SDK messages, stacks and escaped Unicode bodies can exceed the former
      // compact receipt limit. Keep a finite bound for the sanitized evidence.
      const body = realImageEvidence.parse(await boundedJson(request, 262_144));
      const saved = await measurePhase(body, "real_image_evidence", () => mutate(() =>
        services(state).repository.observeRealImage({ ...body, nowMs: Date.now() }),
      { admitted: true, runId: body.runId, operationId: body.operationId }));
      return data(saved);
    }); },
    list(request: Request) { return run(async () => { const state = config(); const denied = browserAuth(request, state, false); if (denied) return denied;
      if (new URL(request.url).searchParams.get("view") === "summary") return data(await runSummaries(request, state));
      const { repository, context } = services(state); const rows = await repository.listRuns(); return data(await Promise.all(rows.map(async row => {
        const view = await context.getRunView(row._id); return view ? withContinuation(view, state) : view;
      }))); }); },
    detail(request: Request, runId: string) { return run(async () => {
      const state = config(); const denied = browserAuth(request, state, false); if (denied) return denied;
      const id = opaqueIdSchema.parse(runId);
      if (new URL(request.url).searchParams.get("view") === "control") {
        const saved = await database().collections.experiment_runs.findOne({ _id: id }, { projection: controlStateProjection });
        return saved ? data(withContinuation(controlState(saved), state)) : reply(404, "not_found");
      }
      const view = await services(state).context.getRunView(id);
      return view ? data(withContinuation(view, state)) : reply(404, "not_found");
    }); },
    create(request: Request) { return run(async () => {
      const state = config(); const denied = browserAuth(request, state, true); if (denied) return denied;
      if (!state.enabled) return reply(503, "runner_unavailable");
      const key = opaqueIdSchema.safeParse(request.headers.get("idempotency-key"));
      if (!key.success) return reply(400, "invalid_request");
      const body = createRunInputSchema.parse(await boundedJson(request, 4096));
      const authority = state.config.m4?.state === "granted" ? state.config.m4.authority : undefined;
      if (body.mode === "real" && (state.config.real?.state !== "ready" || !body.executionCampaignId) ||
          body.mode === "balanced" && (!body.executionCampaignId && (!authority || body.predecessorRunId))) return reply(422, "mode_unavailable");
      const { repository, context } = services(state);
      const runId = stableUuid(key.data, "booklet-run");
      const bookletId = stableUuid(key.data, "booklet");
      const prior = await repository.getRun(runId);
      if (prior) {
        if (prior.persona !== body.persona || prior.mode !== body.mode || prior.predecessorRunId !== (body.predecessorRunId ?? null) ||
            (body.mode === "balanced" || body.mode === "real") && (body.executionCampaignId ? prior.execution?.campaignId !== body.executionCampaignId :
              prior.m4?.campaignId !== authority!.grant.campaignId)) return reply(409, "conflict");
        return data(await measurePhase({ runId }, "create_existing_detail", () => context.getRunView(prior._id)), 200);
      }
      const saved = await measurePhase({ runId }, "create_mutation", () => mutate(() => repository.createRun({ runId, bookletId, ...body,
        ...(body.mode === "balanced" && !body.executionCampaignId ? { campaignId: authority!.grant.campaignId } : {}),
        configuration: configurationSnapshot(state.config, body.persona, body.mode), nowMs: Date.now() }), { runId }));
      return data(await measurePhase({ runId }, "create_detail", () => context.getRunView(saved._id)), 201);
    }, 60_000); },
    control(request: Request, runId: string, action: "pause" | "resume") { return run(async () => {
      const state = config(); const denied = browserAuth(request, state, true); if (denied) return denied;
      const { responseMode, ...body } = runControl.parse(await boundedJson(request, 4096));
      const { repository, context } = services(state);
      try {
        const saved = await mutate(async () => {
          const current = await repository.getRun(runId);
          const input = { runId: opaqueIdSchema.parse(runId), ...body, nowMs: Date.now() };
          if (action === "resume" && current?.generationCompletedAtMs != null &&
              (current.status === "blocked" || current.status === "completed" && current.evaluationStatus === "failed")) {
            return createExperimentCompletionService(database(), store()).completeAdvisoryFailure(input);
          }
          return repository[action](input);
        }, { runId });
        if (responseMode === "receipt") return data(withContinuation(controlState(saved), state));
        const view = await context.getRunView(saved._id);
        return data(view ? withContinuation(view, state) : view);
      } catch (error) {
        if (responseMode === "receipt" && error instanceof ExperimentRepositoryError && error.code === "stale_revision") return reply(409, "stale_revision");
        throw error;
      }
    }); },
    selectPages(request: Request, runId: string) { return run(async () => {
      const denied = browserAuth(request, config(), true); if (denied) return denied;
      const key = opaqueIdSchema.safeParse(request.headers.get("idempotency-key"));
      if (!key.success) return reply(400, "invalid_request");
      const body = pageSelection.parse(await boundedJson(request, 8192));
      if (body.batch.runId !== opaqueIdSchema.parse(runId)) return reply(400, "invalid_request");
      // The repository verifies every supplied source identity against current
      // saved approvals. Selection records intent; it never starts provider work.
      const selected = await mutate(() => createExperimentPageBatchRepository({ database: database(), store: store() })
        .select({ ...body, jobId: stableUuid(key.data, `page-batch:${runId}`) }), { runId });
      return data(selected);
    }); },
    tool(request: Request, action: "authorize" | "context" | "result" | "failure") { return run(async () => {
      const state = config(); const denied = toolAuth(request, state); if (denied) return denied;
      if (!state.enabled) return reply(503, "runner_unavailable");
      const schema = action === "result" ? result : action === "failure" ? failure : identity;
      const raw = await boundedJson(request, action === "result" ? 2_359_296 : 4096);
      const callbackIdentity = identity.strip().parse(raw);
      const { repository, context } = services(state);
      const savedRun = await measurePhase(callbackIdentity, "callback_run_read", () => repository.getRun(callbackIdentity.runId));
      if (!savedRun) return reply(404, "not_found");
      if (savedRun.mode === "real" && (await repository.getOperation(callbackIdentity.operationId))?.providerKind === "image") {
        if (state.config.real?.state !== "ready" || action !== "authorize") {
          if (action === "result" || action === "failure") {
            const operation = await repository.getOperation(callbackIdentity.operationId);
            if (operation?.runId !== savedRun._id || operation?.workflowRunId !== callbackIdentity.workflowRunId) return reply(409, "conflict");
            await mutate(() => repository.requestObservation(operation._id), { admitted: true, runId: savedRun._id, operationId: operation._id });
            return data({ observationRequested: true });
          }
          return reply(422, "mode_unavailable");
        }
        const body = identity.parse(raw);
        const operation = await repository.getOperation(body.operationId);
        if (!operation || operation.runId !== body.runId || operation.mode !== "real" || operation.providerKind !== "image" ||
            operation.dispatchStartedAtMs == null || operation.parentWorkflowRunId !== body.parentWorkflowRunId ||
            operation.workflowRunId && operation.workflowRunId !== body.workflowRunId || !operation.realImagePreparation) return reply(409, "conflict");
        const saved = savedConfigurationSchema.parse(JSON.parse(savedRun.configurationJson)).find(item => item.role === "image" && item.taskId === null);
        const binding = state.config.real.bindings.find(item => item.role === "image" && item.taskId === null);
        if (!saved || !binding || saved.appId !== binding.appId || saved.publishedWorkflowId !== binding.publishedWorkflowId || !binding.apiKey)
          return reply(409, "conflict");
        const deadlineAtMs = (operation.deadlineAtMs ?? 0) - RECONCILIATION_RESERVE_MS;
        const remote = await (deps.runtime ?? createWorkflowRuntime)(state.config).retrieve(binding, body.workflowRunId,
          { deadlineAtMs: Math.min(deadlineAtMs, Date.now() + 30_000), signal: request.signal });
        if (remote.kind !== "execution" || remote.execution.status !== "running" ||
            remote.execution.workflow_id !== binding.publishedWorkflowId || remote.execution.id !== body.workflowRunId)
          return reply(409, "conflict");
        const claim = await mutate(() => repository.claimOperation({ ...body, nowMs: Date.now() }, {
          workflowId: remote.execution.workflow_id,
          ...(remote.execution.task_id ? { workflowTaskId: remote.execution.task_id } : {}),
        }), { admitted: true, runId: body.runId, operationId: body.operationId });
        return data({ started: claim.started, reason: claim.reason ?? null, role: operation.role, taskId: operation.taskId,
          subjectKind: operation.subjectKind, subjectId: operation.subjectId, mode: operation.mode,
          inputFingerprint: operation.inputFingerprint,
          ...(claim.started ? { requestJson: operation.realImagePreparation.requestJson } : {}) });
      }
      if (savedRun.mode === "balanced" || savedRun.mode === "real") {
        const operation = await measurePhase(callbackIdentity, "callback_operation_read", () => repository.getOperation(callbackIdentity.operationId));
        if (!operation || operation.runId !== callbackIdentity.runId || operation.mode !== savedRun.mode ||
            operation.dispatchStartedAtMs == null || operation.parentWorkflowRunId !== callbackIdentity.parentWorkflowRunId ||
            operation.workflowRunId && operation.workflowRunId !== callbackIdentity.workflowRunId) return reply(409, "conflict");
        if (operation.providerKind === "text") {
          if (action === "result" || action === "failure") {
            // The callback is only a wake-up hint. Content, costs and terminal
            // state come from the coordinator's authenticated original GET.
            if (!operation.workflowRunId) return reply(409, "conflict");
            await mutate(() => repository.requestObservation(operation._id), { admitted: true, runId: savedRun._id, operationId: operation._id });
            return data({ observationRequested: true });
          }
          if (action === "context") return reply(422, "mode_unavailable");
          const body = identity.parse(raw);
          const authority = state.config.m4?.state === "granted" ? state.config.m4.authority : undefined;
          if (!authority && !savedRun.execution) return reply(422, "mode_unavailable");
          const summary = { role: operation.role, taskId: operation.taskId, subjectKind: operation.subjectKind,
            subjectId: operation.subjectId, mode: operation.mode, inputFingerprint: operation.inputFingerprint };
          if (operation.state !== "prepared") return data({ started: false, reason: "already_started", ...summary, m4: null });
          const snapshot = savedRun.execution ? executionPolicySnapshot(JSON.parse(savedRun.execution.profileJson)) :
            m4PolicySnapshot(authority!.policy);
          const prep = operation.m4Preparation;
          const expected = snapshot.policy.publications.find((item) => item.role === operation.role && item.taskId === operation.taskId &&
            item.persona === (operation.role === "tester" ? savedRun.persona : null));
          const saved = savedConfigurationSchema.parse(JSON.parse(savedRun.configurationJson)).find((item) => item.role === operation.role && item.taskId === operation.taskId);
          const candidates = (savedRun.mode === "real" ? state.config.real?.bindings ?? [] : state.config.bindings).filter((item) => item.role === operation.role && item.taskId === operation.taskId &&
            item.persona === (operation.role === "tester" ? savedRun.persona : null));
          const binding = candidates[0];
          if (!prep || !expected || !saved || candidates.length !== 1 || !binding.apiKey ||
              (savedRun.execution ? savedRun.execution.profileHash !== snapshot.hash ||
                savedRun.execution.profileJson !== snapshot.json :
                savedRun.m4?.campaignId !== authority!.grant.campaignId || savedRun.m4.policyHash !== snapshot.hash) ||
              prep.policyHash !== snapshot.hash || prep.configurationHash !== savedRun.configurationHash ||
              prep.requestDigest !== m4Hash(prep.requestJson) || prep.parentWorkflowRunId !== body.parentWorkflowRunId ||
              prep.publishedWorkflowId !== expected.publishedWorkflowId ||
              [saved, binding].some((item) => item.appId !== expected.appId || item.publishedWorkflowId !== expected.publishedWorkflowId ||
                item.toolProviderId !== expected.toolProviderId || item.finalPageIllustration !== expected.finalPageIllustration)) return reply(409, "conflict");
          const runtime = (deps.runtime ?? createWorkflowRuntime)(state.config);
          const deadlineAtMs = (operation.deadlineAtMs ?? 0) - RECONCILIATION_RESERVE_MS;
          const remote = await measurePhase(body, "authorization_execution_readback", () => runtime.retrieve(binding, body.workflowRunId,
            { deadlineAtMs: Math.min(deadlineAtMs, Date.now() + 30_000), signal: request.signal }));
          if (remote.kind !== "execution" || remote.execution.id !== body.workflowRunId || remote.execution.status !== "running" ||
              remote.execution.workflow_id !== expected.publishedWorkflowId) return reply(409, "conflict");
          const timeoutSeconds = Math.min(snapshot.policy.maxTimeoutSeconds, Math.floor((deadlineAtMs - Date.now()) / 1000));
          if (timeoutSeconds < 1) return reply(409, "conflict");
          // Measure the actual escaped JSON envelope, not the unescaped request.
          // These immutable prepared bytes are the only context sent to M4 text.
          let encoded = m4AuthorizationEnvelope(summary, prep.requestJson,
            savedRun.execution ? executionPolicySnapshot(JSON.parse(savedRun.execution.profileJson)).policy.tokenPolicy :
              m4AdmittedTokenPolicy(m4PolicySnapshot(authority!.policy).policy, authority!.grant, prep).snapshot,
            timeoutSeconds, deadlineAtMs,
            (operation.role === "tester" || operation.role === "judge") && savedRun.generationCompletedAtMs != null);
          if (savedRun.mode === "real" && savedRun.generationCompletedAtMs != null &&
              (operation.role === "tester" || operation.role === "judge")) {
            const report = operation.realReportPreparation;
            if (!report || !prep || report.uploadFileIds.length === 0 ||
                report.carrierJson !== JSON.stringify(JSON.parse(report.carrierJson), (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
                  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)) return reply(409, "conflict");
            const envelope = JSON.parse(encoded) as { data: { m4: { requestJson: string; requestDigest: string } } };
            envelope.data.m4.requestJson = report.carrierJson;
            envelope.data.m4.requestDigest = report.finalRequestDigest;
            encoded = JSON.stringify(envelope);
          }
          if (Buffer.byteLength(encoded, "utf8") > 1_048_576) return reply(422, "invalid_result");
          const execution = remote.execution;
          const claim = await measurePhase(body, "authorization_admission", () => mutate(() =>
            repository.claimOperation({ ...body, nowMs: Date.now() }, { workflowId: execution.workflow_id,
              ...(execution.task_id ? { workflowTaskId: execution.task_id } : {}) }),
          { admitted: true, runId: body.runId, operationId: body.operationId }));
          return claim.started ? new Response(encoded, { headers: { ...headers, "Content-Type": "application/json" } }) :
            data({ started: false, reason: claim.reason ?? null, ...summary, m4: null });
        }
        if (action === "authorize" && !savedRun.execution && (state.config.m4?.state !== "granted" || !state.config.m4.authority)) return reply(422, "mode_unavailable");
      }
      const body = schema.parse(raw);
      if (action === "authorize") {
        const prepared = await repository.getOperation(body.operationId);
        if (!prepared || prepared.runId !== body.runId || prepared.dispatchStartedAtMs == null) return reply(409, "conflict");
      }
      if (action === "context") return data(await context.getOperationContext(body));
      if (action === "authorize") {
        return measurePhase(body, "authorization", async () => {
          const claim = await measurePhase(body, "claim", () => mutate(() => repository.claimOperation({ ...body, nowMs: Date.now() }), { admitted: true, runId: body.runId, operationId: body.operationId }));
          const operationContext = claim.started ? await measurePhase(body, "context", () => context.getOperationContext(body, claim.imageRequest)) : null;
          return data({ started: claim.started, reason: claim.reason ?? null, role: claim.operation.role, taskId: claim.operation.taskId, subjectKind: claim.operation.subjectKind, subjectId: claim.operation.subjectId, mode: claim.operation.mode, inputFingerprint: claim.operation.inputFingerprint, context: operationContext });
        });
      }
      if (action === "result") {
        const parsed = result.parse(body);
        const envelope = resultEnvelopeSchema.parse({ runId: parsed.runId, operationId: parsed.operationId, workflowRunId: parsed.workflowRunId, inputFingerprint: parsed.inputFingerprint, result: parsed.result });
        const completed = await measurePhase(body, "result_finalization", () => mutate(() => repository.completeOperation({ envelope, parentWorkflowRunId: parsed.parentWorkflowRunId, nowMs: Date.now() }), { admitted: true, runId: body.runId, operationId: body.operationId }));
        return data({ reused: completed.reused, state: completed.operation.state, materialization: resultSummary(completed.operation.materializationJson) });
      }
      const parsed = failure.parse(body);
      const failed = await mutate(() => repository.failOperation({ ...parsed, nowMs: Date.now() }), { admitted: true, runId: parsed.runId, operationId: parsed.operationId });
      return data({ state: failed.state });
    }); },
  };
}

export const bookletRunnerHttp = createBookletRunnerHttp();
