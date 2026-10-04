import { createHash } from "node:crypto";
import { z } from "zod";
import { getDatabase, type Database } from "@/db/client";
import { createExperimentRepository, ExperimentRepositoryError } from "@/db/experiment-repository";
import { createExperimentImageRepository } from "@/db/experiment-images";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { createExperimentImageStorage } from "@/lib/experiment-runner/image-storage";
import { ExperimentImageValidationError, MAX_EXPERIMENT_IMAGE_BYTES } from "@/lib/experiment-runner/image-validation";
import { createAssetStore } from "@/lib/assets/create-asset-store";
import type { AssetStore } from "@/lib/assets/asset-store";
import sharp from "sharp";
import { configurationSnapshot, readBookletRunnerConfig, validToolKey, type ConfigState } from "@/lib/experiment-runner/config";
import { createRunInputSchema, narrativeTaskSchema, resultEnvelopeSchema } from "@/lib/contracts/experiment-runner";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { hasValidBasicAuthorization } from "@/lib/http/basic-auth";
import { assertMutationsAllowed, runTrackedMutation } from "@/lib/application/deployment-control";

const identity = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema, workflowRunId: opaqueIdSchema, parentWorkflowRunId: opaqueIdSchema.nullable() });
const imageIdentity = identity.extend({ inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/) });
const control = z.strictObject({ expectedRevision: z.number().int().nonnegative() });
const failure = identity.extend({ category: z.enum(["definite_failure", "unknown_outcome"]) });
const result = identity.extend({ inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/), result: resultEnvelopeSchema.shape.result });
const headers = { "Cache-Control": "no-store" };
const errorMessages: Record<string, string> = {
  invalid_request: "Request is invalid.", invalid_result: "Result is invalid.", not_found: "Resource was not found.",
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
  answeredQuestionId: opaqueIdSchema.optional(), delegatedTaskId: narrativeTaskSchema.optional(),
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
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
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
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
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
export function createBookletRunnerHttp(deps: { database?: () => Database; config?: () => ConfigState; mutate?: typeof runTrackedMutation; store?: () => AssetStore; admit?: typeof assertMutationsAllowed } = {}) {
  const database = deps.database ?? getDatabase;
  const config = deps.config ?? readBookletRunnerConfig;
  const mutate = deps.mutate ?? runTrackedMutation;
  const store = deps.store ?? createAssetStore;
  const admit = deps.admit ?? assertMutationsAllowed;
  function services() { const db = database(); return { repository: createExperimentRepository(db), context: createExperimentContextService(db) }; }
  async function run(operation: () => Promise<Response>) { try { return await operation(); } catch (error) { return safeError(error); } }
  return {
    imageFixture(request: Request) { return run(async () => {
      const denied = toolAuth(request, config()); if (denied) return denied;
      const input = imageQuery(request);
      await admit();
      await createExperimentImageRepository(database()).authorizeFixture(input);
      const rgb = Buffer.from(input.inputFingerprint.slice(0, 6), "hex");
      const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();
      return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/png", "X-Content-Type-Options": "nosniff" } });
    }); },
    imageComplete(request: Request) { return run(async () => {
      const denied = toolAuth(request, config()); if (denied) return denied;
      const input = imageQuery(request);
      const content = await boundedBytes(request, MAX_EXPERIMENT_IMAGE_BYTES);
      const completed = await mutate(() => createExperimentImageStorage({ database: database(), store: store() }).complete({ identity: input, content }));
      return data({ assetId: completed.asset?._id, sha256: completed.operation.imageCompletionDigest, state: completed.operation.state, reused: completed.reused });
    }); },
    list(request: Request) { return run(async () => { const state = config(); const denied = browserAuth(request, state, false); if (denied) return denied; const { repository, context } = services(); const rows = await repository.listRuns(); return data(await Promise.all(rows.map((row) => context.getRunView(row._id)))); }); },
    detail(request: Request, runId: string) { return run(async () => { const state = config(); const denied = browserAuth(request, state, false); if (denied) return denied; const view = await services().context.getRunView(opaqueIdSchema.parse(runId)); return view ? data(view) : reply(404, "not_found"); }); },
    create(request: Request) { return run(async () => {
      const state = config(); const denied = browserAuth(request, state, true); if (denied) return denied;
      if (!state.enabled) return reply(503, "runner_unavailable");
      const key = opaqueIdSchema.safeParse(request.headers.get("idempotency-key"));
      if (!key.success) return reply(400, "invalid_request");
      const body = createRunInputSchema.parse(await boundedJson(request, 4096));
      if (body.mode !== "simulated") return reply(422, "mode_unavailable");
      const { repository, context } = services();
      const runId = stableUuid(key.data, "booklet-run");
      const bookletId = stableUuid(key.data, "booklet");
      const prior = await repository.getRun(runId);
      if (prior) {
        if (prior.persona !== body.persona || prior.mode !== body.mode || prior.predecessorRunId !== (body.predecessorRunId ?? null)) return reply(409, "conflict");
        return data(await context.getRunView(prior._id), 200);
      }
      const saved = await mutate(() => repository.createRun({ runId, bookletId, ...body, configuration: configurationSnapshot(state.config, body.persona), nowMs: Date.now() }));
      return data(await context.getRunView(saved._id), 201);
    }); },
    control(request: Request, runId: string, action: "pause" | "resume") { return run(async () => {
      const state = config(); const denied = browserAuth(request, state, true); if (denied) return denied;
      const body = control.parse(await boundedJson(request, 4096));
      const { repository, context } = services();
      const saved = await mutate(() => repository[action]({ runId: opaqueIdSchema.parse(runId), ...body, nowMs: Date.now() }));
      return data(await context.getRunView(saved._id));
    }); },
    tool(request: Request, action: "authorize" | "context" | "result" | "failure") { return run(async () => {
      const state = config(); const denied = toolAuth(request, state); if (denied) return denied;
      const schema = action === "result" ? result : action === "failure" ? failure : identity;
      const body = schema.parse(await boundedJson(request, action === "result" ? 2_359_296 : 4096));
      const { repository, context } = services();
      const savedRun = await repository.getRun(body.runId);
      if (!savedRun) return reply(404, "not_found");
      if (savedRun.mode !== "simulated") return reply(422, "mode_unavailable");
      if (action === "authorize") {
        const prepared = await repository.getOperation(body.operationId);
        if (!prepared || prepared.runId !== body.runId || prepared.dispatchStartedAtMs == null) return reply(409, "conflict");
      }
      if (action === "context") return data(await context.getOperationContext(body));
      if (action === "authorize") {
        const claim = await mutate(() => repository.claimOperation({ ...body, nowMs: Date.now() }));
        return data({ started: claim.started, reason: claim.reason ?? null, role: claim.operation.role, taskId: claim.operation.taskId, subjectKind: claim.operation.subjectKind, subjectId: claim.operation.subjectId, mode: claim.operation.mode, inputFingerprint: claim.operation.inputFingerprint, context: claim.started ? await context.getOperationContext(body) : null });
      }
      if (action === "result") {
        const parsed = result.parse(body);
        const envelope = resultEnvelopeSchema.parse({ runId: parsed.runId, operationId: parsed.operationId, workflowRunId: parsed.workflowRunId, inputFingerprint: parsed.inputFingerprint, result: parsed.result });
        const completed = await mutate(() => repository.completeOperation({ envelope, parentWorkflowRunId: parsed.parentWorkflowRunId, nowMs: Date.now() }));
        return data({ reused: completed.reused, state: completed.operation.state, materialization: resultSummary(completed.operation.materializationJson) });
      }
      const parsed = failure.parse(body);
      const failed = await mutate(() => repository.failOperation({ ...parsed, nowMs: Date.now() }));
      return data({ state: failed.state });
    }); },
  };
}

export const bookletRunnerHttp = createBookletRunnerHttp();
