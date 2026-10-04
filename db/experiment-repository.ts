import { createHash } from "node:crypto";
import { z } from "zod";
import { withMongoTransaction, type Database } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { CASES, EXPERIMENT_PROFILE, MAX_NARRATIVE_CONTENT_BYTES, experimentModeSchema, experimentRoleSchema, experimentTaskSchema, parseNarrativeTaskProposal, personaSchema, resultEnvelopeSchema, validateRoleResult, type RoleResult } from "@/lib/contracts/experiment-runner";
import { isNarrativeTask } from "@/lib/experiment-runner/narrative-tasks";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentImageRequestSchema, imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { materializeNarrativeResult, prepareNarrativeContext } from "@/db/experiment-narrative";
import { assertCurrentImageSources } from "@/db/experiment-images";

const time = z.number().int().nonnegative();
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/);
const configurationItem = z.strictObject({ role: experimentRoleSchema, taskId: experimentTaskSchema.nullable(), appId: opaqueIdSchema, publishedWorkflowId: opaqueIdSchema, toolProviderId: opaqueIdSchema.nullable() });
const createInput = z.strictObject({ runId: opaqueIdSchema, bookletId: opaqueIdSchema, persona: personaSchema, mode: experimentModeSchema, predecessorRunId: opaqueIdSchema.optional(), configuration: z.array(configurationItem).max(100), nowMs: time });
const controlInput = z.strictObject({ runId: opaqueIdSchema, expectedRevision: z.number().int().nonnegative(), nowMs: time });
const prepareInput = z.strictObject({ operationId: opaqueIdSchema, runId: opaqueIdSchema, expectedRevision: z.number().int().nonnegative(), role: experimentRoleSchema, taskId: experimentTaskSchema.nullable(), subjectKind: z.enum(["book", "character", "location", "page"]), subjectId: opaqueIdSchema, inputFingerprint: fingerprint, attempt: z.number().int().min(1), providerKind: z.enum(["text", "image"]), imageRequest: experimentImageRequestSchema.optional(), nowMs: time });
const claimInput = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema, workflowRunId: opaqueIdSchema, parentWorkflowRunId: opaqueIdSchema.nullable(), nowMs: time });
const dispatchInput = claimInput.omit({ workflowRunId: true });
const publicationInput = claimInput.extend({ workflowId: opaqueIdSchema });
const completeInput = z.strictObject({ envelope: resultEnvelopeSchema, parentWorkflowRunId: opaqueIdSchema.nullable(), nowMs: time });
const failInput = claimInput.extend({ category: z.enum(["unknown_outcome", "definite_failure"]) });
const outcomeInput = dispatchInput.extend({ category: z.enum(["unknown_outcome", "definite_failure", "paused"]) });
const progressInput = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema, fingerprint64: fingerprint, nowMs: time });
const blockInput = z.strictObject({ runId: opaqueIdSchema, category: z.enum(["unknown_outcome", "definite_failure"]), nowMs: time });

