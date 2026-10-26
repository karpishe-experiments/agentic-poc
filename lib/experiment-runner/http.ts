import { controlState, controlStateProjection, hasRetainedDecisionContinuation } from "@/lib/experiment-runner/control-state";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getDatabase, type Database } from "@/db/client";
import { createExperimentRepository, ExperimentRepositoryError } from "@/db/experiment-repository";
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
import { createRunInputSchema, experimentTaskSchema, resultEnvelopeSchema } from "@/lib/contracts/experiment-runner";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { hasValidBasicAuthorization } from "@/lib/http/basic-auth";
import { assertMutationsAllowed, runTrackedMutation } from "@/lib/application/deployment-control";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import { readStreamChunk } from "@/lib/operations/read-stream";
import { RECONCILIATION_RESERVE_MS, withOperationBudget } from "@/lib/operations/budget";
import { checkProbeReadiness, probeIdentitySchema } from "@/lib/experiment-runner/probe-preflight";
import { operationRecoveryOutcome } from "@/lib/operations/operation-recovery-outcome";
import type { ContextDiagnostics } from "@/lib/experiment-runner/context-diagnostics";

const identity = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema, workflowRunId: opaqueIdSchema, parentWorkflowRunId: opaqueIdSchema.nullable() });
const imageIdentity = identity.extend({ inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/) });
const control = z.strictObject({ expectedRevision: z.number().int().nonnegative() });
const runControl = control.extend({ responseMode: z.literal("receipt").optional() });
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
  if (error instanceof ExperimentImageValidationError) return reply(error.code === "too_large" ? 413 : 422, error.code === "too_large" ? "image_too_large" : "invalid_image");
  if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof RangeError) return reply(400, "invalid_request");
  if (error instanceof ExperimentRepositoryError) {
    if (error.code === "not_found") return reply(404, "not_found");
    if (error.code === "invalid_input") return reply(400, "invalid_request");
    if (error.code === "invalid_result") return reply(422, "invalid_result");
    return reply(409, "conflict");
  }
  return reply(503, "unavailable");
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
      ...(authority ? { m4Authority: authority, m4ExecutionEnabled: true as const } : {}) }),
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
      counters: 1, limits: 1, safeFailure: 1, activeOperationId: 1, evaluationStatus: 1, generationCompletedAtMs: 1,
      preparation: 1, brief: 1, createdAtMs: 1, updatedAtMs: 1,
    } }).sort({ createdAtMs: -1, _id: -1 }).skip(page * limit).limit(limit + 1).toArray();
    const selected = rows.slice(0, limit);
    const bookletIds = [...new Set(selected.map(row => row.bookletId).filter((id): id is string => !!id))];
    const booklets = bookletIds.length ? await collections.booklets.find({ _id: { $in: bookletIds } },
      { projection: { _id: 1, workingTitle: 1 } }).toArray() : [];
    const titles = new Map(booklets.map(booklet => [booklet._id, booklet.workingTitle]));
    const runIds = selected.map(row => row._id);
    const measured = runIds.length ? await collections.experiment_operations.find({ runId: { $in: runIds },
      contextDiagnostics: { $exists: true } }, { projection: { _id: 0, runId: 1, "contextDiagnostics.warnings": 1 } }).toArray() : [];
    const warningCounts = new Map<string, { measuredOperations: number; warningCount: number }>();
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
      revision: row.revision, createdAtMs: row.createdAtMs, updatedAtMs: row.updatedAtMs,
      pauseRequested: row.pauseRequested, counters: row.counters, limits: row.limits,
      safeFailure: row.safeFailure, activeOperationId: row.activeOperationId, evaluationStatus: row.evaluationStatus,
      generationStatus: row.generationCompletedAtMs ? "complete" : "in_progress",
      preparation: row.preparation ? { identity: row.preparation.ownerId, startedAtMs: row.preparation.startedAtMs,
        deadlineAtMs: row.preparation.deadlineAtMs, unresolved: row.preparation.unresolved ?? false } : null,
    }, state)), page, hasMore: rows.length > limit };
  }
  return {
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
      if (body.mode === "real" || body.mode === "balanced" && (!authority || body.predecessorRunId)) return reply(422, "mode_unavailable");
      const { repository, context } = services(state);
      const runId = stableUuid(key.data, "booklet-run");
      const bookletId = stableUuid(key.data, "booklet");
      const prior = await repository.getRun(runId);
      if (prior) {
        if (prior.persona !== body.persona || prior.mode !== body.mode || prior.predecessorRunId !== (body.predecessorRunId ?? null) ||
            body.mode === "balanced" && prior.m4?.campaignId !== authority!.grant.campaignId) return reply(409, "conflict");
        return data(await measurePhase({ runId }, "create_existing_detail", () => context.getRunView(prior._id)), 200);
      }
      const saved = await measurePhase({ runId }, "create_mutation", () => mutate(() => repository.createRun({ runId, bookletId, ...body,
        ...(body.mode === "balanced" ? { campaignId: authority!.grant.campaignId } : {}),
        configuration: configurationSnapshot(state.config, body.persona), nowMs: Date.now() }), { runId }));
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
      if (savedRun.mode === "real") return reply(422, "mode_unavailable");
      if (savedRun.mode === "balanced") {
        const operation = await measurePhase(callbackIdentity, "callback_operation_read", () => repository.getOperation(callbackIdentity.operationId));
        if (!operation || operation.runId !== callbackIdentity.runId || operation.mode !== "balanced" ||
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
          if (!authority) return reply(422, "mode_unavailable");
          const summary = { role: operation.role, taskId: operation.taskId, subjectKind: operation.subjectKind,
            subjectId: operation.subjectId, mode: operation.mode, inputFingerprint: operation.inputFingerprint };
          if (operation.state !== "prepared") return data({ started: false, reason: "already_started", ...summary, m4: null });
          const snapshot = m4PolicySnapshot(authority.policy);
          const prep = operation.m4Preparation;
          const expected = snapshot.policy.publications.find((item) => item.role === operation.role && item.taskId === operation.taskId &&
            item.persona === (operation.role === "tester" ? savedRun.persona : null));
          const saved = savedConfigurationSchema.parse(JSON.parse(savedRun.configurationJson)).find((item) => item.role === operation.role && item.taskId === operation.taskId);
          const candidates = state.config.bindings.filter((item) => item.role === operation.role && item.taskId === operation.taskId &&
            item.persona === (operation.role === "tester" ? savedRun.persona : null));
          const binding = candidates[0];
          if (!prep || !expected || !saved || candidates.length !== 1 || !binding.apiKey ||
              savedRun.m4?.campaignId !== authority.grant.campaignId || savedRun.m4.policyHash !== snapshot.hash ||
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
          const encoded = m4AuthorizationEnvelope(summary, prep.requestJson,
            m4AdmittedTokenPolicy(snapshot.policy, authority.grant, prep).snapshot, timeoutSeconds, deadlineAtMs,
            (operation.role === "tester" || operation.role === "judge") && savedRun.generationCompletedAtMs != null);
          if (Buffer.byteLength(encoded, "utf8") > 1_048_576) return reply(422, "invalid_result");
          const execution = remote.execution;
          const claim = await measurePhase(body, "authorization_admission", () => mutate(() =>
            repository.claimOperation({ ...body, nowMs: Date.now() }, { workflowId: execution.workflow_id,
              ...(execution.task_id ? { workflowTaskId: execution.task_id } : {}) }),
          { admitted: true, runId: body.runId, operationId: body.operationId }));
          return claim.started ? new Response(encoded, { headers: { ...headers, "Content-Type": "application/json" } }) :
            data({ started: false, reason: claim.reason ?? null, ...summary, m4: null });
        }
        if (action === "authorize" && (state.config.m4?.state !== "granted" || !state.config.m4.authority)) return reply(422, "mode_unavailable");
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
