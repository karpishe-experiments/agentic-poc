import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { ClientSession } from "mongodb";
import { withMongoTransaction, type Database } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { CASES, EXPERIMENT_PROFILE, MAX_NARRATIVE_CONTENT_BYTES, experimentModeSchema, experimentRoleSchema, experimentTaskSchema, parseNarrativeTaskProposal, personaSchema, resultEnvelopeSchema, validateRoleResult, type RoleResult } from "@/lib/contracts/experiment-runner";
import { isNarrativeTask } from "@/lib/experiment-runner/narrative-tasks";
import { verifySheetStorageReady } from "@/db/setup";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentImageRequestSchema, imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { materializeNarrativeResult, prepareNarrativeContext } from "@/db/experiment-narrative";
import { assertCurrentImageSources } from "@/db/experiment-images";
import { verifyCurrentPageIllustrationSources } from "@/db/experiment-pages";
import type { AssetStore } from "@/lib/assets/asset-store";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";
import { configuredPageIllustrationTask } from "@/lib/experiment-runner/page-illustration-tasks";
import { MAX_REFERENCE_UPLOAD_BYTES } from "@/lib/experiment-runner/image-limits";
import { pageIllustrationAttachmentSchema } from "@/lib/contracts/experiment-page-illustrations";
import { assertExperimentEvaluationOrder } from "@/db/experiment-completion";
import { failTerminalPageBatchItems } from "@/db/experiment-page-batch-failure";
import { measurePhase } from "@/lib/experiment-runner/diagnostics";
import { OPERATION_LIMIT_MS, withCleanupBudget } from "@/lib/operations/budget";
import { completionLifecycle, isRecoveredAttempt } from "@/lib/experiment-runner/completion-lifecycle";
import { CampaignAdmissionError, createExperimentCampaignLedger, type M4Authority } from "@/db/experiment-campaign";
import { m4OperationFingerprint, m4SourceFingerprint } from "@/db/experiment-text-sources";
import { m4Hash, m4RequestBundleMatches, m4RequestDefinition, type M4RequestSelector } from "@/lib/experiment-runner/m4-request";
import { m4ObservedRoleResult } from "@/lib/experiment-runner/m4-observed-result";
import { hasM4SimulatedImagePolicy } from "@/db/experiment-m4-state";
import { hasM4KnownFailure } from "@/db/experiment-provider-failure";
import { verifyM4Accounting } from "@/db/experiment-m4-accounting";

const time = z.number().int().nonnegative();
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/);
const createInput = z.strictObject({ runId: opaqueIdSchema, bookletId: opaqueIdSchema, persona: personaSchema, mode: experimentModeSchema, predecessorRunId: opaqueIdSchema.optional(), configuration: savedConfigurationSchema, campaignId: opaqueIdSchema.optional(), nowMs: time });
const controlInput = z.strictObject({ runId: opaqueIdSchema, expectedRevision: z.number().int().nonnegative(), nowMs: time });
const prepareInput = z.strictObject({ operationId: opaqueIdSchema, runId: opaqueIdSchema, expectedRevision: z.number().int().nonnegative(), role: experimentRoleSchema, taskId: experimentTaskSchema.nullable(), subjectKind: z.enum(["book", "character", "location", "page"]), subjectId: opaqueIdSchema, inputFingerprint: fingerprint, attempt: z.number().int().min(1), providerKind: z.enum(["text", "image"]), imageRequest: experimentImageRequestSchema.optional(), parentWorkflowRunId: opaqueIdSchema.optional(), nowMs: time });
const claimInput = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema, workflowRunId: opaqueIdSchema, parentWorkflowRunId: opaqueIdSchema.nullable(), nowMs: time });
const dispatchInput = claimInput.omit({ workflowRunId: true });
const dispatchIdentityInput = claimInput.extend({ workflowTaskId: opaqueIdSchema.optional() });
const publicationInput = claimInput.extend({ workflowId: opaqueIdSchema, terminalSucceeded: z.boolean().optional() });
const completeInput = z.strictObject({ envelope: resultEnvelopeSchema, parentWorkflowRunId: opaqueIdSchema.nullable(), nowMs: time });
const failInput = claimInput.extend({ category: z.enum(["unknown_outcome", "definite_failure"]) });
const outcomeInput = dispatchInput.extend({ category: z.enum(["unknown_outcome", "definite_failure", "observed_failure", "observed_stop", "paused"]) });
const progressInput = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema, fingerprint64: fingerprint, nowMs: time });
const blockInput = z.strictObject({ runId: opaqueIdSchema, category: z.enum(["unknown_outcome", "definite_failure"]), nowMs: time });
const terminalConflictInput = claimInput.extend({ workflowId: opaqueIdSchema, status: z.enum(["failed", "stopped"]) });

export class ExperimentRepositoryError extends Error {
  constructor(public readonly code: "invalid_input" | "not_found" | "conflict" | "stale_revision" | "invalid_state" | "invalid_result", message: string) {
    super(message); this.name = "ExperimentRepositoryError";
  }
}

type OperationHead = Pick<ExperimentOperationDocument,
  "_id" | "runId" | "state" | "dispatchStartedAtMs" | "verifiedWorkflowId">;

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

const j13ManagerDecision = z.strictObject({ kind: z.literal("delegate"), payload: z.strictObject({
  taskId: z.literal("J13"), subjectKind: z.literal("page"), subjectId: opaqueIdSchema,
}) });
const uploadJournal = z.array(z.strictObject({
  assetId: opaqueIdSchema, artifactVersionId: opaqueIdSchema, sha256: fingerprint,
  state: z.enum(["started", "uploaded", "unknown", "rejected"]), uploadFileId: opaqueIdSchema.nullable(),
})).max(15);
const pendingJ13Revision = z.object({ kind: z.literal("revision"), taskId: z.literal("J13"),
  subjectKind: z.literal("page"), subjectId: opaqueIdSchema, artifactVersionId: opaqueIdSchema }).passthrough();
const rawAcknowledgements = z.array(z.unknown()).max(15);

function sameJson(left: unknown, right: unknown): boolean { return canonical(left) === canonical(right); }
function parseAcknowledgements(value: unknown, runId: string) {
  return rawAcknowledgements.parse(value).map((entry) => pageIllustrationAttachmentSchema.parse({
    ...(entry as Record<string, unknown>), uploadUser: `booklet-${runId}`,
  }));
}
function isJ13Image(operation: Pick<ExperimentOperationDocument, "role" | "taskId" | "subjectKind" | "providerKind">): boolean {
  return operation.role === "image" && operation.taskId === "J13" && operation.subjectKind === "page" && operation.providerKind === "image";
}