export class ExperimentRepositoryError extends Error {
  constructor(public readonly code: "invalid_input" | "not_found" | "conflict" | "stale_revision" | "invalid_state" | "invalid_result", message: string) {
    super(message); this.name = "ExperimentRepositoryError";
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ExperimentRepositoryError("invalid_input", "Experiment input is invalid.");
  return result.data;
}
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function must<T>(value: T | null, label: string): T {
  if (value === null) throw new ExperimentRepositoryError("not_found", `${label} was not found.`);
  return value;
}
function isDuplicate(error: unknown): boolean { return !!error && typeof error === "object" && "code" in error && error.code === 11000; }

export function createExperimentRepository(database: Database) {
  const runs = database.collections.experiment_runs;
  const operations = database.collections.experiment_operations;

  async function getRun(runId: string) { return runs.findOne({ _id: parse(opaqueIdSchema, runId) }); }
  async function listRuns() { return runs.find().sort({ createdAtMs: -1, _id: -1 }).toArray(); }
  async function getOperation(operationId: string) { return operations.findOne({ _id: parse(opaqueIdSchema, operationId) }); }
  async function listOperations(runId: string) { return operations.find({ runId: parse(opaqueIdSchema, runId) }).sort({ createdAtMs: 1, _id: 1 }).toArray(); }

  async function createRun(raw: unknown): Promise<ExperimentRunDocument> {
    const input = parse(createInput, raw);
    const configurationJson = canonical(input.configuration);
    const configurationHash = digest(configurationJson);
    const prior = await runs.findOne({ _id: input.runId });
    if (prior) {
      if (prior.bookletId === input.bookletId && prior.persona === input.persona && prior.mode === input.mode && prior.predecessorRunId === (input.predecessorRunId ?? null) && prior.configurationHash === configurationHash) return prior;
      throw new ExperimentRepositoryError("conflict", "Run ID already belongs to different input.");
    }
    const fixed = CASES[input.persona];
    const run: ExperimentRunDocument = { _id: input.runId, schemaVersion: "2", bookletId: input.bookletId, persona: input.persona, mode: input.mode, brief: fixed.brief, predecessorRunId: input.predecessorRunId ?? null, configurationJson, configurationHash, status: "queued", evaluationStatus: "pending", revision: 0, pauseRequested: false, activeOperationId: null, counters: { logicalText: 0, logicalImage: 0, payableText: 0, payableImage: 0, steps: 0 }, limits: { text: fixed.llmLimit, image: fixed.imageLimit, steps: 300 }, safeFailure: null, activeDelegationId: null, decisionSequence: 0, pendingDecisionJson: null, textRevisions: 0, imageRevisions: 0, createdAtMs: input.nowMs, updatedAtMs: input.nowMs };
    try {
      await withMongoTransaction(database, async (session) => {
        if (input.predecessorRunId) {
          const predecessor = must(await runs.findOne({ _id: input.predecessorRunId }, { session }), "Predecessor run");
          if (!(["completed", "failed", "blocked"] as string[]).includes(predecessor.status)) throw new ExperimentRepositoryError("invalid_state", "Predecessor run is not terminal.");
        }
        await database.collections.booklets.insertOne({ _id: input.bookletId, schemaVersion: "2", workingTitle: "Untitled booklet", lifecycle: "draft", currentStage: "J01", coverAssetId: null, executionProfile: EXPERIMENT_PROFILE, experimentRunId: input.runId, createdAtMs: input.nowMs, updatedAtMs: input.nowMs }, { session });
        await runs.insertOne(run, { session });
      });
    } catch (error) {
      if (isDuplicate(error)) {
        const existing = await runs.findOne({ _id: input.runId });
        if (existing && existing.bookletId === input.bookletId && existing.persona === input.persona && existing.mode === input.mode && existing.predecessorRunId === (input.predecessorRunId ?? null) && existing.configurationHash === configurationHash) return existing;
        throw new ExperimentRepositoryError("conflict", "Run or booklet ID already exists.");
      }
      throw error;
    }
    return run;
  }

  async function pause(raw: unknown): Promise<ExperimentRunDocument> {
    const input = parse(controlInput, raw);
    return withMongoTransaction(database, async (session) => {
      const run = must(await runs.findOne({ _id: input.runId }, { session }), "Run");
      if (run.revision !== input.expectedRevision) throw new ExperimentRepositoryError("stale_revision", "Run revision changed.");
      if (run.pauseRequested) return run;
      const updated = await runs.findOneAndUpdate({ _id: input.runId, revision: input.expectedRevision }, { $set: { pauseRequested: true, status: run.status === "queued" || run.status === "running" ? "paused" : run.status, updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("stale_revision", "Run revision changed.");
      return updated;
    });
  }

  async function resume(raw: unknown): Promise<ExperimentRunDocument> {
    const input = parse(controlInput, raw);
    return withMongoTransaction(database, async (session) => {
      const run = must(await runs.findOne({ _id: input.runId }, { session }), "Run");
      if (run.revision !== input.expectedRevision) throw new ExperimentRepositoryError("stale_revision", "Run revision changed.");
      if (run.status === "completed" || run.status === "failed") throw new ExperimentRepositoryError("invalid_state", "Terminal run cannot resume.");
      if (run.status === "blocked") throw new ExperimentRepositoryError("invalid_state", "Blocked run needs inspection before recovery.");
      if (!run.pauseRequested) return run;
      const active = run.activeOperationId ? await operations.findOne({ _id: run.activeOperationId }, { session }) : null;
      const status = active?.state === "started" || active?.state === "unknown" ? "running" : "queued";
      const updated = await runs.findOneAndUpdate({ _id: input.runId, revision: input.expectedRevision }, { $set: { pauseRequested: false, status, updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("stale_revision", "Run revision changed.");
      return updated;
    });
  }

  async function prepareOperation(raw: unknown): Promise<ExperimentOperationDocument> {
    const input = parse(prepareInput, raw);
    if ((input.role === "image") !== (input.providerKind === "image") || (input.role === "specialist" && !isNarrativeTask(input.taskId)) || (input.role !== "specialist" && input.role !== "image" && input.taskId)) throw new ExperimentRepositoryError("invalid_input", "Role, task and provider kind do not match.");
    if (input.imageRequest && (input.role !== "image" || imageRequestFingerprint(input.imageRequest) !== input.inputFingerprint)) throw new ExperimentRepositoryError("invalid_input", "Image request must match its operation fingerprint.");
    const idempotencyKey = digest(canonical([input.runId, input.role, input.taskId, input.subjectKind, input.subjectId, input.inputFingerprint, input.attempt]));
    const existing = await operations.findOne({ idempotencyKey });
    if (existing) return existing;
    try {
      return await withMongoTransaction(database, async (session) => {
        const run = must(await runs.findOne({ _id: input.runId }, { session }), "Run");
        if (run.revision !== input.expectedRevision) throw new ExperimentRepositoryError("stale_revision", "Run revision changed.");
        if (run.status !== "queued" && run.status !== "running" || run.pauseRequested || run.activeOperationId) throw new ExperimentRepositoryError("invalid_state", "Run cannot prepare another operation.");
        if (input.subjectKind === "book" && input.subjectId !== run.bookletId) throw new ExperimentRepositoryError("invalid_input", "Book subject must match booklet ID.");
        if (input.role === "specialist" && input.subjectKind !== "book") throw new ExperimentRepositoryError("invalid_input", "Narrative tasks require the book subject.");
        if (input.imageRequest) await assertCurrentImageSources(database, session, run, input.imageRequest);
        const narrative = input.role === "specialist" && isNarrativeTask(input.taskId) ? await prepareNarrativeContext(database, session, run, input.taskId) : { expectedTargetVersionId: null, dependencyVersionIds: [] };
        const operation: ExperimentOperationDocument = { _id: input.operationId, runId: input.runId, role: input.role, taskId: input.taskId, subjectKind: input.subjectKind, subjectId: input.subjectId, idempotencyKey, inputFingerprint: input.inputFingerprint, attempt: input.attempt, mode: run.mode, providerKind: input.providerKind, state: "prepared", workflowRunId: null, parentWorkflowRunId: null, reservationCount: 0, deadlineAtMs: null, resultJson: null, resultDigest: null, warningsJson: "[]", expectedTargetVersionId: narrative.expectedTargetVersionId, dependencyVersionIds: narrative.dependencyVersionIds, materializationJson: null, safeFailure: null, createdAtMs: input.nowMs, updatedAtMs: input.nowMs };
        if (input.imageRequest) {
          operation.imageRequestJson = JSON.stringify(input.imageRequest);
          operation.dependencyVersionIds = [...input.imageRequest.sourceVersionIds];
        }
        await operations.insertOne(operation, { session });
        const changed = await runs.updateOne({ _id: input.runId, revision: input.expectedRevision, activeOperationId: null }, { $set: { activeOperationId: input.operationId, updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session });
        if (changed.modifiedCount !== 1) throw new ExperimentRepositoryError("stale_revision", "Run revision changed.");
        return operation;
      });
    } catch (error) {
      if (isDuplicate(error)) {
        const duplicate = await operations.findOne({ idempotencyKey });
        if (duplicate) return duplicate;
        throw new ExperimentRepositoryError("conflict", "Operation ID already exists.");
      }
      throw error;
    }
  }

  async function beginDispatch(raw: unknown): Promise<{ dispatched: boolean; operation: ExperimentOperationDocument }> {
    const input = parse(dispatchInput, raw);
    return withMongoTransaction(database, async (session) => {
      const operation = must(await operations.findOne({ _id: input.operationId, runId: input.runId }, { session }), "Operation");
      const run = must(await runs.findOne({ _id: input.runId }, { session }), "Run");
      if (operation.dispatchStartedAtMs != null) {
        if (operation.parentWorkflowRunId !== input.parentWorkflowRunId) throw new ExperimentRepositoryError("conflict", "Dispatch parent identity changed.");
        return { dispatched: false, operation };
      }
      if (run.activeOperationId !== operation._id || operation.state !== "prepared") throw new ExperimentRepositoryError("invalid_state", "Operation is not awaiting dispatch.");
      if (run.pauseRequested || run.status === "paused" || (run.status !== "queued" && run.status !== "running")) return { dispatched: false, operation };
      const updated = await operations.findOneAndUpdate({ _id: operation._id, state: "prepared", dispatchStartedAtMs: null }, { $set: { dispatchStartedAtMs: input.nowMs, parentWorkflowRunId: input.parentWorkflowRunId, updatedAtMs: input.nowMs } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("conflict", "Dispatch was recorded concurrently.");
      // Touch the run in the same transaction so Pause cannot race admission.
      const changed = await runs.updateOne({ _id: run._id, revision: run.revision, activeOperationId: operation._id, pauseRequested: false }, { $set: { updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session });
      if (changed.modifiedCount !== 1) throw new ExperimentRepositoryError("stale_revision", "Run changed before dispatch.");
      return { dispatched: true, operation: updated };
    });
  }

  async function claimOperation(raw: unknown): Promise<{ started: boolean; reason?: "already_started" | "paused" | "limit_exhausted" | "blocked"; operation: ExperimentOperationDocument }> {
    const input = parse(claimInput, raw);
    return withMongoTransaction(database, async (session) => {
      const operation = must(await operations.findOne({ _id: input.operationId, runId: input.runId }, { session }), "Operation");
      const run = must(await runs.findOne({ _id: input.runId }, { session }), "Run");
      if (operation.dispatchStartedAtMs != null && operation.parentWorkflowRunId !== input.parentWorkflowRunId) throw new ExperimentRepositoryError("conflict", "Claim parent differs from dispatch.");
      if (operation.workflowRunId && (operation.workflowRunId !== input.workflowRunId || operation.parentWorkflowRunId !== input.parentWorkflowRunId)) throw new ExperimentRepositoryError("conflict", "Workflow identity differs from the saved claim.");
      if (operation.state !== "prepared") return { started: false, reason: "already_started", operation };
      if (run.activeOperationId !== operation._id) throw new ExperimentRepositoryError("conflict", "Operation is not active.");
      if (run.pauseRequested || run.status === "paused") return { started: false, reason: "paused", operation };
      if (run.status !== "queued" && run.status !== "running") return { started: false, reason: "blocked", operation };
      if (operation.imageRequestJson) {
        const imageRequest = experimentImageRequestSchema.parse(JSON.parse(operation.imageRequestJson) as unknown);
        if (operation.role !== "image" || imageRequestFingerprint(imageRequest) !== operation.inputFingerprint) throw new ExperimentRepositoryError("invalid_state", "Saved image request differs from its operation.");
        await assertCurrentImageSources(database, session, run, imageRequest);
      }
      const logical = operation.providerKind === "text" ? "logicalText" : "logicalImage";
      const payable = operation.providerKind === "text" ? "payableText" : "payableImage";
      const limit = operation.providerKind === "text" ? run.limits.text : run.limits.image;
      if (run.counters[logical] >= limit || run.counters.steps >= run.limits.steps) {
        await runs.updateOne({ _id: run._id, revision: run.revision }, { $set: { status: "blocked", safeFailure: "limit_exhausted", updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session });
        return { started: false, reason: "limit_exhausted", operation };
      }
      const isPayable = run.mode === "real" || run.mode === "balanced" && operation.providerKind === "text";
      const counters = { ...run.counters, [logical]: run.counters[logical] + 1, steps: run.counters.steps + 1 };
      if (isPayable) counters[payable] = run.counters[payable] + 1;
      const updated = await operations.findOneAndUpdate({ _id: operation._id, state: "prepared" }, { $set: { state: "started", workflowRunId: input.workflowRunId, parentWorkflowRunId: input.parentWorkflowRunId, deadlineAtMs: input.nowMs + 600_000, reservationCount: 1, updatedAtMs: input.nowMs } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("conflict", "Operation was claimed concurrently.");
      const changed = await runs.updateOne({ _id: run._id, revision: run.revision }, { $set: { status: "running", counters, updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session });
      if (changed.modifiedCount !== 1) throw new ExperimentRepositoryError("stale_revision", "Run revision changed.");
      return { started: true, operation: updated };
    });
  }

  async function recordDispatchIdentity(raw: unknown): Promise<ExperimentOperationDocument> {
    const input = parse(claimInput, raw);
    return withMongoTransaction(database, async (session) => {
      const operation = must(await operations.findOne({ _id: input.operationId, runId: input.runId }, { session }), "Operation");
      if (operation.dispatchStartedAtMs == null || operation.parentWorkflowRunId !== input.parentWorkflowRunId) throw new ExperimentRepositoryError("conflict", "Dispatch identity is not established.");
      if (operation.workflowRunId) {
        if (operation.workflowRunId !== input.workflowRunId) throw new ExperimentRepositoryError("conflict", "Workflow identity changed.");
        return operation;
      }
      if (operation.state !== "prepared" && operation.state !== "unknown") throw new ExperimentRepositoryError("invalid_state", "Operation cannot save a dispatch identity.");
      const updated = await operations.findOneAndUpdate({ _id: operation._id, workflowRunId: null, state: operation.state }, { $set: { workflowRunId: input.workflowRunId, updatedAtMs: input.nowMs } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("conflict", "Workflow identity changed concurrently.");
      return updated;
    });
  }

  async function verifyDispatchPublication(raw: unknown): Promise<ExperimentOperationDocument> {
    const input = parse(publicationInput, raw);
    return withMongoTransaction(database, async (session) => {
      const operation = must(await operations.findOne({ _id: input.operationId, runId: input.runId }, { session }), "Operation");
      const run = must(await runs.findOne({ _id: input.runId }, { session }), "Run");
      if (operation.dispatchStartedAtMs == null || operation.workflowRunId !== input.workflowRunId || operation.parentWorkflowRunId !== input.parentWorkflowRunId) throw new ExperimentRepositoryError("conflict", "Publication verification identity differs from dispatch.");
      const configuration = parse(z.array(configurationItem), JSON.parse(run.configurationJson) as unknown);
      const expected = configuration.find((item) => item.role === operation.role && item.taskId === operation.taskId);
      if (!expected || expected.publishedWorkflowId !== input.workflowId || (operation.verifiedWorkflowId && operation.verifiedWorkflowId !== input.workflowId)) throw new ExperimentRepositoryError("conflict", "Runtime publication differs from saved configuration.");
      if (operation.verifiedWorkflowId) return operation;
      const updated = await operations.findOneAndUpdate({ _id: operation._id, workflowRunId: input.workflowRunId, verifiedWorkflowId: null }, { $set: { verifiedWorkflowId: input.workflowId, updatedAtMs: input.nowMs } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("conflict", "Publication verification changed concurrently.");
      return updated;
    });
  }

  async function recordDispatchOutcome(raw: unknown): Promise<ExperimentOperationDocument> {
    const input = parse(outcomeInput, raw);
    return withMongoTransaction(database, async (session) => {
      const operation = must(await operations.findOne({ _id: input.operationId, runId: input.runId }, { session }), "Operation");
      const run = must(await runs.findOne({ _id: input.runId }, { session }), "Run");
      if (operation.dispatchStartedAtMs == null || operation.parentWorkflowRunId !== input.parentWorkflowRunId) throw new ExperimentRepositoryError("conflict", "Dispatch identity differs from outcome.");
      if (operation.state === "succeeded") return operation;
      if (input.category === "paused") {
        if (operation.state !== "prepared" || operation.reservationCount !== 0) throw new ExperimentRepositoryError("invalid_state", "Only a verified unclaimed operation can close.");
      } else if (operation.state !== "prepared" && operation.state !== "started" && operation.state !== "unknown") {
        if (operation.state === "failed" && operation.safeFailure === input.category) return operation;
        throw new ExperimentRepositoryError("invalid_state", "Operation cannot record this outcome.");
      }
      if (run.activeOperationId !== operation._id) throw new ExperimentRepositoryError("conflict", "Operation is not active.");
      const state = input.category === "unknown_outcome" ? "unknown" : "failed";
      const safeFailure = input.category === "paused" ? null : input.category;
      if (operation.state === state && operation.safeFailure === safeFailure) return operation;
      const imageFailureHistory = operation.role === "image" && safeFailure ? { imageFailureHistory: [...(operation.imageFailureHistory ?? []), { category: safeFailure, recordedAtMs: input.nowMs }] } : {};
      const updated = await operations.findOneAndUpdate({ _id: operation._id, state: operation.state }, { $set: { state, safeFailure, ...imageFailureHistory, updatedAtMs: input.nowMs } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("conflict", "Outcome changed concurrently.");
      const changed = await runs.updateOne({ _id: run._id, revision: run.revision, activeOperationId: operation._id }, { $set: { status: input.category === "paused" ? run.pauseRequested ? "paused" : "queued" : "blocked", safeFailure, activeOperationId: state === "unknown" ? operation._id : null, updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session });
      if (changed.modifiedCount !== 1) throw new ExperimentRepositoryError("stale_revision", "Run changed before outcome.");
      return updated;
    });
  }

  async function recordProgress(raw: unknown): Promise<ExperimentRunDocument> {
    const input = parse(progressInput, raw);
    return withMongoTransaction(database, async (session) => {
      const operation = must(await operations.findOne({ _id: input.operationId, runId: input.runId }, { session }), "Operation");
      const run = must(await runs.findOne({ _id: input.runId }, { session }), "Run");
      if (operation.state !== "succeeded") throw new ExperimentRepositoryError("invalid_state", "Progress requires a successful operation.");
      if (run.progressOperationId === operation._id) {
        if (run.progressFingerprint !== input.fingerprint64) throw new ExperimentRepositoryError("conflict", "Progress fingerprint changed for the operation.");
        return run;
      }
      if (run.progressOperationId) {
        const previous = await operations.findOne({ _id: run.progressOperationId }, { session });
        if (previous && previous.createdAtMs > operation.createdAtMs) throw new ExperimentRepositoryError("conflict", "Progress operation is stale.");
      }
      if (run.activeOperationId || run.status === "completed" || run.status === "failed" || run.status === "blocked") throw new ExperimentRepositoryError("invalid_state", "Run cannot record progress.");
      const noProgressCount = run.progressFingerprint === input.fingerprint64 ? (run.noProgressCount ?? 0) + 1 : 0;
      const blocked = noProgressCount >= 3;
      const updated = await runs.findOneAndUpdate({ _id: run._id, revision: run.revision, activeOperationId: null }, { $set: { progressFingerprint: input.fingerprint64, progressOperationId: operation._id, noProgressCount, ...(blocked ? { status: "blocked" as const, safeFailure: "definite_failure" as const } : {}), updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("stale_revision", "Run progress changed concurrently.");
      return updated;
    });
  }

  async function blockRun(raw: unknown): Promise<ExperimentRunDocument> {
    const input = parse(blockInput, raw);
    return withMongoTransaction(database, async (session) => {
      const run = must(await runs.findOne({ _id: input.runId }, { session }), "Run");
      if (run.status === "completed" || run.status === "failed") throw new ExperimentRepositoryError("invalid_state", "Terminal run cannot be blocked.");
      if (run.status === "blocked") {
        if (run.safeFailure === input.category) return run;
        throw new ExperimentRepositoryError("conflict", "Run is blocked for another reason.");
      }
      const updated = await runs.findOneAndUpdate({ _id: run._id, revision: run.revision }, { $set: { status: "blocked", safeFailure: input.category, updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("stale_revision", "Run changed before block.");
      return updated;
    });
  }

  async function completeOperation(raw: unknown): Promise<{ operation: ExperimentOperationDocument; reused: boolean }> {
    const input = parse(completeInput, raw);
    const { envelope } = input;
    return withMongoTransaction(database, async (session) => {
      const operation = must(await operations.findOne({ _id: envelope.operationId, runId: envelope.runId }, { session }), "Operation");
      const run = must(await runs.findOne({ _id: envelope.runId }, { session }), "Run");
      if (operation.workflowRunId !== envelope.workflowRunId || operation.parentWorkflowRunId !== input.parentWorkflowRunId || operation.inputFingerprint !== envelope.inputFingerprint) throw new ExperimentRepositoryError("conflict", "Completion identity differs from the claim.");
      let result: RoleResult;
      try { result = validateRoleResult(operation.role, envelope.result); }
      catch { throw new ExperimentRepositoryError("invalid_result", "Result kind does not match the operation role."); }
      let warnings: { field: string; message: string }[] = [];
      if (result.kind === "proposal") {
        if (result.payload.taskId !== operation.taskId) throw new ExperimentRepositoryError("invalid_result", "Proposal task differs from the operation.");
        try {
          const parsed = parseNarrativeTaskProposal(result.payload.taskId, run.persona, result.payload.content);
          result = { kind: "proposal", payload: { taskId: result.payload.taskId, content: parsed.content } };
          warnings = parsed.warnings;
        } catch { throw new ExperimentRepositoryError("invalid_result", "Narrative proposal is invalid or exceeds the storage limit."); }
      }
      const resultJson = canonical(result);
      if (new TextEncoder().encode(resultJson).byteLength > MAX_NARRATIVE_CONTENT_BYTES) throw new ExperimentRepositoryError("invalid_result", "Result exceeds the 2 MiB storage limit.");
      const resultDigest = digest(resultJson);
      if (operation.state === "succeeded") {
        if (operation.resultDigest === resultDigest) return { operation, reused: true };
        throw new ExperimentRepositoryError("conflict", "Completed operation has a different result.");
      }
      if (run.status === "blocked" && run.safeFailure !== "unknown_outcome") throw new ExperimentRepositoryError("invalid_state", "A definite blocker requires inspection before completion.");
      if ((operation.state !== "started" && operation.state !== "unknown") || operation.reservationCount !== 1 || run.activeOperationId !== operation._id) throw new ExperimentRepositoryError("invalid_state", "Operation is not awaiting authorized completion.");
      const materialized = await materializeNarrativeResult(database, session, run, operation, result, warnings, input.nowMs);
      const finalWarnings = Array.isArray(materialized.summary.warnings) ? materialized.summary.warnings : warnings;
      const updated = await operations.findOneAndUpdate({ _id: operation._id, state: operation.state }, { $set: { state: "succeeded", resultJson, resultDigest, warningsJson: canonical(finalWarnings), materializationJson: canonical(materialized.summary), safeFailure: null, updatedAtMs: input.nowMs } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("conflict", "Operation completion changed concurrently.");
      const changed = await runs.updateOne({ _id: run._id, revision: run.revision, activeOperationId: operation._id }, { $set: { activeOperationId: null, status: run.pauseRequested ? "paused" : "queued", safeFailure: null, updatedAtMs: input.nowMs, ...materialized.runPatch }, $inc: { revision: 1 } }, { session });
      if (changed.modifiedCount !== 1) throw new ExperimentRepositoryError("stale_revision", "Run revision changed.");
      return { operation: updated, reused: false };
    });
  }

  async function failOperation(raw: unknown): Promise<ExperimentOperationDocument> {
    const input = parse(failInput, raw);
    return withMongoTransaction(database, async (session) => {
      const operation = must(await operations.findOne({ _id: input.operationId, runId: input.runId }, { session }), "Operation");
      const run = must(await runs.findOne({ _id: input.runId }, { session }), "Run");
      if (operation.workflowRunId !== input.workflowRunId || operation.parentWorkflowRunId !== input.parentWorkflowRunId) throw new ExperimentRepositoryError("conflict", "Failure identity differs from the claim.");
      if (operation.state === "succeeded") throw new ExperimentRepositoryError("conflict", "Successful operation cannot fail.");
      if (operation.state === "failed" && input.category === "definite_failure" && operation.safeFailure === input.category) return operation;
      if (operation.state === "unknown" && input.category === "unknown_outcome" && operation.safeFailure === input.category) return operation;
      if (operation.state !== "started" && operation.state !== "unknown") throw new ExperimentRepositoryError("invalid_state", "Operation has no active claim.");
      if (run.activeOperationId !== operation._id) throw new ExperimentRepositoryError("conflict", "Operation is not active.");
      const state = input.category === "unknown_outcome" ? "unknown" : "failed";
      const imageFailureHistory = operation.role === "image" ? { imageFailureHistory: [...(operation.imageFailureHistory ?? []), { category: input.category, recordedAtMs: input.nowMs }] } : {};
      const updated = await operations.findOneAndUpdate({ _id: operation._id, state: operation.state }, { $set: { state, safeFailure: input.category, ...imageFailureHistory, updatedAtMs: input.nowMs } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("conflict", "Operation failure changed concurrently.");
      const changed = await runs.updateOne({ _id: run._id, revision: run.revision }, { $set: { status: "blocked", safeFailure: input.category, activeOperationId: state === "unknown" ? operation._id : null, updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session });
      if (changed.modifiedCount !== 1) throw new ExperimentRepositoryError("stale_revision", "Run revision changed.");
      return updated;
    });
  }

  return { createRun, getRun, listRuns, pause, resume, prepareOperation, beginDispatch, recordDispatchIdentity, verifyDispatchPublication, claimOperation, completeOperation, failOperation, recordDispatchOutcome, recordProgress, blockRun, getOperation, listOperations };
}
