import { hasExperimentImagePolicy } from "@/db/experiment-m4-state";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withMongoTransaction, type Database } from "@/db/client";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { verifyCurrentPageIllustrationSources } from "@/db/experiment-pages";
import { configuredPageIllustrationTask } from "@/lib/experiment-runner/page-illustration-tasks";
import { experimentPageBatchSchema, nextPageBatchItem, pageBatchFingerprint, type PageBatchItemState } from "@/lib/contracts/experiment-page-batches";
import { createExperimentPageIllustrationAssembly } from "@/db/experiment-page-illustrations";
import { validateSavedPageIllustrationPackage } from "@/lib/contracts/experiment-page-illustrations";
import type { ClientSession } from "mongodb";
import { opaqueIdSchema } from "@/lib/contracts/common";
import type { AssetStore } from "@/lib/assets/asset-store";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";
import { operationConfiguration } from "@/lib/experiment-runner/execution-amendment";

const selectionInput = z.strictObject({ jobId: opaqueIdSchema, expectedRevision: z.number().int().nonnegative(), batch: experimentPageBatchSchema });
const identityInput = z.strictObject({ runId: opaqueIdSchema, jobId: opaqueIdSchema });
const bindingInput = identityInput.extend({ operationId: opaqueIdSchema, expectedRevision: z.number().int().nonnegative() });
const refreshInput = identityInput.extend({ pageId: opaqueIdSchema, expectedRevision: z.number().int().nonnegative() });
const itemResult = z.strictObject({ operationId: opaqueIdSchema.nullable(), assetId: opaqueIdSchema.nullable(), pageVersionId: opaqueIdSchema.nullable(),
  replacedOperationIds: z.array(opaqueIdSchema).max(300).optional(),
  pausedOperationIds: z.array(opaqueIdSchema).max(300).optional(),
  clarificationOperationIds: z.array(opaqueIdSchema).max(300).optional() });
function invalid(message: string): never { throw new ExperimentRepositoryError("invalid_state", message); }