export function createExperimentRepository(database: Database, options: { store?: () => AssetStore; elapsedNow?: () => number; m4Authority?: M4Authority; m4ExecutionEnabled?: true } = {}) {
  const elapsedNow = options.elapsedNow ?? (() => performance.now());
  const runs = database.collections.experiment_runs;
  const operations = database.collections.experiment_operations;
  const campaignLedger = options.m4Authority ? createExperimentCampaignLedger(database, options.m4Authority) : null;
  async function assertM4ImageAdmission(session: ClientSession, run: ExperimentRunDocument, operation: ExperimentOperationDocument) {
    if (!campaignLedger || options.m4ExecutionEnabled !== true || !hasM4SimulatedImagePolicy(run) || operation.mode !== run.mode ||
        operation.providerKind !== "image" || operation.role !== "image" || operation.lifecycle?.stop != null ||
        run.m4?.campaignId !== campaignLedger.grant.campaignId || run.m4.policyHash !== campaignLedger.snapshot.hash ||
        run.m4.policyJson !== campaignLedger.snapshot.json) throw new ExperimentRepositoryError("invalid_state", "Balanced image admission requires the granted simulated policy.");
    const campaign = await database.collections.experiment_campaigns.findOne({ _id: campaignLedger.grant.campaignId }, { session });
    if (!campaign || campaign.state !== "active" || campaign.policyHash !== run.m4.policyHash || campaign.slots[run.persona] !== run._id) {
      throw new ExperimentRepositoryError("invalid_state", "Balanced campaign admission is stopped.");
    }
  }
  async function assertM4Prepared(session: ClientSession, run: ExperimentRunDocument, operation: ExperimentOperationDocument, parent: string | null, phase: "dispatch" | "claim") {
    const prepared = operation.m4Preparation;
    const binding = campaignLedger?.snapshot.policy.publications.find((item) => item.role === operation.role && item.taskId === operation.taskId &&
      item.persona === (operation.role === "tester" ? run.persona : null));
    const selector = { role: operation.role, taskId: operation.taskId, persona: run.persona,
      report: (operation.role === "tester" || operation.role === "judge") && run.generationCompletedAtMs != null } as M4RequestSelector;
    if (!campaignLedger || options.m4ExecutionEnabled !== true || operation.providerKind !== "text" || !prepared ||
        run.m4?.campaignId !== campaignLedger.grant.campaignId || run.m4.policyHash !== campaignLedger.snapshot.hash ||
        run.m4.policyJson !== campaignLedger.snapshot.json || prepared.policyHash !== run.m4.policyHash || prepared.configurationHash !== run.configurationHash ||
        !binding || operation.lifecycle?.stop != null || prepared.publishedWorkflowId !== binding.publishedWorkflowId || prepared.parentWorkflowRunId !== parent ||
        prepared.requestDigest !== m4Hash(prepared.requestJson) || prepared.operationFingerprint !== m4OperationFingerprint(operation) ||
        !m4RequestBundleMatches(campaignLedger.snapshot.policy, campaignLedger.grant) ||
        canonical(prepared.definitionUpdate ?? null) !== canonical(campaignLedger.grant.requestDefinitionUpdate ?? null) ||
        prepared.definitionHash !== m4RequestDefinition(selector).hash ||
        phase === "claim" && operation.verifiedWorkflowId !== prepared.publishedWorkflowId ||
        prepared.sourceFingerprint !== await m4SourceFingerprint(database, session, run)) {
      throw new ExperimentRepositoryError("conflict", "M4 prepared request, source, policy or publication is not current.");
    }
    const deployment = await database.collections.deployment_control.findOne({ environment: process.env.DEPLOYMENT_ENV ?? "local" }, { session });
    if (deployment?.maintenance || deployment?.draining) throw new ExperimentRepositoryError("invalid_state", "M4 admission is closed.");
    return prepared;
  }

  async function assertJ13Admission(
    session: ClientSession,
    run: ExperimentRunDocument,
    operation: ExperimentOperationDocument,
    parentWorkflowRunId: string | null,
    phase: "prepare" | "dispatch" | "claim",
  ): Promise<{ expectedTargetVersionId: string | null; imageRequest: z.infer<typeof experimentImageRequestSchema> }> {
    if (!isJ13Image(operation) || run.mode !== "simulated" && !hasM4SimulatedImagePolicy(run) || operation.mode !== run.mode ||
        !operation.imageRequestJson || !options.store || !configuredPageIllustrationTask(run.configurationJson)) {
      throw new ExperimentRepositoryError("invalid_state", "J13 requires the enabled simulated final-page profile and retained source verification.");
    }
    const configuration = parse(savedConfigurationSchema, JSON.parse(run.configurationJson) as unknown);
    const image = configuration.find((item) => item.role === "image" && item.taskId === null && item.finalPageIllustration === true);
    const managerBinding = configuration.find((item) => item.role === "manager" && item.taskId === null);
    if (!image || !managerBinding) throw new ExperimentRepositoryError("invalid_state", "J13 configuration is incomplete.");

    let request: z.infer<typeof experimentImageRequestSchema>;
    try { request = experimentImageRequestSchema.parse(JSON.parse(operation.imageRequestJson) as unknown); }
    catch { throw new ExperimentRepositoryError("invalid_state", "J13 has no valid saved image request."); }
    if (request.kind !== "page_source" || imageRequestFingerprint(request) !== operation.inputFingerprint) {
      throw new ExperimentRepositoryError("conflict", "J13 request differs from its saved fingerprint.");
    }
    const sources = await measurePhase({ runId: run._id, operationId: operation._id }, "source_verification",
      () => verifyCurrentPageIllustrationSources(database, session, run, operation.subjectId, options.store!()));
    if (!sameJson(request, sources.request.request) || !sameJson(operation.dependencyVersionIds, sources.request.request.sourceVersionIds)) {
      throw new ExperimentRepositoryError("conflict", "J13 current page sources differ from its saved request.");
    }

    const managers = await operations.find({ runId: run._id, role: "manager", taskId: null,
      subjectKind: "book", subjectId: run.bookletId, providerKind: "text", mode: run.mode, state: "succeeded" }, { session })
      .sort({ createdAtMs: -1, _id: -1 }).limit(1).toArray();
    const manager = managers[0];
    const decision = j13ManagerDecision.safeParse(JSON.parse(manager?.resultJson ?? "null"));
    if (!parentWorkflowRunId) {
      throw new ExperimentRepositoryError("conflict", "J13 requires a non-null manager workflow parent at each dispatch boundary.");
    }
    const requiredParent = parentWorkflowRunId;
    if (!manager || !decision.success || decision.data.payload.subjectId !== operation.subjectId ||
        manager.reservationCount !== 1 || !manager.workflowRunId || manager.workflowRunId !== requiredParent ||
        manager.verifiedWorkflowId !== managerBinding.publishedWorkflowId) {
      throw new ExperimentRepositoryError("conflict", "J13 requires the latest verified manager selection for this exact page.");
    }

    if (phase !== "prepare") {
      const journal = uploadJournal.safeParse(JSON.parse(operation.referenceUploadJournalJson ?? "[]"));
      let acknowledgements: ReturnType<typeof parseAcknowledgements>;
      try { acknowledgements = parseAcknowledgements(JSON.parse(operation.referenceUploadsJson ?? "[]"), run._id); }
      catch { throw new ExperimentRepositoryError("conflict", "J13 upload acknowledgements are invalid."); }
      if (!journal.success || journal.data.length !== sources.attachments.length ||
          acknowledgements.length !== sources.attachments.length || journal.data.some((entry, index) => {
            const source = sources.attachments[index]!;
            return entry.state !== "uploaded" || entry.uploadFileId === null || entry.assetId !== source.assetId ||
              entry.artifactVersionId !== source.artifactVersionId || entry.sha256 !== source.sha256;
          }) || acknowledgements.some((entry, index) => {
            const source = sources.attachments[index]!, marker = journal.data[index]!;
            return entry.role !== source.subjectKind || entry.subjectId !== source.subjectId || entry.assetId !== source.assetId ||
              entry.artifactVersionId !== source.artifactVersionId || entry.uploadFileId !== marker.uploadFileId ||
              entry.mimeType !== source.mimeType || entry.sha256 !== source.sha256 || entry.byteLength !== source.byteLength ||
              entry.width !== source.width || entry.height !== source.height || entry.byteLength > MAX_REFERENCE_UPLOAD_BYTES;
          }) || new Set(acknowledgements.map((entry) => entry.uploadFileId)).size !== acknowledgements.length) {
        throw new ExperimentRepositoryError("conflict", "J13 requires complete ordered reference-upload evidence before workflow dispatch.");
      }
    }

    const artifacts = await database.collections.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId,
      taskId: "J13", subjectKind: "page", subjectId: operation.subjectId }, { session }).toArray();
    if (artifacts.length > 1) throw new ExperimentRepositoryError("conflict", "J13 page artifact identity is ambiguous.");
    const artifact = artifacts[0];
    const expectedTargetVersionId = artifact?.currentVersionId ?? null;
    let pendingValue: unknown;
    try { pendingValue = JSON.parse(run.pendingDecisionJson ?? "null") as unknown; }
    catch { throw new ExperimentRepositoryError("conflict", "J13 pending revision evidence is malformed."); }
    const pending = pendingJ13Revision.safeParse(pendingValue);
    const exactPendingRevision = pending.success && pending.data.subjectId === operation.subjectId &&
      pending.data.artifactVersionId === expectedTargetVersionId;
    if (artifact && (!expectedTargetVersionId || !(artifact.state === "needs_review" || artifact.state === "draft" && exactPendingRevision))) {
      throw new ExperimentRepositoryError("conflict", "J13 can replace only the current version of a page marked needs_review.");
    }
    if (operation.parentWorkflowRunId !== requiredParent) {
      throw new ExperimentRepositoryError("conflict", "J13 manager parent differs from the saved operation.");
    }
    return { expectedTargetVersionId, imageRequest: sources.request.request };
  }

  async function getRun(runId: string) { return runs.findOne({ _id: parse(opaqueIdSchema, runId) }); }
  async function listRuns() { return runs.find().sort({ createdAtMs: -1, _id: -1 }).toArray(); }
  async function getOperation(operationId: string) { return operations.findOne({ _id: parse(opaqueIdSchema, operationId) }); }
  async function latestOperation(runId: string, filter: Partial<Pick<ExperimentOperationDocument, "role" | "taskId" | "subjectId" | "state">> = {}) {
    return measurePhase({ runId }, "operation_selection", () =>
      operations.findOne({ ...filter, runId: parse(opaqueIdSchema, runId) }, { sort: { createdAtMs: -1, _id: -1 } }));
  }
  async function listOperations(runId: string) { return operations.find({ runId: parse(opaqueIdSchema, runId) }).sort({ createdAtMs: 1, _id: 1 }).toArray(); }
  async function listOperationHeads(runIds: string[]): Promise<OperationHead[]> {
    const ids = runIds.map((id) => parse(opaqueIdSchema, id));
    if (!ids.length) return [];
    // Scheduling needs only the latest operation's lane evidence, not every
    // saved result. Keep the same timestamp/ID tie-break as listOperations.
    return operations.aggregate<OperationHead>([
      { $match: { runId: { $in: ids } } },
      { $project: { _id: 1, runId: 1, state: 1, createdAtMs: 1,
        dispatchStartedAtMs: 1, verifiedWorkflowId: 1 } },
      { $sort: { runId: -1, createdAtMs: -1, _id: -1 } },
      { $group: { _id: "$runId", operation: { $first: {
        _id: "$_id", runId: "$runId", state: "$state",
        dispatchStartedAtMs: "$dispatchStartedAtMs", verifiedWorkflowId: "$verifiedWorkflowId",
      } } } },
      { $replaceWith: "$operation" },
    ]).toArray();
  }

  async function createRun(raw: unknown): Promise<ExperimentRunDocument> {
    const input = parse(createInput, raw);
    const configurationJson = canonical(input.configuration);
    const configurationHash = digest(configurationJson);
    const sameCreation = (prior: ExperimentRunDocument) => prior.bookletId === input.bookletId && prior.persona === input.persona && prior.mode === input.mode &&
      prior.predecessorRunId === (input.predecessorRunId ?? null) && prior.configurationHash === configurationHash &&
      prior.m4?.campaignId === input.campaignId && (!prior.m4 || prior.m4.policyHash === campaignLedger?.snapshot.hash);
    const prior = await runs.findOne({ _id: input.runId });
    if (prior) {
      if (sameCreation(prior)) return prior;
      throw new ExperimentRepositoryError("conflict", "Run ID already belongs to different input.");
    }
    if (input.mode === "real" || input.mode === "balanced" && (!campaignLedger || !input.campaignId) || input.mode !== "balanced" && input.campaignId) {
      throw new ExperimentRepositoryError("invalid_state", "Mode requires a ready protected campaign; Real is unavailable.");
    }
    const fixed = CASES[input.persona];
    const run: ExperimentRunDocument = { _id: input.runId, schemaVersion: "2", bookletId: input.bookletId, persona: input.persona, mode: input.mode, brief: fixed.brief, predecessorRunId: input.predecessorRunId ?? null, configurationJson, configurationHash, status: "queued", evaluationStatus: "pending", revision: 0, pauseRequested: false, activeOperationId: null, counters: { logicalText: 0, logicalImage: 0, payableText: 0, payableImage: 0, steps: 0 }, limits: { text: fixed.llmLimit, image: fixed.imageLimit, steps: 300 }, safeFailure: null, activeDelegationId: null, decisionSequence: 0, pendingDecisionJson: null, textRevisions: 0, imageRevisions: 0, createdAtMs: input.nowMs, updatedAtMs: input.nowMs };
    try {
      await withMongoTransaction(database, async (session) => {
        if (input.mode === "balanced") {
          await campaignLedger!.create(session, input.nowMs);
          run.m4 = await campaignLedger!.claimPersona(session, run, input.campaignId!, input.nowMs);
        }
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
        if (existing && sameCreation(existing)) return existing;
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
      if (run.status === "blocked") {
        const permitted = campaignLedger?.grant.continuations?.filter((item) => item.runId === run._id).map((item) => item.operationId) ?? [];
        const failed = permitted.length ? await operations.findOne({ _id: { $in: permitted }, runId: run._id,
          m4Continuation: { $exists: false } }, { session, sort: { createdAtMs: -1, _id: -1 } }) : null;
        if (!campaignLedger || !options.m4Authority || !options.m4ExecutionEnabled ||
            !m4RequestBundleMatches(campaignLedger.snapshot.policy, campaignLedger.grant) || run.safeFailure !== "definite_failure" ||
            run.activeOperationId !== null || run.preparation || !hasM4SimulatedImagePolicy(run) || !failed ||
            failed.state !== "failed" || failed.safeFailure !== "definite_failure" || !["manager", "specialist"].includes(failed.role) ||
            run.generationCompletedAtMs != null ||
            failed.lifecycle?.phase !== "finished" || failed.lifecycle.unresolved !== false || failed.lifecycle.stop ||
            !await hasM4KnownFailure(database, session, options.m4Authority, run, failed, input.nowMs)) {
          throw new ExperimentRepositoryError("invalid_state", "Blocked run needs an exact inspected continuation grant.");
        }
        await campaignLedger.continueFailure(session, run, failed, input.nowMs);
        const updated = await runs.findOneAndUpdate({ _id: run._id, revision: run.revision, status: "blocked", activeOperationId: null },
          { $set: { status: "queued", safeFailure: null, pauseRequested: false, updatedAtMs: input.nowMs }, $inc: { revision: 1 } },
          { session, returnDocument: "after" });
        if (!updated) throw new ExperimentRepositoryError("stale_revision", "Run changed during continuation.");
        await verifyM4Accounting(database, session, updated);
        return updated;
      }
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
    const sheetTask = input.taskId === "J09" || input.taskId === "J10";
    if ((input.role === "image") !== (input.providerKind === "image") || (input.role === "specialist" && !isNarrativeTask(input.taskId) && !sheetTask && input.taskId !== "J11" && input.taskId !== "J12") || (input.role !== "specialist" && input.role !== "image" && input.taskId)) throw new ExperimentRepositoryError("invalid_input", "Role, task and provider kind do not match.");
    if (input.imageRequest && (input.role !== "image" || imageRequestFingerprint(input.imageRequest) !== input.inputFingerprint)) throw new ExperimentRepositoryError("invalid_input", "Image request must match its operation fingerprint.");
    const j13 = input.role === "image" && input.taskId === "J13";
    if (j13 && (!input.imageRequest || input.subjectKind !== "page" || !input.parentWorkflowRunId)) {
      throw new ExperimentRepositoryError("invalid_input", "J13 requires a page image request and its manager workflow parent.");
    }
    if (!j13 && input.parentWorkflowRunId) {
      throw new ExperimentRepositoryError("invalid_input", "Only J13 image work may provide a manager workflow parent at preparation.");
    }
    const idempotencyKey = digest(canonical([input.runId, input.role, input.taskId, input.subjectKind, input.subjectId, input.inputFingerprint, input.attempt]));
    const existing = await operations.findOne({ idempotencyKey });
    if (existing) return existing;
    if (input.role === "specialist" && (sheetTask || input.taskId === "J12")) {
      try { await verifySheetStorageReady(database); }
      catch { throw new ExperimentRepositoryError("invalid_state", "Subject artifact storage is not ready; verify indexes through authorized maintenance."); }
    }
    try {
      return await withMongoTransaction(database, async (session) => {
        const run = must(await runs.findOne({ _id: input.runId }, { session }), "Run");
        if (run.revision !== input.expectedRevision) throw new ExperimentRepositoryError("stale_revision", "Run revision changed.");
        if (run.status !== "queued" && run.status !== "running" || run.pauseRequested || run.activeOperationId) throw new ExperimentRepositoryError("invalid_state", "Run cannot prepare another operation.");
        if (run.generationCompletedAtMs != null && input.role !== "tester" && input.role !== "judge") {
          throw new ExperimentRepositoryError("invalid_state", "Completed generation permits evaluation only; use a successor for changes.");
        }
        if (input.role === "judge" || input.role === "tester" && run.generationCompletedAtMs != null) {
          await assertExperimentEvaluationOrder(database, session, run, input.role);
        }
        if (input.subjectKind === "book" && input.subjectId !== run.bookletId) throw new ExperimentRepositoryError("invalid_input", "Book subject must match booklet ID.");
        if (input.role === "specialist" && input.subjectKind !== (input.taskId === "J09" ? "character" : input.taskId === "J10" ? "location" : input.taskId === "J12" ? "page" : "book")) throw new ExperimentRepositoryError("invalid_input", "Specialist task requires its matching subject kind.");
        if (input.imageRequest && !j13) await assertCurrentImageSources(database, session, run, input.imageRequest);
        const narrative = input.role === "specialist" && (isNarrativeTask(input.taskId) || input.taskId === "J09" || input.taskId === "J10" || input.taskId === "J11" || input.taskId === "J12") ? await prepareNarrativeContext(database, session, run, input.taskId, input.subjectKind, input.subjectId, options.store) : { expectedTargetVersionId: null, dependencyVersionIds: [] };
        const operation: ExperimentOperationDocument = { _id: input.operationId, runId: input.runId, role: input.role, taskId: input.taskId, subjectKind: input.subjectKind, subjectId: input.subjectId, idempotencyKey, inputFingerprint: input.inputFingerprint, attempt: input.attempt, mode: run.mode, providerKind: input.providerKind, state: "prepared", workflowRunId: null, parentWorkflowRunId: j13 ? input.parentWorkflowRunId! : null, reservationCount: 0, deadlineAtMs: null, resultJson: null, resultDigest: null, warningsJson: "[]", expectedTargetVersionId: narrative.expectedTargetVersionId, dependencyVersionIds: narrative.dependencyVersionIds, materializationJson: null, safeFailure: null, createdAtMs: input.nowMs, updatedAtMs: input.nowMs };
        operation.deadlineAtMs = run.preparation?.deadlineAtMs ?? input.nowMs + OPERATION_LIMIT_MS;
        operation.lifecycle = { startedAtMs: run.preparation?.startedAtMs ?? input.nowMs, ownerId: run.preparation?.ownerId ?? randomUUID(), phase: "preparing", lastProgressAtMs: input.nowMs };
        if (input.nowMs >= operation.deadlineAtMs) throw new ExperimentRepositoryError("invalid_state", "Preparation deadline expired.");
        if (input.imageRequest) {
          operation.imageRequestJson = JSON.stringify(input.imageRequest);
          operation.dependencyVersionIds = [...input.imageRequest.sourceVersionIds];
        }
        if (j13) {
          const admission = await assertJ13Admission(session, run, operation, input.parentWorkflowRunId!, "prepare");
          operation.expectedTargetVersionId = admission.expectedTargetVersionId;
        }
        if (run.mode === "balanced") {
          const continued = await operations.findOne({ runId: run._id, m4Continuation: { $exists: true }, "m4Continuation.nextOperationId": null }, { session });
          if (continued?.m4Continuation) {
            const linked = await operations.updateOne({ _id: continued._id, "m4Continuation.nextOperationId": null },
              { $set: { "m4Continuation.nextOperationId": operation._id } }, { session });
            if (linked.modifiedCount !== 1) throw new ExperimentRepositoryError("conflict", "Continuation changed before preparation.");
            operation.m4ContinuedFromOperationId = continued._id;
          }
        }
        await operations.insertOne(operation, { session });
        const changed = await runs.updateOne({ _id: input.runId, revision: input.expectedRevision, activeOperationId: null }, { $set: { activeOperationId: input.operationId, preparation: null, updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session });
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
      if (run.mode === "real") return { dispatched: false, operation };
      if (run.mode === "balanced") {
        if (operation.providerKind === "text") await assertM4Prepared(session, run, operation, input.parentWorkflowRunId, "dispatch");
        else await assertM4ImageAdmission(session, run, operation);
      }
      const deployment = await database.collections.deployment_control.findOne({ environment: process.env.DEPLOYMENT_ENV ?? "local" }, { session });
      if (deployment?.draining || deployment?.maintenance) return { dispatched: false, operation };
      if (isJ13Image(operation)) {
        const admission = await assertJ13Admission(session, run, operation, input.parentWorkflowRunId, "dispatch");
        if (operation.expectedTargetVersionId !== admission.expectedTargetVersionId) {
          throw new ExperimentRepositoryError("conflict", "J13 replacement target changed before dispatch.");
        }
      }
      const updated = await operations.findOneAndUpdate({ _id: operation._id, state: "prepared", dispatchStartedAtMs: null }, { $set: {
        dispatchStartedAtMs: input.nowMs, deadlineAtMs: operation.deadlineAtMs ?? input.nowMs + OPERATION_LIMIT_MS,
        ...(operation.lifecycle ? { "lifecycle.phase": "dispatching" as const, "lifecycle.lastProgressAtMs": input.nowMs } : {}),
        parentWorkflowRunId: input.parentWorkflowRunId, updatedAtMs: input.nowMs } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("conflict", "Dispatch was recorded concurrently.");
      // Touch the run in the same transaction so Pause cannot race admission.
      const changed = await runs.updateOne({ _id: run._id, revision: run.revision, activeOperationId: operation._id, pauseRequested: false }, { $set: { updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session });
      if (changed.modifiedCount !== 1) throw new ExperimentRepositoryError("stale_revision", "Run changed before dispatch.");
      return { dispatched: true, operation: updated };
    });
  }

  async function failPreparation(runId: string, operationId: string, nowMs: number) {
    return withMongoTransaction(database, async (session) => {
      const run = must(await runs.findOne({ _id: runId }, { session }), "Run");
      const operation = must(await operations.findOne({ _id: operationId, runId }, { session }), "Operation");
      if (run.activeOperationId !== operationId || operation.dispatchStartedAtMs != null || operation.state !== "prepared") throw new ExperimentRepositoryError("conflict", "Preparation ownership changed.");
      let uncertain = false;
      try { uncertain = uploadJournal.parse(JSON.parse(operation.referenceUploadJournalJson ?? "[]")).some((entry) => entry.state === "started" || entry.state === "unknown"); }
      catch { uncertain = true; }
      const category = uncertain ? "unknown_outcome" as const : "definite_failure" as const;
      if (run.mode === "balanced" && campaignLedger && run.m4?.campaignId === campaignLedger.grant.campaignId) await campaignLedger.stop(session, nowMs);
      await operations.updateOne({ _id: operationId, state: "prepared" }, { $set: {
        state: uncertain ? "unknown" : "failed", safeFailure: category, updatedAtMs: nowMs,
        ...(operation.lifecycle ? { lifecycle: { ...operation.lifecycle, phase: "finished" as const, attemptOutcome: "failed" as const, unresolved: uncertain, endedAtMs: nowMs } } : {}),
      } }, { session });
      const changed = await runs.findOneAndUpdate({ _id: runId, revision: run.revision, activeOperationId: operationId }, {
        $set: { status: "blocked", safeFailure: category, activeOperationId: uncertain ? operationId : null, updatedAtMs: nowMs }, $inc: { revision: 1 },
      }, { session, returnDocument: "after" });
      if (!changed) throw new ExperimentRepositoryError("stale_revision", "Run changed during preparation failure.");
      await failTerminalPageBatchItems(database, changed, session, nowMs);
      return changed;
    });
  }

  async function claimOperation(raw: unknown): Promise<{ started: boolean; reason?: "already_started" | "paused" | "limit_exhausted" | "blocked";
    operation: ExperimentOperationDocument; imageRequest?: z.infer<typeof experimentImageRequestSchema> }> {
    const input = parse(claimInput, raw);
    const startedAt = elapsedNow();
    const nowMs = () => input.nowMs + Math.floor(elapsedNow() - startedAt);
    const claimId = randomUUID();
    const claimed = await operations.findOneAndUpdate({ _id: input.operationId, runId: input.runId,
      state: "prepared", reservationCount: 0,
      $and: [
        { $or: [{ workflowRunId: null }, { workflowRunId: input.workflowRunId }] },
        { $or: [{ dispatchStartedAtMs: null }, { parentWorkflowRunId: input.parentWorkflowRunId }] },
        { $or: [{ authorizationClaim: null }, { "authorizationClaim.expiresAtMs": { $lte: input.nowMs } }] },
      ],
    }, { $set: { authorizationClaim: { id: claimId, expiresAtMs: input.nowMs + 60_000 } } }, { returnDocument: "after" });
    let committed = false;
    try {
      const completed = await withMongoTransaction<Awaited<ReturnType<typeof claimOperation>>>(database, async (session) => measurePhase(
        { runId: input.runId, operationId: input.operationId }, "authorization_transaction", async () => {
      const operation = must(await operations.findOne({ _id: input.operationId, runId: input.runId }, { session }), "Operation");
      const run = must(await runs.findOne({ _id: input.runId }, { session }), "Run");
      if (operation.dispatchStartedAtMs != null && operation.parentWorkflowRunId !== input.parentWorkflowRunId) throw new ExperimentRepositoryError("conflict", "Claim parent differs from dispatch.");
      // No public route/config enables this internal seam. Focused fake-provider
      // tests can exercise the whole protected claim before later readiness wiring.
      if (run.mode === "real" || run.mode === "balanced" && (!campaignLedger || options.m4ExecutionEnabled !== true)) return { started: false, reason: "blocked", operation };
      if (operation.workflowRunId && (operation.workflowRunId !== input.workflowRunId || operation.parentWorkflowRunId !== input.parentWorkflowRunId)) throw new ExperimentRepositoryError("conflict", "Workflow identity differs from the saved claim.");
      if (operation.state !== "prepared") return { started: false, reason: "already_started", operation };
      if (run.activeOperationId !== operation._id) throw new ExperimentRepositoryError("conflict", "Operation is not active.");
      if (operation.deadlineAtMs != null && input.nowMs >= operation.deadlineAtMs) {
        // An unclaimed late callback cannot admit new provider work. Keep its
        // uncertain dispatch identity and lane for observation, not replacement.
        return { started: false, reason: "blocked", operation };
      }
      if (run.pauseRequested || run.status === "paused") return { started: false, reason: "paused", operation };
      if (run.status !== "queued" && run.status !== "running") return { started: false, reason: "blocked", operation };
      const lease = operation.authorizationClaim;
      if (!claimed || lease?.id !== claimId || lease.expiresAtMs <= nowMs()) throw new ExperimentRepositoryError("conflict", "Authorization is already active or its lease expired.");
      let imageRequest: z.infer<typeof experimentImageRequestSchema> | undefined;
      if (operation.imageRequestJson && !isJ13Image(operation)) {
        imageRequest = experimentImageRequestSchema.parse(JSON.parse(operation.imageRequestJson) as unknown);
        if (operation.role !== "image" || imageRequestFingerprint(imageRequest) !== operation.inputFingerprint) throw new ExperimentRepositoryError("invalid_state", "Saved image request differs from its operation.");
        await assertCurrentImageSources(database, session, run, imageRequest);
      }
      if (isJ13Image(operation)) {
        const admission = await assertJ13Admission(session, run, operation, input.parentWorkflowRunId, "claim");
        imageRequest = admission.imageRequest;
        if (operation.expectedTargetVersionId !== admission.expectedTargetVersionId) {
          throw new ExperimentRepositoryError("conflict", "J13 replacement target changed before claim.");
        }
      }
      if (lease.expiresAtMs <= nowMs()) throw new ExperimentRepositoryError("conflict", "Authorization lease expired before reservation.");
      if (operation.deadlineAtMs != null && nowMs() >= operation.deadlineAtMs) return { started: false, reason: "blocked", operation };
      const logical = operation.providerKind === "text" ? "logicalText" : "logicalImage";
      const payable = operation.providerKind === "text" ? "payableText" : "payableImage";
      const limit = operation.providerKind === "text" ? run.limits.text : run.limits.image;
      if (run.counters[logical] >= limit || run.counters.steps >= run.limits.steps) {
        if (run.mode === "balanced" && campaignLedger && run.m4?.campaignId === campaignLedger.grant.campaignId) await campaignLedger.stop(session, input.nowMs);
        await runs.updateOne({ _id: run._id, revision: run.revision }, { $set: { status: "blocked", safeFailure: "limit_exhausted", updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session });
        return { started: false, reason: "limit_exhausted", operation };
      }
      if (run.mode === "balanced" && operation.providerKind === "image") {
        await assertM4ImageAdmission(session, run, operation);
        const deployment = await database.collections.deployment_control.findOne({ environment: process.env.DEPLOYMENT_ENV ?? "local" }, { session });
        if (deployment?.draining || deployment?.maintenance) return { started: false, reason: "blocked", operation };
      }
      if (run.mode === "balanced" && operation.providerKind === "text") {
        const prepared = await assertM4Prepared(session, run, operation, input.parentWorkflowRunId, "claim");
        if (nowMs() >= operation.deadlineAtMs! || lease.expiresAtMs <= nowMs()) return { started: false, reason: "blocked", operation };
        try {
          await campaignLedger!.reserve(session, run, operation, prepared.requestDigest, nowMs());
        } catch (error) {
          // Allowance checks precede all reservation writes. Preserve the
          // unstarted dispatch for observation; never replay it as a new request.
          if (!(error instanceof CampaignAdmissionError) || error.reason !== "limit_exhausted") throw error;
          await campaignLedger!.stop(session, nowMs());
          const blocked = await runs.updateOne({ _id: run._id, revision: run.revision },
            { $set: { status: "blocked", safeFailure: "limit_exhausted", updatedAtMs: nowMs() }, $inc: { revision: 1 } }, { session });
          if (blocked.modifiedCount !== 1) throw new ExperimentRepositoryError("stale_revision", "Run changed at the campaign limit.");
          return { started: false, reason: "limit_exhausted", operation };
        }
      }
      const isPayable = run.mode === "balanced" && operation.providerKind === "text";
      const counters = { ...run.counters, [logical]: run.counters[logical] + 1, steps: run.counters.steps + 1 };
      if (isPayable) counters[payable] = run.counters[payable] + 1;
      const updated = await operations.findOneAndUpdate({ _id: operation._id, state: "prepared", "authorizationClaim.id": claimId }, { $set: { state: "started", authorizationClaim: null, workflowRunId: input.workflowRunId, parentWorkflowRunId: input.parentWorkflowRunId,
        ...(operation.lifecycle ? { "lifecycle.phase": "running" as const, "lifecycle.lastProgressAtMs": input.nowMs } : {}),
        deadlineAtMs: operation.deadlineAtMs ?? (operation.dispatchStartedAtMs ?? input.nowMs) + OPERATION_LIMIT_MS,
        reservationCount: 1, updatedAtMs: input.nowMs } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("conflict", "Operation was claimed concurrently.");
      const changed = await runs.updateOne({ _id: run._id, revision: run.revision }, { $set: { status: "running", counters, updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session });
      if (changed.modifiedCount !== 1) throw new ExperimentRepositoryError("stale_revision", "Run revision changed.");
      return { started: true, operation: updated, ...(imageRequest ? { imageRequest } : {}) };
      }));
      committed = completed.started;
      return completed;
    } finally {
      if (claimed && !committed) await operations.updateOne({ _id: input.operationId, "authorizationClaim.id": claimId },
        { $set: { authorizationClaim: null } }).catch(() => undefined);
    }
  }

  async function recordDispatchIdentity(raw: unknown): Promise<ExperimentOperationDocument> {
    const input = parse(dispatchIdentityInput, raw);
    return withMongoTransaction(database, async (session) => {
      const operation = must(await operations.findOne({ _id: input.operationId, runId: input.runId }, { session }), "Operation");
      if (operation.dispatchStartedAtMs == null || operation.parentWorkflowRunId !== input.parentWorkflowRunId) throw new ExperimentRepositoryError("conflict", "Dispatch identity is not established.");
      if (operation.workflowRunId) {
        if (operation.workflowRunId !== input.workflowRunId) throw new ExperimentRepositoryError("conflict", "Workflow identity changed.");
        if (input.workflowTaskId && operation.workflowTaskId && operation.workflowTaskId !== input.workflowTaskId) throw new ExperimentRepositoryError("conflict", "Workflow task identity changed.");
        if (input.workflowTaskId && !operation.workflowTaskId) {
          await operations.updateOne({ _id: operation._id, workflowRunId: input.workflowRunId, workflowTaskId: null }, { $set: { workflowTaskId: input.workflowTaskId } }, { session });
          return { ...operation, workflowTaskId: input.workflowTaskId };
        }
        return operation;
      }
      if (operation.state !== "prepared" && operation.state !== "unknown") throw new ExperimentRepositoryError("invalid_state", "Operation cannot save a dispatch identity.");
      const updated = await operations.findOneAndUpdate({ _id: operation._id, workflowRunId: null, state: operation.state }, { $set: { workflowRunId: input.workflowRunId, ...(input.workflowTaskId ? { workflowTaskId: input.workflowTaskId } : {}), updatedAtMs: input.nowMs } }, { session, returnDocument: "after" });
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
      const configuration = parse(savedConfigurationSchema, JSON.parse(run.configurationJson) as unknown);
      const expected = configuration.find((item) => item.role === operation.role && item.taskId === (operation.role === "image" ? null : operation.taskId));
      if (!expected || expected.publishedWorkflowId !== input.workflowId || (operation.verifiedWorkflowId && operation.verifiedWorkflowId !== input.workflowId)) throw new ExperimentRepositoryError("conflict", "Runtime publication differs from saved configuration.");
      if (input.terminalSucceeded && operation.state === "succeeded" && !run.activeOperationId &&
          run.status === "blocked" && run.safeFailure === "unknown_outcome") {
        const latest = await operations.findOne({ runId: run._id }, { session, sort: { createdAtMs: -1 } });
        if (latest?._id === operation._id) {
          await runs.updateOne({ _id: run._id, revision: run.revision, activeOperationId: null,
            status: "blocked", safeFailure: "unknown_outcome" }, { $set: {
              status: run.pauseRequested ? "paused" : "queued", safeFailure: null, updatedAtMs: input.nowMs,
            }, $inc: { revision: 1 } }, { session });
        }
      }
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
      // The callback may claim between a runtime status read and this write.
      // Resolve failed/stopped/rejected observations from the persisted claim
      // in this transaction so a late authorized completion remains possible.
      // A requested stop with authenticated terminal readback can close after
      // the original deadline, once no callback owns finalization or saved output.
      // Ordinary claimed failures still allow a late matching completion.
      const stopped = input.category === "observed_stop" && operation.remoteStatus === "stopped" &&
        !!operation.lifecycle?.stop && operation.deadlineAtMs != null && input.nowMs >= operation.deadlineAtMs &&
        !operation.authorizationClaim && !operation.imageCompletionClaim && !operation.resultFinalizationClaim &&
        !operation.resultJson && !operation.materializationJson && !operation.imageCompletionDigest;
      const category = stopped ? "definite_failure" : input.category === "observed_stop" || input.category === "observed_failure" ?
        operation.reservationCount === 0 && (operation.state === "prepared" ||
          operation.state === "failed" && operation.safeFailure === "definite_failure") ? "definite_failure" : "unknown_outcome" : input.category;
      if (category === "paused") {
        if (operation.state !== "prepared" || operation.reservationCount !== 0) throw new ExperimentRepositoryError("invalid_state", "Only a verified unclaimed operation can close.");
      } else if (operation.state !== "prepared" && operation.state !== "started" && operation.state !== "unknown") {
        if (operation.state === "failed" && operation.safeFailure === category) {
          await failTerminalPageBatchItems(database, run, session, input.nowMs);
          return operation;
        }
        throw new ExperimentRepositoryError("invalid_state", "Operation cannot record this outcome.");
      }
      if (run.activeOperationId !== operation._id) throw new ExperimentRepositoryError("conflict", "Operation is not active.");
      const state = category === "unknown_outcome" ? "unknown" : "failed";
      const safeFailure = category === "paused" ? null : category;
      if (safeFailure && run.mode === "balanced" && campaignLedger && run.m4?.campaignId === campaignLedger.grant.campaignId) await campaignLedger.stop(session, input.nowMs);
      if (operation.state === state && operation.safeFailure === safeFailure) return operation;
      const imageFailureHistory = operation.role === "image" && safeFailure ? { imageFailureHistory: [...(operation.imageFailureHistory ?? []), { category: safeFailure, recordedAtMs: input.nowMs }] } : {};
      const stoppedLifecycle = stopped && operation.lifecycle ? { lifecycle: { ...operation.lifecycle,
        phase: "finished" as const, attemptOutcome: "failed" as const, unresolved: false,
        endedAtMs: operation.lifecycle.endedAtMs ?? input.nowMs } } : {};
      const updated = await operations.findOneAndUpdate({ _id: operation._id, state: operation.state }, { $set: { state, safeFailure, ...imageFailureHistory, ...stoppedLifecycle, updatedAtMs: input.nowMs } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("conflict", "Outcome changed concurrently.");
      const changed = await runs.findOneAndUpdate({ _id: run._id, revision: run.revision, activeOperationId: operation._id }, { $set: { status: category === "paused" ? run.pauseRequested ? "paused" : "queued" : "blocked", safeFailure, activeOperationId: state === "unknown" ? operation._id : null, updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session, returnDocument: "after" });
      if (!changed) throw new ExperimentRepositoryError("stale_revision", "Run changed before outcome.");
      await failTerminalPageBatchItems(database, changed, session, input.nowMs);
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
      if (blocked && run.mode === "balanced" && campaignLedger && run.m4?.campaignId === campaignLedger.grant.campaignId) await campaignLedger.stop(session, input.nowMs);
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
      if (run.mode === "balanced" && campaignLedger && run.m4?.campaignId === campaignLedger.grant.campaignId) await campaignLedger.stop(session, input.nowMs);
      if (run.status === "blocked") {
        if (run.safeFailure === input.category) {
          await failTerminalPageBatchItems(database, run, session, input.nowMs);
          return run;
        }
        throw new ExperimentRepositoryError("conflict", "Run is blocked for another reason.");
      }
      const updated = await runs.findOneAndUpdate({ _id: run._id, revision: run.revision }, { $set: { status: "blocked", safeFailure: input.category, updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("stale_revision", "Run changed before block.");
      await failTerminalPageBatchItems(database, updated, session, input.nowMs);
      return updated;
    });
  }

  async function recordTerminalConflict(raw: unknown): Promise<ExperimentRunDocument> {
    const input = parse(terminalConflictInput, raw);
    return withMongoTransaction(database, async (session) => {
      const run = must(await runs.findOne({ _id: input.runId }, { session }), "Run");
      const operation = must(await operations.findOne({ _id: input.operationId, runId: run._id }, { session }), "Operation");
      const latest = await operations.findOne({ runId: run._id }, { session, sort: { createdAtMs: -1 } });
      const configuration = parse(savedConfigurationSchema, JSON.parse(run.configurationJson) as unknown);
      const binding = configuration.find((item) => item.role === operation.role && item.taskId ===
        (operation.role === "image" ? null : operation.taskId));
      if (run.activeOperationId || latest?._id !== operation._id || operation.state !== "succeeded" ||
          operation.dispatchStartedAtMs == null || operation.workflowRunId !== input.workflowRunId ||
          operation.parentWorkflowRunId !== input.parentWorkflowRunId || binding?.publishedWorkflowId !== input.workflowId) {
        throw new ExperimentRepositoryError("conflict", "Terminal conflict differs from retained callback evidence.");
      }
      if (run.status === "completed" || run.status === "failed") throw new ExperimentRepositoryError("invalid_state", "Terminal run cannot be blocked.");
      if (run.mode === "balanced" && campaignLedger && run.m4?.campaignId === campaignLedger.grant.campaignId) await campaignLedger.stop(session, input.nowMs);
      if (run.status === "blocked" && run.safeFailure === "definite_failure") return run;
      const updated = await runs.findOneAndUpdate({ _id: run._id, revision: run.revision, activeOperationId: null }, {
        $set: { status: "blocked", safeFailure: "definite_failure", updatedAtMs: input.nowMs }, $inc: { revision: 1 },
      }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("stale_revision", "Run changed before terminal conflict.");
      await failTerminalPageBatchItems(database, updated, session, input.nowMs);
      return updated;
    });
  }

  async function completeOperation(raw: unknown): Promise<{ operation: ExperimentOperationDocument; reused: boolean }> {
    const input = parse(completeInput, raw);
    const { envelope } = input;
    const startedAt = elapsedNow();
    const nowMs = () => input.nowMs + Math.floor(elapsedNow() - startedAt);
    const claimId = randomUUID();
    // Acquire outside the long transaction so observers see the lease before
    // snapshot/source reads. A process interruption leaves it recoverable after
    // 60 seconds, without changing dispatch identity, budget or deadline.
    const claimed = await operations.findOneAndUpdate({ _id: envelope.operationId, runId: envelope.runId,
      workflowRunId: envelope.workflowRunId, parentWorkflowRunId: input.parentWorkflowRunId,
      inputFingerprint: envelope.inputFingerprint, reservationCount: 1,
      state: { $in: ["started", "unknown"] }, imageCompletionClaim: null,
      $or: [{ resultFinalizationClaim: null }, { "resultFinalizationClaim.expiresAtMs": { $lte: input.nowMs } }],
    }, { $set: { resultFinalizationClaim: { id: claimId, expiresAtMs: input.nowMs + 60_000 } } }, { returnDocument: "after" });
    let committed = false;
    try {
      const completed = await withMongoTransaction(database, async (session) => measurePhase(
        { runId: envelope.runId, operationId: envelope.operationId }, "result_transaction", async () => {
      const operation = must(await operations.findOne({ _id: envelope.operationId, runId: envelope.runId }, { session }), "Operation");
      const run = must(await runs.findOne({ _id: envelope.runId }, { session }), "Run");
      if (operation.workflowRunId !== envelope.workflowRunId || operation.parentWorkflowRunId !== input.parentWorkflowRunId || operation.inputFingerprint !== envelope.inputFingerprint) throw new ExperimentRepositoryError("conflict", "Completion identity differs from the claim.");
      let result: RoleResult;
      try { result = validateRoleResult(operation.role, envelope.result); }
      catch { throw new ExperimentRepositoryError("invalid_result", "Result kind does not match the operation role."); }
      if (run.mode === "balanced" && operation.providerKind === "text") {
        try {
          if (canonical(m4ObservedRoleResult(run, operation)) !== canonical(result)) throw new Error("Different original result");
        } catch { throw new ExperimentRepositoryError("invalid_result", "Balanced completion must match retained provider evidence and usage."); }
      }
      if (operation.role === "image" && (operation.taskId !== "J13" || result.kind !== "clarification" ||
          !configuredPageIllustrationTask(run.configurationJson) || operation.imageCompletionDigest || operation.imageCompletionClaim)) {
        throw new ExperimentRepositoryError("invalid_result", "Image clarification requires an enabled page operation with no binary completion claim.");
      }
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
      const recoveryPermission = campaignLedger?.grant.completionRecoveries?.find(item => item.runId === run._id && item.operationId === operation._id);
      const recovering = run.status === "blocked" && run.safeFailure === "definite_failure" &&
        options.m4ExecutionEnabled === true && run.mode === "balanced" && operation.providerKind === "text" &&
        operation.role === "specialist" && operation.taskId === "J11" && run.generationCompletedAtMs == null &&
        !operation.lifecycle?.stop && !operation.m4CompletionRecovery && recoveryPermission &&
        operation.resultJson === null && operation.resultDigest === null && operation.materializationJson === null &&
        operation.authorizationClaim == null && operation.imageCompletionClaim == null &&
        operation.m4Observation?.issue === null && m4RequestBundleMatches(campaignLedger!.snapshot.policy, campaignLedger!.grant);
      if (run.status === "blocked" && run.safeFailure !== "unknown_outcome" && !recovering) throw new ExperimentRepositoryError("invalid_state", "A definite blocker requires inspection before completion.");
      if ((operation.state !== "started" && operation.state !== "unknown") || operation.reservationCount !== 1 || run.activeOperationId !== operation._id) throw new ExperimentRepositoryError("invalid_state", "Operation is not awaiting authorized completion.");
      const lease = operation.resultFinalizationClaim;
      if (!claimed || lease?.id !== claimId || lease.expiresAtMs <= nowMs()) throw new ExperimentRepositoryError("conflict", "Result finalization is already active or its lease expired.");
      if (operation.role === "image") await assertJ13Admission(session, run, operation, input.parentWorkflowRunId, "claim");
      // Existing source verifiers load the run in this same transaction. Give
      // only the exact authorized recovery ordinary in-flight eligibility; a
      // failed source/materialization check rolls this change back with it.
      if (recovering) {
        const admitted = await runs.updateOne({ _id: run._id, revision: run.revision, status: "blocked",
          safeFailure: "definite_failure", activeOperationId: operation._id },
          { $set: { status: "running", safeFailure: null } }, { session });
        if (admitted.modifiedCount !== 1) throw new ExperimentRepositoryError("stale_revision", "Recovery admission changed.");
      }
      const materializationRun = recovering ? { ...run, status: "running" as const, safeFailure: null } : run;
      const materialized = await materializeNarrativeResult(database, session, materializationRun, operation, result, warnings, input.nowMs, options.store);
      if (lease.expiresAtMs <= nowMs()) throw new ExperimentRepositoryError("conflict", "Result finalization lease expired before saving.");
      const finalWarnings = Array.isArray(materialized.summary.warnings) ? materialized.summary.warnings : warnings;
      const updated = await operations.findOneAndUpdate({ _id: operation._id, state: operation.state, "resultFinalizationClaim.id": claimId }, { $set: { state: "succeeded", ...completionLifecycle(operation, nowMs()), resultFinalizationClaim: null, resultJson, resultDigest, warningsJson: canonical(finalWarnings), materializationJson: canonical(materialized.summary), safeFailure: null, updatedAtMs: input.nowMs,
        ...(recovering ? { m4CompletionRecovery: { reference: recoveryPermission!.reference, evidenceDigest: operation.m4Observation!.evidenceDigest!,
          requestDigest: operation.m4Preparation!.requestDigest, recoveredAtMs: input.nowMs } } : {}) } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("conflict", "Operation completion changed concurrently.");
      const pauseRequested = run.pauseRequested || isRecoveredAttempt(operation, nowMs());
      const changed = await runs.updateOne({ _id: run._id, revision: run.revision, activeOperationId: operation._id }, { $set: { ...materialized.runPatch, activeOperationId: null, pauseRequested, status: pauseRequested ? "paused" : "queued", safeFailure: null, updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session });
      if (changed.modifiedCount !== 1) throw new ExperimentRepositoryError("stale_revision", "Run revision changed.");
      if (recovering) {
        await campaignLedger!.recoverCompletion(session, run, operation, input.nowMs);
        await verifyM4Accounting(database, session, must(await runs.findOne({ _id: run._id }, { session }), "Run"));
      }
      return { operation: updated, reused: false };
      }));
      committed = true;
      return completed;
    } finally {
      if (claimed && !committed) {
        // A failed cleanup leaves only a bounded lease. Never mask the original
        // callback failure, erase a successor lease, or replay execution.
        await withCleanupBudget(() => operations.updateOne({ _id: envelope.operationId, "resultFinalizationClaim.id": claimId },
          { $set: { resultFinalizationClaim: null } })).catch(() => undefined);
      }
    }
  }

  async function failOperation(raw: unknown): Promise<ExperimentOperationDocument> {
    const input = parse(failInput, raw);
    return withMongoTransaction(database, async (session) => {
      const operation = must(await operations.findOne({ _id: input.operationId, runId: input.runId }, { session }), "Operation");
      const run = must(await runs.findOne({ _id: input.runId }, { session }), "Run");
      if (operation.workflowRunId !== input.workflowRunId || operation.parentWorkflowRunId !== input.parentWorkflowRunId) throw new ExperimentRepositoryError("conflict", "Failure identity differs from the claim.");
      if (operation.state === "succeeded") throw new ExperimentRepositoryError("conflict", "Successful operation cannot fail.");
      if (run.mode === "balanced" && campaignLedger && run.m4?.campaignId === campaignLedger.grant.campaignId) await campaignLedger.stop(session, input.nowMs);
      if (operation.state === "failed" && input.category === "definite_failure" && operation.safeFailure === input.category) {
        await failTerminalPageBatchItems(database, run, session, input.nowMs);
        return operation;
      }
      if (operation.state === "unknown" && input.category === "unknown_outcome" && operation.safeFailure === input.category) return operation;
      if (operation.state !== "started" && operation.state !== "unknown") throw new ExperimentRepositoryError("invalid_state", "Operation has no active claim.");
      if (run.activeOperationId !== operation._id) throw new ExperimentRepositoryError("conflict", "Operation is not active.");
      const state = input.category === "unknown_outcome" ? "unknown" : "failed";
      const imageFailureHistory = operation.role === "image" ? { imageFailureHistory: [...(operation.imageFailureHistory ?? []), { category: input.category, recordedAtMs: input.nowMs }] } : {};
      const updated = await operations.findOneAndUpdate({ _id: operation._id, state: operation.state }, { $set: { state, safeFailure: input.category, ...imageFailureHistory, updatedAtMs: input.nowMs } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("conflict", "Operation failure changed concurrently.");
      const changed = await runs.findOneAndUpdate({ _id: run._id, revision: run.revision }, { $set: { status: "blocked", safeFailure: input.category, activeOperationId: state === "unknown" ? operation._id : null, updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session, returnDocument: "after" });
      if (!changed) throw new ExperimentRepositoryError("stale_revision", "Run revision changed.");
      await failTerminalPageBatchItems(database, changed, session, input.nowMs);
      return updated;
    });
  }

  async function beginObservation(operationId: string, nowMs: number) {
    // One bounded GET per five-second cycle, including after process restart.
    // Taking this observation slot does not alter dispatch, deadline or budgets.
    const operation = await operations.findOneAndUpdate({ _id: opaqueIdSchema.parse(operationId),
      dispatchStartedAtMs: { $ne: null }, workflowRunId: { $ne: null },
      // Observation writes must not repeatedly invalidate the callback's source
      // verification transaction. An expired upload lease remains observable.
      $and: [{ $or: [{ authorizationClaim: null }, { "authorizationClaim.expiresAtMs": { $lte: nowMs } }] },
        { $or: [{ imageCompletionClaim: null }, { "imageCompletionClaim.expiresAtMs": { $lte: nowMs } }] },
        { $or: [{ resultFinalizationClaim: null }, { "resultFinalizationClaim.expiresAtMs": { $lte: nowMs } }] }],
      $or: [{ nextObservationAtMs: { $exists: false } }, { nextObservationAtMs: null }, { nextObservationAtMs: { $lte: nowMs } }] },
    { $set: { nextObservationAtMs: time.parse(nowMs) + 5_000 } }, { returnDocument: "after" });
    return operation;
  }
  async function requestObservation(operationId: string) {
    await operations.updateOne({ _id: opaqueIdSchema.parse(operationId), workflowRunId: { $ne: null },
      dispatchStartedAtMs: { $ne: null }, authorizationClaim: null, imageCompletionClaim: null, resultFinalizationClaim: null }, { $set: { nextObservationAtMs: 0 } });
  }

  return { createRun, getRun, listRuns, pause, resume, prepareOperation, failPreparation, beginDispatch, recordDispatchIdentity, verifyDispatchPublication, claimOperation, completeOperation, failOperation, recordDispatchOutcome, recordProgress, blockRun, recordTerminalConflict, getOperation, latestOperation, listOperations, listOperationHeads, beginObservation, requestObservation };
}
