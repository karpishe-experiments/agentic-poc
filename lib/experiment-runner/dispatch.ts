import { createHash, randomUUID } from "node:crypto";
import type { Database } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { createExperimentRepository, ExperimentRepositoryError } from "@/db/experiment-repository";
import { createExperimentStyleAssembly } from "@/db/experiment-style";
import { createExperimentSheetAssembly } from "@/db/experiment-sheets";
import type { AssetStore } from "@/lib/assets/asset-store";
import { createAssetStore } from "@/lib/assets/create-asset-store";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { styleSampleRequests, referenceSheetRequest } from "@/lib/experiment-runner/reference-requests";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { configurationSnapshot, selectBinding, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { createWorkflowRuntime, runtimeCompletion, runtimeImageCompletion, type RuntimeResult, type WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { runTrackedMutation } from "@/lib/application/deployment-control";
import { configuredNarrativeTasks, currentApprovedSourceIds, isNarrativeTask } from "@/lib/experiment-runner/narrative-tasks";
import type { SpecialistTask } from "@/lib/contracts/experiment-runner";
import { configuredReferenceSheetTasks } from "@/lib/experiment-runner/reference-targets";
import { configuredPaginationTask } from "@/lib/experiment-runner/pagination-tasks";
import { configuredPageBibleTask } from "@/lib/experiment-runner/page-bible-tasks";
import { withMongoTransaction } from "@/db/client";
import { verifyCurrentPageIllustrationSources } from "@/db/experiment-pages";
import { createExperimentPageIllustrationAssembly } from "@/db/experiment-page-illustrations";
import { createExperimentReferenceUploads } from "@/db/experiment-reference-uploads";
import { createExperimentPageBatchRepository } from "@/db/experiment-page-batches";
import { createReferenceTransport, type ReferenceUploadResult } from "@/lib/experiment-runner/reference-transport";
import { verifyReferenceReadback } from "@/lib/experiment-runner/reference-readback";
import { createExperimentCompletionService } from "@/db/experiment-completion";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
function fingerprint(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }

export function createExperimentDispatcher(deps: {
  database: Database; config: BookletRunnerConfig; runtime?: WorkflowRuntime;
  mutate?: typeof runTrackedMutation; now?: () => number;
  store?: () => AssetStore;
  uploadReference?: (binding: ReturnType<typeof selectBinding>, runId: string, bytes: Uint8Array) => Promise<ReferenceUploadResult>;
}) {
  const store = deps.store ?? createAssetStore;
  const repository = createExperimentRepository(deps.database, { store });
  const context = createExperimentContextService(deps.database, { store });
  const runtime = deps.runtime ?? createWorkflowRuntime(deps.config);
  const mutate = deps.mutate ?? runTrackedMutation;
  const now = deps.now ?? Date.now;
  const uploadReference = deps.uploadReference ?? createReferenceTransport(deps.config).upload;
  const batches = () => createExperimentPageBatchRepository({ database: deps.database, store: store(), now });
  const bindingFor = (operation: ExperimentOperationDocument, run: ExperimentRunDocument) => selectBinding(deps.config,
    operation.role, operation.taskId as SpecialistTask | null, run.persona);

  async function preparePageImage(run: ExperimentRunDocument, view: NonNullable<Awaited<ReturnType<typeof context.getRunView>>>, manager: ExperimentOperationDocument) {
    const work = view.nextPageIllustrationWork;
    if (!work || work.kind !== "image" || !manager.workflowRunId || !manager.verifiedWorkflowId) {
      throw new ExperimentRepositoryError("conflict", "Page image requires a verified manager selection.");
    }
    const selection = JSON.parse(manager.resultJson ?? "null") as { kind?: string; payload?: { taskId?: string; subjectKind?: string; subjectId?: string } } | null;
    if (selection?.kind !== "delegate" || selection.payload?.taskId !== "J13" || selection.payload.subjectKind !== "page" || selection.payload.subjectId !== work.subjectId) {
      throw new ExperimentRepositoryError("conflict", "Manager selection does not match the eligible page.");
    }
    const assetStore = store();
    const sources = await withMongoTransaction(deps.database, async (session) => {
      const selected = await verifyCurrentPageIllustrationSources(deps.database, session, run, work.subjectId, assetStore);
      for (const page of selected.layout.pages) {
        if (page.pageId !== work.subjectId) await verifyCurrentPageIllustrationSources(deps.database, session, run, page.pageId, assetStore);
      }
      return selected;
    });
    const request = sources.request.request;
    const inputFingerprint = imageRequestFingerprint(request);
    const history = await repository.listOperations(run._id);
    const matches = history.filter((item) => item.role === "image" && item.taskId === "J13" && item.subjectKind === "page" &&
      item.subjectId === work.subjectId && item.parentWorkflowRunId === manager.workflowRunId && item.inputFingerprint === inputFingerprint);
    const executable = matches.filter((item) => !(item.state === "failed" && item.safeFailure === null &&
      item.reservationCount === 0 && item.verifiedWorkflowId && item.workflowRunId));
    if (executable.length) {
      if (executable.length !== 1 || executable[0].state !== "succeeded" || !executable[0].verifiedWorkflowId) {
        throw new ExperimentRepositoryError("conflict", "Existing page-image outcome requires reconciliation.");
      }
      await createExperimentPageIllustrationAssembly({ database: deps.database, store: assetStore, now }).assemble({
        runId: run._id, pageId: work.subjectId, imageOperationId: executable[0]._id,
      });
      return null;
    }
    let active = await batches().listActive(run._id);
    if (active.length === 1) {
      const retained = active[0], selected = retained.batch.pages.find((page) => page.pageId === work.subjectId);
      if (!("pageId" in retained.next) || retained.next.pageId !== work.subjectId ||
        retained.batch.layoutVersionId !== sources.layoutVersionId || selected?.pageBibleVersionId !== sources.pageBibleVersionId ||
        selected.previousPageVersionId !== work.currentVersionId) {
        await batches().refresh({ runId: run._id, jobId: retained.jobId, pageId: work.subjectId, expectedRevision: run.revision });
        run = (await repository.getRun(run._id))!;
        active = await batches().listActive(run._id);
      }
    }
    if (active.length > 1 || active.length === 1 && (!("pageId" in active[0].next) || active[0].next.pageId !== work.subjectId)) {
      throw new ExperimentRepositoryError("conflict", "Retained batch selection differs from the eligible manager page.");
    }
    if (!active.length) {
      await batches().select({ jobId: randomUUID(), expectedRevision: run.revision, batch: { schemaVersion: "2", runId: run._id,
        configurationHash: run.configurationHash, layoutVersionId: sources.layoutVersionId, selection: "single",
        pages: [{ pageId: work.subjectId, pageBibleVersionId: sources.pageBibleVersionId, previousPageVersionId: work.currentVersionId }] } });
      run = (await repository.getRun(run._id))!;
    }
    return { operation: await repository.prepareOperation({ runId: run._id, operationId: randomUUID(), expectedRevision: run.revision,
      role: "image", taskId: "J13", subjectKind: "page", subjectId: work.subjectId, inputFingerprint,
      attempt: Math.max(0, ...history.filter((item) => item.role === "image" && item.taskId === "J13" && item.subjectId === work.subjectId).map((item) => item.attempt)) + 1,
      providerKind: "image", imageRequest: request, parentWorkflowRunId: manager.workflowRunId, nowMs: now() }),
      parentWorkflowRunId: manager.workflowRunId };
  }

  async function prepareSheetImage(run: ExperimentRunDocument, view: NonNullable<Awaited<ReturnType<typeof context.getRunView>>>) {
    const work = view.nextSheetWork;
    if (!work || work.kind !== "image" || !work.currentVersionId) throw new ExperimentRepositoryError("conflict", "Sheet image target is unavailable.");
    const artifact = view.currentArtifacts.find((item) => item.taskId === work.target.taskId && item.subjectKind === work.target.subjectKind && item.subjectId === work.target.subjectId);
    const draft = artifact?.versions.find((item) => item.id === work.currentVersionId);
    if (!draft || canonical(draft.dependencyVersionIds) !== canonical(work.target.sourceVersionIds)) throw new ExperimentRepositoryError("conflict", "Sheet image sources changed.");
    const request = referenceSheetRequest(work.target.taskId, draft.content);
    const inputFingerprint = imageRequestFingerprint(request);
    const history = await repository.listOperations(run._id);
    const matches = history.filter((item) => item.role === "image" && item.taskId === work.target.taskId &&
      item.subjectKind === work.target.subjectKind && item.subjectId === work.target.subjectId && item.inputFingerprint === inputFingerprint);
    const executable = matches.filter((item) => !(item.state === "failed" && item.safeFailure === null &&
      item.reservationCount === 0 && item.verifiedWorkflowId && item.workflowRunId));
    if (executable.length > 1 || executable.some((item) => item.state !== "succeeded" || !item.verifiedWorkflowId ||
        canonical(JSON.parse(item.imageRequestJson ?? "null")) !== canonical(request))) throw new ExperimentRepositoryError("conflict", "Saved sheet image requires reconciliation.");
    if (executable.length === 1) {
      await createExperimentSheetAssembly({ database: deps.database, store: store(), now }).assemble({
        runId: run._id, draftSheetVersionId: draft.id, imageOperationId: executable[0]._id,
      });
      return null;
    }
    return { operation: await repository.prepareOperation({ runId: run._id, operationId: randomUUID(), expectedRevision: run.revision,
      role: "image", taskId: work.target.taskId, subjectKind: work.target.subjectKind, subjectId: work.target.subjectId,
      inputFingerprint, attempt: Math.max(0, ...matches.map((item) => item.attempt)) + 1, providerKind: "image", imageRequest: request, nowMs: now() }),
      parentWorkflowRunId: draft.sourceOperationId ? history.find((item) => item._id === draft.sourceOperationId)?.workflowRunId ?? null : null };
  }

  async function prepareStyleSample(run: ExperimentRunDocument, view: NonNullable<Awaited<ReturnType<typeof context.getRunView>>>) {
    const style = view.currentArtifacts.find((item) => item.taskId === "J08");
    const draft = style?.versions.find((item) => item.id === style.currentVersionId);
    const sources = currentApprovedSourceIds("J08", view.currentArtifacts);
    if (!draft || !sources || canonical(draft.dependencyVersionIds) !== canonical(sources)) {
      throw new ExperimentRepositoryError("conflict", "Style sample sources are unavailable or stale.");
    }
    const slots = styleSampleRequests(draft.content, { draftStyleVersionId: draft.id, conceptVersionId: sources[0],
      outlineVersionId: sources[1], manuscriptVersionId: sources[2], finalCharactersVersionId: sources[3], finalLocationsVersionId: sources[4] });
    const history = await repository.listOperations(run._id);
    const savedIds: string[] = [];
    for (const slot of slots) {
      const inputFingerprint = imageRequestFingerprint(slot.request);
      const matches = history.filter((item) => item.role === "image" && item.taskId === "J08" &&
        item.subjectKind === "book" && item.subjectId === run.bookletId && item.inputFingerprint === inputFingerprint);
      const executable = matches.filter((item) => !(item.state === "failed" && item.safeFailure === null &&
        item.reservationCount === 0 && item.verifiedWorkflowId && item.workflowRunId));
      // An existing uncertain/failed attempt is not permission to generate again.
      if (executable.length > 1 || executable.some((item) => item.state !== "succeeded" || !item.verifiedWorkflowId ||
          canonical(JSON.parse(item.imageRequestJson ?? "null")) !== canonical(slot.request))) {
        throw new ExperimentRepositoryError("conflict", "Saved style sample requires reconciliation.");
      }
      if (executable.length === 1) { savedIds.push(executable[0]._id); continue; }
      return { operation: await repository.prepareOperation({ runId: run._id, operationId: randomUUID(),
        expectedRevision: run.revision, role: "image", taskId: "J08", subjectKind: "book", subjectId: run.bookletId,
        inputFingerprint, attempt: Math.max(0, ...matches.map((item) => item.attempt)) + 1, providerKind: "image", imageRequest: slot.request, nowMs: now() }),
        parentWorkflowRunId: draft.sourceOperationId ? history.find((item) => item._id === draft.sourceOperationId)?.workflowRunId ?? null : null };
    }
    await createExperimentStyleAssembly({ database: deps.database, store: store(), now }).assemble({
      runId: run._id, draftStyleVersionId: draft.id, sampleOperationIds: savedIds,
    });
    return null;
  }

  async function observeProgress(runId: string, operation: ExperimentOperationDocument) {
    if (operation.state !== "succeeded") return;
    const view = await context.getRunView(runId);
    if (!view) return;
    const images = (await repository.listOperations(runId)).filter((item) => item.role === "image" && item.state === "succeeded" &&
      typeof (JSON.parse(item.resultJson ?? "null") as { assetId?: unknown } | null)?.assetId === "string").map((item) => item._id);
    await repository.recordProgress({ runId, operationId: operation._id, nowMs: now(), fingerprint64: fingerprint({
      artifacts: view.currentArtifacts.map(({ id, state, currentVersionId, versions }) => ({ id, state, currentVersionId, approvals: versions.map((version) => version.approval?.id ?? null) })),
      delegation: view.activeDelegation?.id ?? null, pending: view.pendingDecision, messages: view.creatorMessages.map((message) => message.id),
      ...(images.length ? { images } : {}),
    }) });
  }

  async function reconcile(run: ExperimentRunDocument, operation: ExperimentOperationDocument, result: RuntimeResult, observed = false) {
    const identity = { runId: run._id, operationId: operation._id, parentWorkflowRunId: operation.parentWorkflowRunId, nowMs: now() };
    const current = await repository.getOperation(operation._id);
    if (!current) return;
    const binding = bindingFor(operation, run);
    if (result.kind === "conflict") {
      await repository.blockRun({ runId: run._id, category: "definite_failure", nowMs: now() });
      return;
    }
    if (result.kind === "accepted") {
      await repository.recordDispatchIdentity({ ...identity, workflowRunId: result.execution.id });
      // Start identity is not terminal result evidence. Leave the existing
      // publication/materialization gate closed until runtime GET reconciliation.
      return;
    }
    if (result.kind === "execution") {
      const execution = result.execution;
      if (execution.workflow_id !== binding.publishedWorkflowId || (current.workflowRunId && current.workflowRunId !== execution.id)) {
        await repository.blockRun({ runId: run._id, category: "definite_failure", nowMs: now() });
        return;
      }
      await repository.recordDispatchIdentity({ ...identity, workflowRunId: execution.id });
      if (current.state === "succeeded" &&
          (execution.status === "failed" || execution.status === "stopped")) {
        // Retain callback output, but conflicting terminal evidence requires
        // inspection. It is neither success nor permission to replay.
        await repository.recordTerminalConflict({ ...identity, workflowRunId: execution.id,
          workflowId: execution.workflow_id, status: execution.status });
        return;
      }
      const imageCompletion = operation.role === "image" ? runtimeImageCompletion(execution) : null;
      const completion = runtimeCompletion(execution);
      const imageClarification = operation.role === "image" && operation.taskId === "J13" && completion?.result.kind === "clarification";
      const unclaimedPause = execution.status === "succeeded" && execution.outputs?.authorization_reason === "paused" &&
        current.state === "prepared" && current.reservationCount === 0;
      if (operation.role === "image" && !unclaimedPause && !imageClarification) {
        if (execution.status === "running" && execution.outputs?.image_result === undefined) {
          if (now() >= (current.deadlineAtMs ?? (current.dispatchStartedAtMs ?? now()) + 600_000)) {
            if (current.state === "succeeded") await repository.blockRun({ runId: run._id, category: "unknown_outcome", nowMs: now() });
            else await repository.recordDispatchOutcome({ ...identity, category: "unknown_outcome" });
          }
          return;
        }
        if ((execution.status === "failed" || execution.status === "stopped") && current.state !== "succeeded") {
          await repository.recordDispatchOutcome({ ...identity, category: "observed_failure" });
          return;
        }
        if (!imageCompletion || imageCompletion.runId !== run._id || imageCompletion.operationId !== operation._id ||
            imageCompletion.workflowRunId !== execution.id || imageCompletion.parentWorkflowRunId !== operation.parentWorkflowRunId ||
            imageCompletion.inputFingerprint !== operation.inputFingerprint || imageCompletion.assetId !== operation._id ||
            current.state !== "succeeded" || current.resultDigest !== imageCompletion.sha256) {
          await repository.blockRun({ runId: run._id, category: "definite_failure", nowMs: now() });
          return;
        }
      }
      if (operation.role === "image" && operation.taskId === "J13" && imageCompletion) {
        let matches = false;
        try {
          const references = JSON.parse(current.referenceUploadsJson ?? "null") as { uploadFileId: string }[];
          const expectedIds = references.map((item) => item.uploadFileId);
          const returned = execution.outputs?.reference_files;
          // Dify 1.17.1 serializes an unprovided optional file-list as null.
          // This is empty evidence only when no references were expected.
          matches = (Array.isArray(references) && expectedIds.length === 0 && (returned === undefined || returned === null)) ||
            verifyReferenceReadback(returned, expectedIds);
        } catch { /* Missing or corrupt retained evidence cannot authorize read-back. */ }
        if (!matches) {
          await repository.blockRun({ runId: run._id, category: "definite_failure", nowMs: now() });
          return;
        }
      }
      if (execution.status === "succeeded") {
        await repository.verifyDispatchPublication({ ...identity, workflowRunId: execution.id, workflowId: execution.workflow_id,
          terminalSucceeded: execution.status === "succeeded" });
      }
      if (completion) {
        if (completion.runId !== run._id || completion.operationId !== operation._id || completion.workflowRunId !== execution.id || completion.parentWorkflowRunId !== operation.parentWorkflowRunId || completion.inputFingerprint !== operation.inputFingerprint) {
          await repository.blockRun({ runId: run._id, category: "definite_failure", nowMs: now() });
          return;
        }
        await repository.completeOperation({ envelope: { runId: completion.runId, operationId: completion.operationId, workflowRunId: completion.workflowRunId, inputFingerprint: completion.inputFingerprint, result: completion.result }, parentWorkflowRunId: completion.parentWorkflowRunId, nowMs: now() });
      } else if (current.state !== "succeeded") {
        if (execution.status === "succeeded" && execution.outputs?.authorization_reason === "paused" && current.reservationCount === 0) {
          await repository.recordDispatchOutcome({ ...identity, category: "paused" });
        } else if (execution.status === "failed" || execution.status === "stopped") {
          await repository.recordDispatchOutcome({ ...identity, category: "observed_failure" });
        } else if (execution.status !== "running" || now() >= (current.deadlineAtMs ?? (current.dispatchStartedAtMs ?? now()) + 600_000)) {
          await repository.recordDispatchOutcome({ ...identity, category: "unknown_outcome" });
        }
      }
    } else if (current.state !== "succeeded") {
      await repository.recordDispatchOutcome({ ...identity, category: result.kind === "rejected" ? "observed_failure" : "unknown_outcome" });
    } else if (!current.verifiedWorkflowId) {
      if (observed) return;
      if (!current.workflowRunId || !await repository.beginObservation(current._id, now())) return;
      const recovered = current.workflowRunId ? await runtime.retrieve(binding, current.workflowRunId) : { kind: "unknown" as const };
      if (recovered.kind === "execution") await reconcile(run, current, recovered, true);
      else await repository.blockRun({ runId: run._id, category: "unknown_outcome", nowMs: now() });
      return;
    }
    const saved = await repository.getOperation(operation._id);
    if (saved?.role === "image" && saved.taskId === "J13" && saved.state === "succeeded" && saved.verifiedWorkflowId &&
        (JSON.parse(saved.resultJson ?? "null") as { kind?: string } | null)?.kind !== "clarification") {
      try {
        await createExperimentPageIllustrationAssembly({ database: deps.database, store: store(), now }).assemble({
          runId: run._id, pageId: saved.subjectId, imageOperationId: saved._id,
        });
      } catch {
        // The provider result is known and retained. A materialization failure
        // is not permission to create a new manager/image operation.
        await repository.blockRun({ runId: run._id, category: "definite_failure", nowMs: now() });
        return;
      }
    }
    if (saved?.role === "image" && saved.taskId === "J13") {
      for (const batch of await batches().listActive(run._id)) {
        if (batch.items.some((item) => item.operationId === saved._id)) await batches().reconcile({ runId: run._id, jobId: batch.jobId });
      }
    }
    if (saved) await observeProgress(run._id, saved);
  }

  async function advance(runId: string): Promise<"advanced" | "waiting" | "boundary" | "blocked"> {
    return mutate(async () => {
      let run = await repository.getRun(runId);
      if (!run || run.mode !== "simulated" || run.status === "completed" || run.status === "failed") return "blocked";
      if (!run.activeOperationId && run.status !== "blocked") {
        const last = (await repository.listOperations(runId)).at(-1);
        if (last?.role === "image" && last.taskId === "J13" && last.state === "succeeded" && last.verifiedWorkflowId && last.imageCompletionDigest) {
          try {
            await createExperimentPageIllustrationAssembly({ database: deps.database, store: store(), now }).assemble({ runId,
              pageId: last.subjectId, imageOperationId: last._id });
            for (const batch of await batches().listActive(runId)) {
              if (batch.items.some((item) => item.operationId === last._id)) await batches().reconcile({ runId, jobId: batch.jobId });
            }
            run = (await repository.getRun(runId))!;
          } catch {
            await repository.blockRun({ runId, category: "definite_failure", nowMs: now() });
            return "blocked";
          }
        }
      }
      // Completed slice evidence remains complete after a newer suite is bound.
      // This is a saved-state read, not permission to execute an old publication.
      if (!run.activeOperationId && run.status !== "blocked") {
        const savedView = await context.getRunView(runId);
        if (savedView?.nextNarrativeTask === "slice_complete") {
          const last = (await repository.listOperations(runId)).at(-1);
          if (last?.state === "succeeded" && last.verifiedWorkflowId && run.progressOperationId === last._id &&
              !savedConfigurationSchema.parse(JSON.parse(run.configurationJson)).some((binding) => binding.role === "judge")) return "boundary";
        }
      }
      const expected = configurationSnapshot(deps.config, run.persona);
      if (canonical(expected) !== run.configurationJson) {
        await repository.blockRun({ runId, category: "definite_failure", nowMs: now() });
        return "blocked";
      }
      if (run.status === "blocked" && run.safeFailure !== "unknown_outcome") return "blocked";
      let operation = run.activeOperationId ? await repository.getOperation(run.activeOperationId) : null;
      if (operation?.dispatchStartedAtMs != null) {
        const binding = bindingFor(operation, run);
        // A retained ID is the only read-back path. Never POST after the marker.
        if (operation.workflowRunId) {
          if (!await repository.beginObservation(operation._id, now())) return "waiting";
          await reconcile(run, operation, await runtime.retrieve(binding, operation.workflowRunId), true);
        } else {
          await reconcile(run, operation, { kind: "unknown" });
        }
        return "waiting";
      }
      if (operation && (run.pauseRequested || run.status === "paused")) return "waiting";
      if (run.status === "blocked" && (operation || run.safeFailure !== "unknown_outcome")) return "blocked";
      let parentWorkflowRunId: string | null = null;
      if (!operation) {
        let latest = (await repository.listOperations(runId)).at(-1);
        if (latest?.state === "succeeded" && !latest.verifiedWorkflowId) {
          const binding = bindingFor(latest, run);
          if (latest.workflowRunId && !await repository.beginObservation(latest._id, now())) return "waiting";
          await reconcile(run, latest, latest.workflowRunId ? await runtime.retrieve(binding, latest.workflowRunId) : { kind: "unknown" }, true);
          run = (await repository.getRun(runId))!;
          if (run.status === "blocked") return "blocked";
          // Reconciliation persists publication evidence. Admission must use that
          // refreshed record, not the callback-completed snapshot read above.
          latest = (await repository.getOperation(latest._id)) ?? undefined;
          if (!latest?.verifiedWorkflowId) return "waiting";
        }
        if (latest?.state === "succeeded" && run.progressOperationId !== latest._id) {
          await observeProgress(runId, latest);
          run = (await repository.getRun(runId))!;
          if (run.status === "blocked") return "blocked";
        }
        if (run.pauseRequested || run.status === "paused") return "waiting";
        const view = await context.getRunView(runId);
        if (!view || !view.nextNarrativeTask) return "waiting";
        let evaluationRole: "tester" | "judge" | null = null;
        if (view.nextNarrativeTask === "slice_complete") {
          if (!savedConfigurationSchema.parse(JSON.parse(run.configurationJson)).some((binding) => binding.role === "judge")) return "boundary";
          try {
            const completion = createExperimentCompletionService(deps.database, store());
            run = await completion.markGenerationComplete({ runId, expectedRevision: run.revision, nowMs: now() });
            const reports = view.reports ?? [];
            evaluationRole = !reports.some((item) => item.report.role === "tester" && item.matchesCurrentVersions) ? "tester" :
              !reports.some((item) => item.report.role === "judge" && item.matchesCurrentVersions) ? "judge" : null;
            if (!evaluationRole) {
              await completion.completeEvaluation({ runId, expectedRevision: run.revision, nowMs: now() });
              return "boundary";
            }
          } catch (error) {
            if (error instanceof ExperimentRepositoryError && error.code === "stale_revision") return "waiting";
            await repository.blockRun({ runId, category: "definite_failure", nowMs: now() });
            return "blocked";
          }
        }
        const latestSelection = latest?.role === "manager" && latest.state === "succeeded" ?
          (JSON.parse(latest.resultJson ?? "null") as { payload?: { taskId?: string; subjectId?: string } } | null)?.payload : null;
        const latestPageManager = view.nextNarrativeTask === "J13" && view.nextPageIllustrationWork?.kind === "image" &&
          latestSelection?.taskId === "J13" && latestSelection.subjectId === view.nextPageIllustrationWork.subjectId ? latest : null;
        if (view.nextNarrativeTask === "style_samples" || view.nextNarrativeTask === "sheet_image" || latestPageManager) {
          try {
            const prepared = latestPageManager ? await preparePageImage(run, view, latestPageManager) : view.nextNarrativeTask === "style_samples" ? await prepareStyleSample(run, view) : await prepareSheetImage(run, view);
            if (!prepared) return "advanced";
            operation = prepared.operation; parentWorkflowRunId = prepared.parentWorkflowRunId;
          } catch (error) {
            // Concurrent admission and Pause are re-observed rather than retried.
            const current = await repository.getRun(runId);
            if (error instanceof ExperimentRepositoryError && (error.code === "stale_revision" || current?.activeOperationId || current?.pauseRequested)) return "waiting";
            await repository.blockRun({ runId, category: "definite_failure", nowMs: now() });
            return "blocked";
          }
        } else {
        const history = await repository.listOperations(runId);
        const last = history.at(-1);
        const initialDelegation = run.persona !== "professional_creator" && history.length === 0;
        let role: "manager" | "specialist" | "tester" | "judge" = evaluationRole ?? (view.nextNarrativeTask === "tester" || initialDelegation ? "tester" : "manager");
        let taskId: SpecialistTask | null = null;
        let subjectKind: ExperimentOperationDocument["subjectKind"] = "book", subjectId = run.bookletId;
        if (!evaluationRole && !initialDelegation && view.nextNarrativeTask !== "tester" && last?.state === "succeeded" && last.role === "manager") {
          const result = JSON.parse(last.resultJson ?? "null") as { kind?: string; payload?: { taskId?: string; subjectKind?: string; subjectId?: string } } | null;
          const delegated = result?.payload?.taskId;
          const sheet = delegated === "J09" || delegated === "J10";
          const page = delegated === "J12";
          const target = view.currentArtifacts.find((item) => item.taskId === delegated && (!(sheet || page) || item.subjectKind === result?.payload?.subjectKind && item.subjectId === result?.payload?.subjectId));
          const pending = view.pendingDecision as { kind?: string; taskId?: string; subjectKind?: string; subjectId?: string; artifactVersionId?: string } | null;
          const matchingRevision = pending?.kind === "revision" && pending.taskId === delegated && pending.artifactVersionId === target?.currentVersionId &&
            (!page || (pending.subjectKind === "page" && pending.subjectId === result?.payload?.subjectId));
          // Both siblings can be ready. Honor the saved manager choice rather
          // than forcing the projection's deterministic display order.
          if (result?.kind === "delegate" && sheet && configuredReferenceSheetTasks(run.configurationJson).includes(delegated) &&
              result.payload?.subjectKind === (delegated === "J09" ? "character" : "location") && result.payload.subjectId &&
              (!pending || matchingRevision) && (!target || target.state === "needs_review" || matchingRevision)) {
            role = "specialist"; taskId = delegated; subjectKind = result.payload.subjectKind; subjectId = result.payload.subjectId; parentWorkflowRunId = last.workflowRunId;
          } else if (result?.kind === "delegate" && delegated === "J11" && configuredPaginationTask(run.configurationJson) &&
              view.nextNarrativeTask === "J11" && (!pending || matchingRevision) &&
              (!target || target.state === "needs_review" || matchingRevision)) {
            role = "specialist"; taskId = delegated; parentWorkflowRunId = last.workflowRunId;
          } else if (result?.kind === "delegate" && page && configuredPageBibleTask(run.configurationJson) &&
              view.nextNarrativeTask === "J12" && view.nextPageBibleWork && "taskId" in view.nextPageBibleWork &&
              result.payload?.subjectKind === "page" && result.payload.subjectId === view.nextPageBibleWork.subjectId &&
              (!pending || matchingRevision) && (!target || target.state === "needs_review" || matchingRevision)) {
            role = "specialist"; taskId = "J12"; subjectKind = "page"; subjectId = result.payload.subjectId!; parentWorkflowRunId = last.workflowRunId;
          } else if (result?.kind === "delegate" && isNarrativeTask(delegated) && configuredNarrativeTasks(run.configurationJson).includes(delegated) &&
              currentApprovedSourceIds(delegated, view.currentArtifacts) !== null && (!pending || matchingRevision) &&
              (!target || target.state === "needs_review" || matchingRevision)) {
            role = "specialist"; taskId = delegated; parentWorkflowRunId = last.workflowRunId;
          }
        }
        try {
          operation = await repository.prepareOperation({ runId, operationId: randomUUID(), expectedRevision: run.revision, role, taskId, subjectKind, subjectId, inputFingerprint: fingerprint({ revision: run.revision, role, taskId, subjectKind, subjectId, view }), attempt: 1, providerKind: "text", nowMs: now() });
        } catch (error) {
          const current = await repository.getRun(runId);
          if (error instanceof ExperimentRepositoryError && (error.code === "stale_revision" || current?.activeOperationId || current?.pauseRequested)) return "waiting";
          await repository.blockRun({ runId, category: "definite_failure", nowMs: now() });
          return "blocked";
        }
        }
      } else {
        // Before the marker a prepared specialist still needs its saved manager parent.
        if (operation.role === "specialist") {
          const history = await repository.listOperations(runId);
          parentWorkflowRunId = history.filter((item) => item.role === "manager" && item.state === "succeeded").at(-1)?.workflowRunId ?? null;
        } else if (operation.role === "image" && operation.taskId === "J13") {
          parentWorkflowRunId = operation.parentWorkflowRunId;
        } else if (operation.role === "image") {
          const imageTarget = operation.taskId === "J09" || operation.taskId === "J10" ?
            await deps.database.collections.artifacts.findOne({ experimentRunId: run._id, bookletId: run.bookletId, taskId: operation.taskId,
              subjectKind: operation.subjectKind, subjectId: operation.subjectId }) : null;
          const draft = await deps.database.collections.artifact_versions.findOne({ _id: imageTarget?.currentVersionId ?? operation.dependencyVersionIds[0] });
          parentWorkflowRunId = draft?.sourceOperationId ? (await repository.getOperation(draft.sourceOperationId))?.workflowRunId ?? null : null;
        }
      }
      const binding = bindingFor(operation, run);
      let referenceFileIds: string[] | undefined;
      if (operation.role === "image" && operation.taskId === "J13") {
        try {
          if (!parentWorkflowRunId) throw new ExperimentRepositoryError("conflict", "Page image manager parent is missing.");
          const active = await batches().listActive(runId);
          if (active.length !== 1) throw new ExperimentRepositoryError("conflict", "Page image requires one retained batch.");
          const currentRun = (await repository.getRun(runId))!;
          await batches().bind({ runId, jobId: active[0].jobId, operationId: operation._id, expectedRevision: currentRun.revision });
          const uploads = await createExperimentReferenceUploads({ database: deps.database, store: store(), upload: uploadReference })
            .prepare({ runId, operationId: operation._id, parentWorkflowRunId }, binding);
          if (uploads.kind !== "ready") {
            await repository.blockRun({ runId, category: uploads.kind === "unknown" ? "unknown_outcome" : "definite_failure", nowMs: now() });
            return "blocked";
          }
          if (uploads.fileIds.length) referenceFileIds = uploads.fileIds;
        } catch (error) {
          const current = await repository.getRun(runId);
          if (error instanceof ExperimentRepositoryError && (current?.pauseRequested || current?.status === "paused")) return "waiting";
          await repository.blockRun({ runId, category: "definite_failure", nowMs: now() });
          return "blocked";
        }
      }
      const admission = await repository.beginDispatch({ runId, operationId: operation._id, parentWorkflowRunId, nowMs: now() });
      if (!admission.dispatched) return "waiting";
      operation = admission.operation;
      const result = await runtime.start(binding, { runId, operationId: operation._id, parentWorkflowRunId, mode: "simulated",
        ...(referenceFileIds ? { referenceFileIds } : {}) }, {
        deadlineAtMs: operation.deadlineAtMs ?? operation.dispatchStartedAtMs! + 600_000,
        onStarted: async (execution) => {
          // Persist identity before returning to the dispatcher. Callback-first
          // claims remain valid only when both paths identify the same run.
          const identity = { runId, operationId: operation!._id, parentWorkflowRunId, nowMs: now(), workflowRunId: execution.id };
          try { await repository.recordDispatchIdentity(identity); }
          catch (error) {
            if (error instanceof ExperimentRepositoryError && error.code === "conflict") {
              await repository.blockRun({ runId, category: "definite_failure", nowMs: now() });
            }
            throw error;
          }
        },
        onTerminal: async (terminal) => {
          if (terminal.kind === "conflict") {
            await mutate(() => repository.blockRun({ runId, category: "definite_failure", nowMs: now() }));
          } else {
            // Wake observation; never accept a stream's outputs directly and
            // never create a replacement POST when the reader is lost.
            await repository.requestObservation(operation!._id);
          }
        },
      });
      if ((await repository.getRun(runId))?.safeFailure === "definite_failure") return "blocked";
      await reconcile(run, operation, result);
      return "advanced";
    });
  }

  async function cycle() {
    const runs = (await repository.listRuns()).reverse();
    async function unresolved(run: ExperimentRunDocument) {
      const operation = run.activeOperationId ? await repository.getOperation(run.activeOperationId) :
        (await repository.listOperations(run._id)).at(-1);
      return operation?.dispatchStartedAtMs != null &&
        (run.activeOperationId === operation._id || operation.state === "succeeded" && !operation.verifiedWorkflowId)
        ? operation : null;
    }
    // Reconcile retained workflow IDs before admitting another persona's POST.
    for (const run of runs) {
      const operation = await unresolved(run);
      if (!operation) continue;
      // Unresolved work retains the single-experiment lane even after expiry,
      // without an ID, or after a conflicting publication. Never admit a new
      // persona merely because the old observation deadline elapsed.
      if (run.status === "blocked" && run.safeFailure !== "unknown_outcome") return "waiting" as const;
      await advance(run._id);
      const currentRun = await repository.getRun(run._id);
      if (currentRun && await unresolved(currentRun)) return "waiting" as const;
    }
    for (const run of runs) {
      if (run.status === "completed" || run.status === "failed" || (run.status === "paused" && !run.activeOperationId)) continue;
      if (run.status === "blocked" && (run.safeFailure !== "unknown_outcome" || !run.activeOperationId)) continue;
      if (run.status === "blocked" && run.activeOperationId && !(await repository.getOperation(run.activeOperationId))?.workflowRunId) continue;
      if (run.status === "blocked" && run.activeOperationId) {
        const operation = await repository.getOperation(run.activeOperationId);
        if (operation && now() >= (operation.deadlineAtMs ?? (operation.dispatchStartedAtMs ?? now()) + 600_000)) continue;
      }
      const outcome = await advance(run._id);
      if (outcome === "advanced") return outcome;
    }
    return "idle" as const;
  }
  return { advance, cycle };
}