// Selection records intent only. It does not reserve a provider call, dispatch an
// operation or approve a result. Dify items are owned by the experiment ledger,
// never the legacy job worker or its restart-to-pending recovery.
export function createExperimentPageBatchRepository(input: { database: Database; store: AssetStore; now?: () => number }) {
  const { database, store } = input;
  const now = input.now ?? Date.now;
  async function load(identity: z.infer<typeof identityInput>, session: ClientSession) {
    const options = { session };
    const run = await database.collections.experiment_runs.findOne({ _id: identity.runId }, options);
    const job = await database.collections.generation_jobs.findOne({ _id: identity.jobId, jobType: "dify_pages" }, options);
    if (!run || !job) throw new ExperimentRepositoryError("not_found", "Page batch or owning run was not found.");
    const batch = experimentPageBatchSchema.parse(JSON.parse(job.inputJson));
    if (batch.runId !== run._id || job.bookletId !== run.bookletId || batch.configurationHash !== run.configurationHash ||
      (run.mode !== "simulated" && !hasExperimentImagePolicy(run)) || !configuredPageIllustrationTask(run.configurationJson) ||
      job.idempotencyKey !== `dify-pages:${run._id}:${pageBatchFingerprint(batch)}`) invalid("Page batch ownership or saved selection changed.");
    const items = await database.collections.generation_items.find({ jobId: job._id }, options).sort({ position: 1 }).toArray();
    const states: PageBatchItemState[] = items.map((item) => {
      const result = item.resultJson ? itemResult.parse(JSON.parse(item.resultJson)) : null;
      if (item.inputJson !== JSON.stringify(batch.pages[item.position]) || item.assetId !== (result?.assetId ?? null)) invalid("Page batch item evidence differs from the retained selection.");
      return { pageId: item.itemKey, position: item.position, status: item.status as PageBatchItemState["status"],
        operationId: result?.operationId ?? null, assetId: result?.assetId ?? null, pageVersionId: result?.pageVersionId ?? null };
    });
    const next = nextPageBatchItem(batch, states, run.pauseRequested || run.status === "paused");
    return { run, job, batch, items, states, next };
  }
  async function get(raw: unknown) {
    const identity = identityInput.parse(raw);
    return withMongoTransaction(database, async (session) => {
      const value = await load(identity, session);
      return { jobId: value.job._id, status: value.job.status, batch: value.batch, items: value.states, next: value.next };
    });
  }

  async function listActive(runId: string) {
    opaqueIdSchema.parse(runId);
    const run = await database.collections.experiment_runs.findOne({ _id: runId });
    if (!run) throw new ExperimentRepositoryError("not_found", "Page batch run was not found.");
    const jobs = await database.collections.generation_jobs.find({ bookletId: run.bookletId, jobType: "dify_pages",
      status: { $in: ["pending", "running", "paused", "unknown", "partial"] } }).sort({ createdAtMs: 1, _id: 1 }).toArray();
    const ownJobs = jobs.filter((job) => experimentPageBatchSchema.parse(JSON.parse(job.inputJson)).runId === runId);
    return Promise.all(ownJobs.map((job) => get({ runId, jobId: job._id })));
  }

  async function bind(raw: unknown) {
    const value = bindingInput.parse(raw);
    return withMongoTransaction(database, async (session) => {
      const checked = await load(value, session), options = { session };
      const existing = checked.states.find((item) => item.operationId === value.operationId);
      if (existing) return { itemId: checked.items[existing.position]._id, reused: true };
      if (checked.run.revision !== value.expectedRevision) throw new ExperimentRepositoryError("stale_revision", "Page batch binding revision changed.");
      if (!(checked.next.kind === "ready" || checked.next.kind === "waiting") || checked.run.pauseRequested || !["queued", "running"].includes(checked.run.status)) invalid("Page batch cannot bind new work.");
      const selected = checked.batch.pages[checked.next.position];
      const priorResult = checked.items[checked.next.position].resultJson ? itemResult.parse(JSON.parse(checked.items[checked.next.position].resultJson!)) : null;
      const clarificationOperationIds = [...priorResult?.clarificationOperationIds ?? []];
      if (checked.next.kind === "waiting") {
        const prior = await database.collections.experiment_operations.findOne({ _id: checked.next.operationId!, runId: value.runId,
          role: "image", taskId: "J13", subjectKind: "page", subjectId: selected.pageId, mode: checked.run.mode, state: "succeeded" }, options);
        const configuration = prior ? operationConfiguration(checked.run, prior) : savedConfigurationSchema.parse(JSON.parse(checked.run.configurationJson));
        const imageBinding = configuration.find((binding) => binding.role === "image" && binding.taskId === null);
        const testerBinding = configuration.find((binding) => binding.role === "tester" && binding.taskId === null);
        const clarification = prior?.resultJson ? JSON.parse(prior.resultJson) as { kind?: string } : null;
        if (!prior || clarification?.kind !== "clarification" || prior.imageCompletionDigest || prior.imageCompletionClaim || !prior.workflowRunId ||
          prior.reservationCount !== 1 || !imageBinding || prior.verifiedWorkflowId !== imageBinding.publishedWorkflowId || !testerBinding) {
          invalid("Only an answered, publication-verified clarification permits a successor page operation.");
        }
        const answers = await database.collections.experiment_operations.find({ runId: value.runId, role: "tester", taskId: null,
          subjectKind: "book", subjectId: checked.run.bookletId, mode: checked.run.mode, providerKind: "text", state: "succeeded",
          reservationCount: 1, workflowRunId: { $ne: null }, verifiedWorkflowId: testerBinding.publishedWorkflowId }, options).toArray();
        const answered = answers.some((answer) => {
          const result = answer.resultJson ? JSON.parse(answer.resultJson) as { kind?: string; payload?: { decision?: { action?: string; questionId?: string } } } : null;
          const summary = answer.materializationJson ? JSON.parse(answer.materializationJson) as { answeredQuestionId?: string } : null;
          return result?.kind === "decision" && result.payload?.decision?.action === "answer" &&
            result.payload.decision.questionId === prior._id && summary?.answeredQuestionId === prior._id;
        });
        if (!answered || checked.run.pendingDecisionJson && JSON.parse(checked.run.pendingDecisionJson).kind === "question" ||
          clarificationOperationIds.includes(prior._id) || clarificationOperationIds.length >= 300) invalid("Page clarification answer evidence is incomplete.");
        clarificationOperationIds.push(prior._id);
      }
      const operation = await database.collections.experiment_operations.findOne({ _id: value.operationId, runId: value.runId }, options);
      if (!operation || checked.run.activeOperationId !== operation._id || operation.state !== "prepared" || operation.dispatchStartedAtMs != null ||
        operation.role !== "image" || operation.providerKind !== "image" || operation.taskId !== "J13" || operation.subjectKind !== "page" ||
        operation.subjectId !== selected.pageId || operation.mode !== checked.run.mode || operation.reservationCount !== 0 ||
        operation.expectedTargetVersionId !== selected.previousPageVersionId) invalid("Page batch requires its owning prepared J13 operation before dispatch.");
      const sources = await verifyCurrentPageIllustrationSources(database, session, checked.run, selected.pageId, store);
      if (sources.layoutVersionId !== checked.batch.layoutVersionId || sources.pageBibleVersionId !== selected.pageBibleVersionId ||
        JSON.stringify(operation.dependencyVersionIds) !== JSON.stringify(sources.request.request.sourceVersionIds)) invalid("Page batch operation sources changed.");
      const timestamp = now();
      const changed = await database.collections.experiment_runs.updateOne({ _id: value.runId, revision: value.expectedRevision,
        activeOperationId: operation._id, pauseRequested: false }, { $inc: { revision: 1 }, $set: { updatedAtMs: timestamp } }, options);
      if (!changed.matchedCount) throw new ExperimentRepositoryError("stale_revision", "Page batch binding lost the run revision.");
      const item = checked.items[checked.next.position];
      await database.collections.generation_items.updateOne({ _id: item._id, status: checked.states[checked.next.position].status }, { $set: { status: "running",
        resultJson: JSON.stringify({ operationId: operation._id, assetId: null, pageVersionId: null,
          ...(priorResult?.pausedOperationIds?.length ? { pausedOperationIds: priorResult.pausedOperationIds } : {}),
          ...(clarificationOperationIds.length ? { clarificationOperationIds } : {}) }), startedAtMs: timestamp }, $inc: { attemptCount: 1 } }, options);
      await database.collections.generation_jobs.updateOne({ _id: checked.job._id }, { $set: { status: "running",
        startedAtMs: checked.job.startedAtMs ?? timestamp, updatedAtMs: timestamp } }, options);
      return { itemId: item._id, reused: false };
    });
  }

  // Reconcile only the retained operation. No provider execution or retry occurs.
  // A clarification stays attached until its answer authorizes a later operation.
  async function reconcile(raw: unknown) {
    const identity = identityInput.parse(raw);
    return withMongoTransaction(database, async (session) => {
      const checked = await load(identity, session), options = { session };
      if (!("position" in checked.next) || !checked.next.operationId) return checked.next;
      const state = checked.states[checked.next.position], selected = checked.batch.pages[state.position];
      const operation = await database.collections.experiment_operations.findOne({ _id: state.operationId!, runId: identity.runId,
        role: "image", taskId: "J13", subjectKind: "page", subjectId: selected.pageId, mode: checked.run.mode }, options);
      if (!operation) invalid("Retained page batch operation is missing.");
      const configuration = operationConfiguration(checked.run, operation);
      const imageBinding = configuration.find((binding) => binding.role === "image" && binding.taskId === null);
      // A verified pre-claim Pause is not an image failure. Keep its operation as
      // evidence, but leave this exact ordered item available for Resume.
      const unclaimedPause = operation.state === "failed" && operation.safeFailure === null && operation.reservationCount === 0 &&
        !!operation.workflowRunId && !!imageBinding && operation.verifiedWorkflowId === imageBinding.publishedWorkflowId &&
        !operation.imageCompletionClaim && !operation.imageCompletionDigest && !operation.resultJson;
      const previousResult = itemResult.parse(JSON.parse(checked.items[state.position].resultJson!));
      const pausedOperationIds = [...previousResult.pausedOperationIds ?? []];
      if (unclaimedPause) {
        if (pausedOperationIds.includes(operation._id) || pausedOperationIds.length >= 300) invalid("Page pause history is invalid or exhausted.");
        pausedOperationIds.push(operation._id);
      }
      let status: "pending" | "running" | "unknown" | "failed" | "succeeded" = unclaimedPause ? "pending" : operation.state === "unknown" ? "unknown" : operation.state === "failed" ? "failed" : "running";
      let assetId: string | null = null, pageVersionId: string | null = null;
      if (operation.state === "succeeded" && operation.imageCompletionDigest) {
        const rows = await database.collections.artifacts.find({ experimentRunId: identity.runId, bookletId: checked.run.bookletId,
          taskId: "J13", subjectKind: "page", subjectId: selected.pageId }, options).toArray();
        const artifact = rows.length === 1 ? rows[0] : null;
        const version = artifact?.currentVersionId ? await database.collections.artifact_versions.findOne({ _id: artifact.currentVersionId, artifactId: artifact._id }, options) : null;
        if (!version) invalid("Completed page batch image requires saved illustration materialization.");
        const content = validateSavedPageIllustrationPackage(JSON.parse(version.contentJson));
        if (content.operationId !== operation._id || content.pageBibleVersionId !== selected.pageBibleVersionId ||
          content.candidateLineage.previousPageVersionId !== selected.previousPageVersionId || !content.sourceVersionIds.includes(checked.batch.layoutVersionId)) {
          invalid("Saved page batch result does not match its retained operation and sources.");
        }
        await createExperimentPageIllustrationAssembly({ database, store }).verifyVersion({ runId: identity.runId, versionId: version._id }, session);
        status = "succeeded"; assetId = content.assetId; pageVersionId = version._id;
      }
      if (state.status === status && state.assetId === assetId && state.pageVersionId === pageVersionId) return checked.next;
      const timestamp = now();
      const changed = await database.collections.experiment_runs.updateOne({ _id: identity.runId, revision: checked.run.revision },
        { $inc: { revision: 1 }, $set: { updatedAtMs: timestamp } }, options);
      if (!changed.matchedCount) throw new ExperimentRepositoryError("stale_revision", "Page batch reconciliation lost the run revision.");
      await database.collections.generation_items.updateOne({ _id: checked.items[state.position]._id }, { $set: { status, assetId,
        resultJson: JSON.stringify({ operationId: unclaimedPause ? null : operation._id, assetId, pageVersionId,
          ...(JSON.parse(checked.items[state.position].resultJson!).replacedOperationIds ? { replacedOperationIds: JSON.parse(checked.items[state.position].resultJson!).replacedOperationIds } : {}),
          ...(pausedOperationIds.length ? { pausedOperationIds } : {}),
          ...(JSON.parse(checked.items[state.position].resultJson!).clarificationOperationIds ? { clarificationOperationIds: JSON.parse(checked.items[state.position].resultJson!).clarificationOperationIds } : {}) }),
        finishedAtMs: ["succeeded", "failed"].includes(status) ? timestamp : null } }, options);
      const states = checked.states.map((item) => item.position === state.position ? { ...item, status, operationId: unclaimedPause ? null : operation._id, assetId, pageVersionId } : item);
      const next = nextPageBatchItem(checked.batch, states, checked.run.pauseRequested || checked.run.status === "paused");
      await database.collections.generation_jobs.updateOne({ _id: checked.job._id }, { $set: { status: next.kind === "complete" ? "succeeded" :
        status === "unknown" ? "unknown" : status === "failed" ? "failed" : next.kind === "paused" ? "paused" : "running",
        updatedAtMs: timestamp, finishedAtMs: next.kind === "complete" || status === "failed" ? timestamp : null } }, options);
      return next;
    });
  }
  async function select(raw: unknown) {
    const value = selectionInput.parse(raw);
    const fingerprint = pageBatchFingerprint(value.batch);
    const idempotencyKey = `dify-pages:${value.batch.runId}:${fingerprint}`;
    return withMongoTransaction(database, async (session) => {
      const options = { session };
      const run = await database.collections.experiment_runs.findOne({ _id: value.batch.runId }, options);
      if (!run) throw new ExperimentRepositoryError("not_found", "Page batch run was not found.");
      if (run.configurationHash !== value.batch.configurationHash || (run.mode !== "simulated" && !hasExperimentImagePolicy(run)) || !configuredPageIllustrationTask(run.configurationJson)) {
        invalid("Page batch requires the saved simulated final-page configuration.");
      }
      const existing = await database.collections.generation_jobs.findOne({ idempotencyKey }, options);
      if (existing) {
        if (existing.jobType !== "dify_pages" || existing.bookletId !== run.bookletId || pageBatchFingerprint(JSON.parse(existing.inputJson)) !== fingerprint) {
          invalid("Retained page batch identity differs from its selection.");
        }
        return { jobId: existing._id, reused: true };
      }
      if (run.revision !== value.expectedRevision) throw new ExperimentRepositoryError("stale_revision", "Page batch run revision changed.");
      if (run.generationCompletedAtMs != null) {
        invalid("Saved generation is immutable; select pages in a successor run.");
      }
      const pending = run.pendingDecisionJson ? JSON.parse(run.pendingDecisionJson) as { kind?: string; taskId?: string; subjectKind?: string; subjectId?: string; artifactVersionId?: string } : null;
      const exactRevision = pending?.kind === "revision" && pending.taskId === "J13" && pending.subjectKind === "page" &&
        value.batch.selection === "single" && value.batch.pages.length === 1 && pending.subjectId === value.batch.pages[0].pageId &&
        pending.artifactVersionId === value.batch.pages[0].previousPageVersionId;
      if (!["queued", "running", "paused"].includes(run.status) || run.activeOperationId || pending && !exactRevision) {
        invalid("Page batch selection requires idle work with no pending decision.");
      }
      const active = await database.collections.generation_jobs.findOne({ bookletId: run.bookletId, jobType: "dify_pages",
        status: { $in: ["pending", "running", "paused", "unknown", "partial"] } }, options);
      if (active) throw new ExperimentRepositoryError("conflict", "Reconcile the retained page batch before selecting another.");
      for (const page of value.batch.pages) {
        const sources = await verifyCurrentPageIllustrationSources(database, session, run, page.pageId, store);
        if (sources.layoutVersionId !== value.batch.layoutVersionId || sources.pageBibleVersionId !== page.pageBibleVersionId) {
          throw new ExperimentRepositoryError("conflict", "Selected page sources are no longer current.");
        }
        const artifacts = await database.collections.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId,
          taskId: "J13", subjectKind: "page", subjectId: page.pageId }, options).toArray();
        if (artifacts.length > 1 || (artifacts[0]?.currentVersionId ?? null) !== page.previousPageVersionId) {
          throw new ExperimentRepositoryError("conflict", "Selected prior page version is no longer current.");
        }
      }
      const timestamp = now();
      const changed = await database.collections.experiment_runs.updateOne({ _id: run._id, revision: value.expectedRevision,
        activeOperationId: null, pauseRequested: run.pauseRequested }, { $inc: { revision: 1 }, $set: { updatedAtMs: timestamp } }, options);
      if (!changed.matchedCount) throw new ExperimentRepositoryError("stale_revision", "Page batch admission lost the run revision.");
      await database.collections.generation_jobs.insertOne({ _id: value.jobId, bookletId: run.bookletId, jobType: "dify_pages",
        status: "pending", idempotencyKey, inputJson: JSON.stringify(value.batch), errorJson: null,
        createdAtMs: timestamp, startedAtMs: null, finishedAtMs: null, updatedAtMs: timestamp }, options);
      await database.collections.generation_items.insertMany(value.batch.pages.map((page, position) => ({ _id: randomUUID(),
        jobId: value.jobId, itemKey: page.pageId, position, status: "pending", attemptCount: 0,
        inputJson: JSON.stringify(page), resultJson: null, assetId: null, errorJson: null, executionCardId: null,
        executionBatchId: null, startedAtMs: null, finishedAtMs: null })), options);
      return { jobId: value.jobId, reused: false };
    });
  }
  // Replace a drained stale selection with linked current work. Historical
  // inputs/items stay immutable; no image is reserved or dispatched here.
  async function refresh(raw: unknown) {
    const value = refreshInput.parse(raw);
    return withMongoTransaction(database, async (session) => {
      const checked = await load(value, session), options = { session };
      if (checked.job.supersededByJobId) {
        const successor = await load({ runId: value.runId, jobId: checked.job.supersededByJobId }, session);
        if (successor.job.supersedesJobId !== checked.job._id) invalid("Page batch successor linkage changed.");
        return { jobId: successor.job._id, reused: true };
      }
      const run = checked.run;
      if (run.revision !== value.expectedRevision) throw new ExperimentRepositoryError("stale_revision", "Page batch refresh revision changed.");
      if (run.activeOperationId || run.pauseRequested || !["queued", "running"].includes(run.status) || run.generationCompletedAtMs != null ||
        !["pending", "running", "paused", "partial"].includes(checked.job.status) ||
        checked.states.some((item) => !["pending", "succeeded"].includes(item.status))) invalid("Page batch refresh requires drained, reconciled work.");
      if (await database.collections.experiment_operations.findOne({ runId: run._id, state: { $in: ["prepared", "started", "unknown"] } }, options)) {
        invalid("Outstanding page operation must be reconciled before refreshing selection.");
      }
      const pending = run.pendingDecisionJson ? JSON.parse(run.pendingDecisionJson) as { kind?: string; taskId?: string; subjectKind?: string; subjectId?: string; artifactVersionId?: string } : null;
      if (pending && !(pending.kind === "revision" && pending.taskId === "J13" && pending.subjectKind === "page" && pending.subjectId === value.pageId)) {
        invalid("Page batch refresh requires an exact page revision or changed approved sources.");
      }
      const pages: z.infer<typeof experimentPageBatchSchema>["pages"] = [];
      let layoutVersionId: string | null = null;
      let targetChanged = false;
      const orderedIds = [value.pageId, ...checked.batch.pages.map((page) => page.pageId).filter((pageId) => pageId !== value.pageId)];
      for (const pageId of orderedIds) {
        const rows = await database.collections.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId,
          taskId: "J13", subjectKind: "page", subjectId: pageId }, options).toArray();
        if (rows.length > 1) invalid("Page batch target is ambiguous.");
        const artifact = rows[0];
        if (pageId === value.pageId && pending && pending.artifactVersionId !== artifact?.currentVersionId) invalid("Page revision target changed.");
        if (artifact && !["needs_review", ...(pageId === value.pageId && pending ? ["draft"] : [])].includes(artifact.state)) {
          if (pageId === value.pageId) invalid("Selected page does not require regeneration.");
          continue;
        }
        const sources = await verifyCurrentPageIllustrationSources(database, session, run, pageId, store);
        if (layoutVersionId && layoutVersionId !== sources.layoutVersionId) invalid("Refreshed pages have different layouts.");
        layoutVersionId = sources.layoutVersionId;
        const prior = checked.batch.pages.find((page) => page.pageId === pageId);
        if (pageId === value.pageId) targetChanged = !!pending || !prior || checked.batch.layoutVersionId !== sources.layoutVersionId ||
          prior.pageBibleVersionId !== sources.pageBibleVersionId || prior.previousPageVersionId !== (artifact?.currentVersionId ?? null);
        pages.push({ pageId, pageBibleVersionId: sources.pageBibleVersionId, previousPageVersionId: artifact?.currentVersionId ?? null });
      }
      if (!targetChanged || !layoutVersionId || !pages.length) invalid("Page batch refresh has no verified changed target.");
      const batch = experimentPageBatchSchema.parse({ ...checked.batch, layoutVersionId, pages,
        selection: pages.length === 1 ? "single" : "selected_batch" });
      const idempotencyKey = `dify-pages:${run._id}:${pageBatchFingerprint(batch)}`;
      if (await database.collections.generation_jobs.findOne({ idempotencyKey }, options)) invalid("Refreshed page selection already has unreconciled history.");
      const timestamp = now(), jobId = randomUUID();
      const changed = await database.collections.experiment_runs.updateOne({ _id: run._id, revision: value.expectedRevision,
        activeOperationId: null, pauseRequested: false }, { $inc: { revision: 1 }, $set: { updatedAtMs: timestamp } }, options);
      if (!changed.matchedCount) throw new ExperimentRepositoryError("stale_revision", "Page refresh lost the run revision.");
      await database.collections.generation_jobs.updateOne({ _id: checked.job._id, status: checked.job.status },
        { $set: { status: "superseded", supersededByJobId: jobId, updatedAtMs: timestamp, finishedAtMs: timestamp } }, options);
      await database.collections.generation_jobs.insertOne({ _id: jobId, bookletId: run.bookletId, jobType: "dify_pages", status: "pending",
        idempotencyKey, inputJson: JSON.stringify(batch), errorJson: null, supersedesJobId: checked.job._id,
        createdAtMs: timestamp, startedAtMs: null, finishedAtMs: null, updatedAtMs: timestamp }, options);
      await database.collections.generation_items.insertMany(batch.pages.map((page, position) => ({ _id: randomUUID(), jobId,
        itemKey: page.pageId, position, status: "pending", attemptCount: 0, inputJson: JSON.stringify(page), resultJson: null,
        assetId: null, errorJson: null, executionCardId: null, executionBatchId: null, startedAtMs: null, finishedAtMs: null })), options);
      return { jobId, reused: false };
    });
  }
  return { select, get, listActive, bind, reconcile, refresh };
}
