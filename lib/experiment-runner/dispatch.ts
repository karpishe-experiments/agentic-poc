import { createHash, randomUUID } from "node:crypto";
import type { Database } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { approveAssembledDelegation } from "@/db/experiment-narrative";
import { measurePhase } from "@/lib/experiment-runner/diagnostics";
import { createExperimentRepository, ExperimentRepositoryError } from "@/db/experiment-repository";
import { createM4TextPreparation } from "@/db/experiment-text-preparation";
import { createM4ProviderResults } from "@/db/experiment-provider-results";
import { createExperimentCampaignLedger } from "@/db/experiment-campaign";
import { closeM4KnownFailure } from "@/db/experiment-provider-failure";
import { m4UnclaimedFailureDigest } from "@/db/experiment-unclaimed-failure";
import { verifyUndispatchedText } from "@/db/experiment-undispatched-text";
import { validateLegacyCountFailureProof } from "@/lib/experiment-runner/m4-legacy-count-failure";
import { m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { createExperimentStyleAssembly } from "@/db/experiment-style";
import { createExperimentSheetAssembly } from "@/db/experiment-sheets";
import type { AssetStore } from "@/lib/assets/asset-store";
import { createAssetStore } from "@/lib/assets/create-asset-store";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { styleSampleRequests, referenceSheetRequest } from "@/lib/experiment-runner/reference-requests";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { configurationSnapshot, selectBinding, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { createWorkflowRuntime, runtimeCompletion, runtimeImageCompletion, type RuntimeResult, type WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { bindTrackedMutationOperation, runTrackedMutation } from "@/lib/application/deployment-control";
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
import { createVerificationAttempt } from "@/lib/experiment-runner/verification-attempt";
import { createOperationCoordinator } from "@/lib/experiment-runner/lifecycle";
import { isCompletionRecoveryRole } from "@/lib/operations/operation-recovery-outcome";
import { OPERATION_LIMIT_MS, RECONCILIATION_RESERVE_MS, OperationBudgetExpired, operationSignal, operationBudgetRemainingMs, remainingOperationMs, withOperationBudget, withCleanupBudget } from "@/lib/operations/budget";
import { CompletionReconciliationError, safeFailure } from "@/lib/operations/completion-failure";
import { cancelOwnedControllers, withOwnedController } from "@/lib/operations/controllers";
import { buildFailureDiagnostics } from "@/lib/experiment-runner/failure-diagnostics";

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
function fingerprint(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
// Selection uses attempt and outcome metadata. Exact request bytes are fetched
// only for a retained candidate that will be compared or assembled.
const imageAttemptProjection = { _id: 1, role: 1, taskId: 1, subjectKind: 1, subjectId: 1,
  parentWorkflowRunId: 1, inputFingerprint: 1, state: 1, safeFailure: 1,
  reservationCount: 1, verifiedWorkflowId: 1, workflowRunId: 1, attempt: 1 };

export function createExperimentDispatcher(deps: {
  database: Database; config: BookletRunnerConfig; runtime?: WorkflowRuntime;
  mutate?: typeof runTrackedMutation; now?: () => number;
  store?: () => AssetStore;
  uploadReference?: (binding: ReturnType<typeof selectBinding>, runId: string, bytes: Uint8Array) => Promise<ReferenceUploadResult>;
}) {
  const store = deps.store ?? createAssetStore;
  const authority = deps.config.m4?.state === "granted" ? deps.config.m4.authority : undefined;
  const repository = createExperimentRepository(deps.database, { store,
    ...(authority ? { m4Authority: authority, m4ExecutionEnabled: true as const } : {}) });
  const context = createExperimentContextService(deps.database, { store });
  const rawRuntime = deps.runtime ?? createWorkflowRuntime(deps.config);
  const mutate = deps.mutate ?? runTrackedMutation;
  const now = deps.now ?? Date.now;
  async function exactImageRequestMatches(runId: string, operation: ExperimentOperationDocument, request: unknown) {
    const saved = await deps.database.collections.experiment_operations.findOne({ _id: operation._id, runId,
      state: "succeeded", inputFingerprint: operation.inputFingerprint, verifiedWorkflowId: operation.verifiedWorkflowId,
      workflowRunId: operation.workflowRunId }, { projection: { _id: 1, imageRequestJson: 1 } });
    return !!saved && canonical(JSON.parse(saved.imageRequestJson ?? "null")) === canonical(request);
  }
  const runtime: WorkflowRuntime = {
    ...rawRuntime,
    start: (binding, input, options) => rawRuntime.start(binding, input, { ...options, signal: operationSignal() ?? options?.signal }),
    retrieve: (binding, workflowRunId, options) => rawRuntime.retrieve(binding, workflowRunId, {
      ...options, signal: operationSignal() ?? options?.signal,
      deadlineAtMs: Math.min(options?.deadlineAtMs ?? Infinity, now() + remainingOperationMs()),
    }),
  };
  const ownerId = randomUUID();
  const activeAdvances = new Set<string>();
  const uploadReference = deps.uploadReference ?? createReferenceTransport(deps.config).upload;
  const batches = () => createExperimentPageBatchRepository({ database: deps.database, store: store(), now });
  const bindingFor = (operation: ExperimentOperationDocument, run: ExperimentRunDocument) => selectBinding(deps.config,
    operation.role, operation.taskId as SpecialistTask | null, run.persona);
  const assemblyFailures = new WeakMap<object, { startedAt: number; operationId: string }>();
  const assemblyDiagnostic = (error: unknown) => {
    const origin = error && typeof error === "object" ? assemblyFailures.get(error) : undefined;
    return origin ? buildFailureDiagnostics(error, { ...origin, phase: "page_assembly", timestampMs: now() }) : undefined;
  };

  async function retrieveOperation(run: ExperimentRunDocument, operation: ExperimentOperationDocument) {
    return measurePhase({ runId: run._id, operationId: operation._id }, "publication_readback", () =>
      runtime.retrieve(bindingFor(operation, run), operation.workflowRunId!));
  }

  async function assemblePage(runId: string, pageId: string, imageOperationId: string) {
    const startedAt = performance.now();
    try {
    // An assembly is immutable and unique to this provider operation. Current
    // approval and final acceptance still verify its sources and original bytes.
    const saved = await deps.database.collections.artifact_versions.findOne({ sourceOperationId: imageOperationId, createdBy: "application" });
    const owner = saved ? await deps.database.collections.artifacts.findOne({ _id: saved.artifactId,
      experimentRunId: runId, taskId: "J13", subjectId: pageId, currentVersionId: saved._id }) : null;
    const assembled = owner && saved ? { version: saved } : await measurePhase({ runId, operationId: imageOperationId }, "page_assembly", () =>
      createExperimentPageIllustrationAssembly({ database: deps.database, store: store(), now }).assemble({ runId, pageId, imageOperationId }));
    await measurePhase({ runId, operationId: imageOperationId }, "delegated_approval", () =>
      approveAssembledDelegation(deps.database, runId, assembled.version._id, now(), store));
    return assembled;
    } catch (error) {
      if (error && typeof error === "object") assemblyFailures.set(error, { startedAt, operationId: imageOperationId });
      throw error;
    }
  }

  const prepareOperation = (input: { runId: string; operationId: string } & Record<string, unknown>) =>
    measurePhase(input, "operation_preparation", () => repository.prepareOperation(input));

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
      const attempt = createVerificationAttempt(assetStore);
      // Selection needs current lineage. prepareOperation performs the complete
      // independent byte check before it admits the selected operation.
      const selected = await verifyCurrentPageIllustrationSources(deps.database, session, run, work.subjectId, assetStore, { attempt, verifyBytes: false });
      for (const page of selected.layout.pages) {
        if (page.pageId !== work.subjectId) await verifyCurrentPageIllustrationSources(deps.database, session, run, page.pageId, assetStore, { attempt, verifyBytes: false });
      }
      return selected;
    });
    const request = sources.request.request;
    const inputFingerprint = imageRequestFingerprint(request);
    const history = await deps.database.collections.experiment_operations.find({ runId: run._id, role: "image", taskId: "J13", subjectId: work.subjectId },
      { projection: imageAttemptProjection }).sort({ createdAtMs: 1, _id: 1 }).toArray();
    const matches = history.filter((item) => item.role === "image" && item.taskId === "J13" && item.subjectKind === "page" &&
      item.subjectId === work.subjectId && item.parentWorkflowRunId === manager.workflowRunId && item.inputFingerprint === inputFingerprint);
    const executable = matches.filter((item) => !(item.state === "failed" && item.safeFailure === null &&
      item.reservationCount === 0 && item.verifiedWorkflowId && item.workflowRunId));
    if (executable.length) {
      if (executable.length !== 1 || executable[0].state !== "succeeded" || !executable[0].verifiedWorkflowId) {
        throw new ExperimentRepositoryError("conflict", "Existing page-image outcome requires reconciliation.");
      }
      await assemblePage(run._id, work.subjectId, executable[0]._id);
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
    return { operation: await prepareOperation({ runId: run._id, operationId: randomUUID(), expectedRevision: run.revision,
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
    const history = await deps.database.collections.experiment_operations.find({ runId: run._id, role: "image", taskId: work.target.taskId, subjectId: work.target.subjectId, inputFingerprint },
      { projection: imageAttemptProjection }).sort({ createdAtMs: 1, _id: 1 }).toArray();
    const matches = history.filter((item) => item.role === "image" && item.taskId === work.target.taskId &&
      item.subjectKind === work.target.subjectKind && item.subjectId === work.target.subjectId && item.inputFingerprint === inputFingerprint);
    const executable = matches.filter((item) => !(item.state === "failed" && item.safeFailure === null &&
      item.reservationCount === 0 && item.verifiedWorkflowId && item.workflowRunId));
    if (executable.length > 1 || executable.some((item) => item.state !== "succeeded" || !item.verifiedWorkflowId) ||
        executable.length === 1 && !await exactImageRequestMatches(run._id, executable[0], request)) throw new ExperimentRepositoryError("conflict", "Saved sheet image requires reconciliation.");
    if (executable.length === 1) {
      const assembled = await createExperimentSheetAssembly({ database: deps.database, store: store(), now }).assemble({
        runId: run._id, draftSheetVersionId: draft.id, imageOperationId: executable[0]._id,
      });
      await approveAssembledDelegation(deps.database, run._id, assembled.version._id, now(), store);
      return null;
    }
    return { operation: await prepareOperation({ runId: run._id, operationId: randomUUID(), expectedRevision: run.revision,
      role: "image", taskId: work.target.taskId, subjectKind: work.target.subjectKind, subjectId: work.target.subjectId,
      inputFingerprint, attempt: Math.max(0, ...matches.map((item) => item.attempt)) + 1, providerKind: "image", imageRequest: request, nowMs: now() }),
      parentWorkflowRunId: draft.sourceOperationId ? (await repository.getOperation(draft.sourceOperationId))?.workflowRunId ?? null : null };
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
    const history = await deps.database.collections.experiment_operations.find({ runId: run._id, role: "image", taskId: "J08", subjectId: run.bookletId },
      { projection: imageAttemptProjection }).sort({ createdAtMs: 1, _id: 1 }).toArray();
    const savedIds: string[] = [];
    for (const slot of slots) {
      const inputFingerprint = imageRequestFingerprint(slot.request);
      const matches = history.filter((item) => item.role === "image" && item.taskId === "J08" &&
        item.subjectKind === "book" && item.subjectId === run.bookletId && item.inputFingerprint === inputFingerprint);
      const executable = matches.filter((item) => !(item.state === "failed" && item.safeFailure === null &&
        item.reservationCount === 0 && item.verifiedWorkflowId && item.workflowRunId));
      // An existing uncertain/failed attempt is not permission to generate again.
      if (executable.length > 1 || executable.some((item) => item.state !== "succeeded" || !item.verifiedWorkflowId) ||
          executable.length === 1 && !await exactImageRequestMatches(run._id, executable[0], slot.request)) {
        throw new ExperimentRepositoryError("conflict", "Saved style sample requires reconciliation.");
      }
      if (executable.length === 1) { savedIds.push(executable[0]._id); continue; }
      return { operation: await prepareOperation({ runId: run._id, operationId: randomUUID(),
        expectedRevision: run.revision, role: "image", taskId: "J08", subjectKind: "book", subjectId: run.bookletId,
        inputFingerprint, attempt: Math.max(0, ...matches.map((item) => item.attempt)) + 1, providerKind: "image", imageRequest: slot.request, nowMs: now() }),
        parentWorkflowRunId: draft.sourceOperationId ? (await repository.getOperation(draft.sourceOperationId))?.workflowRunId ?? null : null };
    }
    const assembled = await createExperimentStyleAssembly({ database: deps.database, store: store(), now }).assemble({
      runId: run._id, draftStyleVersionId: draft.id, sampleOperationIds: savedIds,
    });
    await approveAssembledDelegation(deps.database, run._id, assembled.version._id, now(), store);
    return null;
  }

  async function observeProgress(runId: string, operation: ExperimentOperationDocument) {
    const startedAt = performance.now();
    try {
    if (operation.state !== "succeeded" || (await repository.getRun(runId))?.progressOperationId === operation._id) return;
    const view = await measurePhase({ runId, operationId: operation._id }, "progress_context", () => context.getExecutionView(runId));
    if (!view) return;
    // Keep persisted progress hashes compatible with earlier releases without
    // loading historical content into the scheduling view.
    const versions = await deps.database.collections.artifact_versions.find({ artifactId: { $in: view.currentArtifacts.map((item) => item.id) } },
      { projection: { _id: 1, artifactId: 1, versionNumber: 1 } }).sort({ versionNumber: 1 }).toArray();
    const approvals = await deps.database.collections.approvals.find({ experimentRunId: runId,
      artifactVersionId: { $in: versions.map((item) => item._id) } }, { projection: { _id: 1, artifactVersionId: 1 } }).toArray();
    const approvalByVersion = new Map(approvals.map((item) => [item.artifactVersionId, item._id]));
    const images = (await deps.database.collections.experiment_operations.find({ runId, role: "image", state: "succeeded" }, { projection: { _id: 1, resultJson: 1 } })
      .sort({ createdAtMs: 1, _id: 1 }).toArray()).filter((item) =>
      typeof (JSON.parse(item.resultJson ?? "null") as { assetId?: unknown } | null)?.assetId === "string").map((item) => item._id);
    await repository.recordProgress({ runId, operationId: operation._id, nowMs: now(), fingerprint64: fingerprint({
      artifacts: view.currentArtifacts.map(({ id, state, currentVersionId }) => ({ id, state, currentVersionId,
        approvals: versions.filter((version) => version.artifactId === id).map((version) => approvalByVersion.get(version._id) ?? null) })),
      delegation: view.activeDelegation?.id ?? null, pending: view.pendingDecision, messages: view.creatorMessages.map((message) => message.id),
      ...(images.length ? { images } : {}),
    }) });
    } catch (error) { throw new CompletionReconciliationError(error, "completion_progress", startedAt, "committed"); }
  }

  async function reconcile(run: ExperimentRunDocument, operation: ExperimentOperationDocument, result: RuntimeResult, observed = false) {
    return measurePhase({ runId: run._id, operationId: operation._id }, "completion_reconciliation", () =>
      reconcileWork(run, operation, result, observed));
  }

  async function reconcileWork(run: ExperimentRunDocument, operation: ExperimentOperationDocument, result: RuntimeResult, observed: boolean) {
    const identity = { runId: run._id, operationId: operation._id, parentWorkflowRunId: operation.parentWorkflowRunId, nowMs: now() };
    const current = await repository.getOperation(operation._id);
    if (!current) return;
    const binding = bindingFor(operation, run);
    if (result.kind === "conflict") {
      await repository.blockRun({ runId: run._id, category: "definite_failure", nowMs: now() });
      return;
    }
    if (current.m4Continuation && current.reservationCount === 0) {
      if (current.m4Continuation.kind === "undispatched_text_v1") {
        const digest = authority ? await withMongoTransaction(deps.database, session =>
          verifyUndispatchedText(deps.database, session, authority, run, current._id)) : null;
        if (!digest || digest !== current.m4Continuation.evidenceDigest ||
            current.m4Continuation.requestDigest !== (current.m4Preparation?.requestDigest ?? null) || result.kind === "execution") {
          await repository.blockRun({ runId: run._id, category: "definite_failure", nowMs: now() });
        }
        return;
      }
      const digest = authority ? m4UnclaimedFailureDigest(authority, run, current) : null;
      if (!digest || digest !== current.m4Continuation.evidenceDigest ||
          current.m4Continuation.requestDigest !== current.m4Preparation?.requestDigest ||
          result.kind === "execution" && (result.execution.id !== current.workflowRunId ||
            result.execution.workflow_id !== current.verifiedWorkflowId || result.execution.status !== "failed")) {
        await repository.blockRun({ runId: run._id, category: "definite_failure", nowMs: now() });
      }
      // A matching terminal read or unavailable lookup cannot replay or reopen
      // an inspected unclaimed failure, and there is no provider wrapper.
      return;
    }
    if (current.m4Continuation && current.m4PreGenerationRecovery) {
      if (!authority || !validateLegacyCountFailureProof(m4PolicySnapshot(authority.policy).policy, run, current) ||
          current.m4Continuation.evidenceDigest !== current.m4PreGenerationRecovery.proofDigest ||
          current.m4Continuation.requestDigest !== current.m4Preparation?.requestDigest ||
          result.kind === "execution" && (result.execution.id !== current.workflowRunId || result.execution.workflow_id !== current.verifiedWorkflowId ||
            result.execution.status !== "failed" || result.execution.legacyCountFailure?.code !== "legacy_input_count_guard" ||
            result.execution.legacyCountFailure.totalTokens !== 0 || result.execution.outputs && Object.keys(result.execution.outputs).length > 0 ||
            current.workflowTaskId && result.execution.task_id && current.workflowTaskId !== result.execution.task_id)) {
        await repository.blockRun({ runId: run._id, category: "definite_failure", nowMs: now() });
      }
      return;
    }
    if (current.m4Continuation && result.kind === "execution" && (result.execution.id !== current.workflowRunId ||
        result.execution.workflow_id !== current.verifiedWorkflowId || result.execution.status !== current.m4Observation?.remoteStatus ||
        typeof result.execution.outputs?.booklet_provider_result !== "string" ||
        createHash("sha256").update(result.execution.outputs.booklet_provider_result).digest("hex") !== current.m4Observation.wrapperDigest)) {
      await repository.blockRun({ runId: run._id, category: "definite_failure", nowMs: now() });
      return;
    }
    // A failed lookup cannot reopen a previously proved terminal failure.
    // Revalidate its retained evidence before handling observation uncertainty.
    if (authority && run.mode === "balanced" && current.providerKind === "text" && current.state === "failed" &&
        await closeM4KnownFailure(deps.database, authority, { runId: run._id, operationId: current._id, nowMs: now() }) === "closed") return;
    if (result.kind === "accepted") {
      await repository.recordDispatchIdentity({ ...identity, workflowRunId: result.execution.id, ...(result.execution.task_id ? { workflowTaskId: result.execution.task_id } : {}) });
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
      await repository.recordDispatchIdentity({ ...identity, workflowRunId: execution.id, ...(execution.task_id ? { workflowTaskId: execution.task_id } : {}) });
      if (run.mode === "balanced" && operation.providerKind === "text" && current.reservationCount === 1) {
        if (!authority) return;
        if (current.state === "succeeded" && current.verifiedWorkflowId) {
          if (execution.status === "succeeded") await observeProgress(run._id, current);
          else if (execution.status === "failed" || execution.status === "stopped") {
            await withMongoTransaction(deps.database, (session) => createExperimentCampaignLedger(deps.database, authority).stop(session, now()));
            await repository.recordTerminalConflict({ ...identity, workflowRunId: execution.id,
              workflowId: execution.workflow_id, status: execution.status });
          }
          return;
        }
        // Only a runtime GET is authoritative. Reuse this request's authenticated
        // snapshot; stream notifications must trigger their own original lookup.
        const observationRuntime = observed ? { ...runtime, retrieve: async () => result } : runtime;
        let outcome: Awaited<ReturnType<ReturnType<typeof createM4ProviderResults>["observe"]>>;
        const observationStartedAt = performance.now();
        try {
          outcome = await createM4ProviderResults(deps.database, authority, deps.config, observationRuntime)
            .observe({ runId: run._id, operationId: current._id, nowMs: now() });
        } catch (error) {
          throw new CompletionReconciliationError(error, "completion_readback", observationStartedAt, "unknown");
        }
        if (outcome.kind === "result") {
          const completion = { envelope: { runId: run._id, operationId: current._id,
            workflowRunId: execution.id, inputFingerprint: current.inputFingerprint, result: outcome.result },
            parentWorkflowRunId: current.parentWorkflowRunId, nowMs: now() };
          const startedAt = performance.now();
          let completed: ExperimentOperationDocument;
          try {
            completed = (await repository.completeOperation(completion)).operation;
          } catch (error) {
            let retained: Awaited<ReturnType<typeof repository.inspectCompletion>> | undefined;
            try { retained = await withCleanupBudget(() => repository.inspectCompletion(completion)); }
            catch { /* The original failure remains authoritative; unreadable state is uncertain. */ }
            if (retained?.kind === "saved") completed = retained.operation;
            else {
              // Only an explicit rejected result is definite. Database failures,
              // ownership conflicts and lost commit replies require observation.
              if (retained?.kind === "pending") {
                const category = error instanceof ExperimentRepositoryError && ["invalid_result", "invalid_input"].includes(error.code)
                  ? "definite_failure" : "unknown_outcome";
                try { await withCleanupBudget(() => repository.blockCompletionFailure(completion, category)); }
                catch { /* Do not replace the original validation error with a secondary write failure. */ }
              }
              throw new CompletionReconciliationError(error, "completion_transaction", startedAt, retained?.kind === "pending" ? "uncommitted" : "unknown");
            }
          }
          await observeProgress(run._id, completed);
        } else if (outcome.kind === "blocked" && run.generationCompletedAtMs != null) {
          const retained = await repository.getRun(run._id);
          if (retained?.safeFailure === "definite_failure" && !retained.activeOperationId && !retained.preparation) {
            await createExperimentCompletionService(deps.database, store()).completeAdvisoryFailure({ runId: retained._id,
              expectedRevision: retained.revision, nowMs: now() });
          }
        } else if (outcome.kind === "pending" && now() >= (current.deadlineAtMs ?? Infinity)) {
          await repository.recordDispatchOutcome({ ...identity, category: "unknown_outcome" });
        }
        return;
      }
      await deps.database.collections.experiment_operations.updateOne({ _id: operation._id, workflowRunId: execution.id,
        remoteStatus: { $ne: execution.status }, authorizationClaim: null, imageCompletionClaim: null, resultFinalizationClaim: null },
      { $set: { remoteStatus: execution.status } });
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
          if (now() >= (current.deadlineAtMs ?? (current.dispatchStartedAtMs ?? now()) + OPERATION_LIMIT_MS)) {
            if (current.state === "succeeded") await repository.blockRun({ runId: run._id, category: "unknown_outcome", nowMs: now() });
            else await repository.recordDispatchOutcome({ ...identity, category: "unknown_outcome" });
          }
          return;
        }
        if ((execution.status === "failed" || execution.status === "stopped") && current.state !== "succeeded") {
          await repository.recordDispatchOutcome({ ...identity, category: execution.status === "stopped" ? "observed_stop" : "observed_failure" });
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
      if (execution.status === "succeeded" || observed && run.mode === "simulated" && run.generationCompletedAtMs != null &&
          ["tester", "judge"].includes(operation.role) && execution.status === "failed") {
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
          await repository.recordDispatchOutcome({ ...identity, category: execution.status === "stopped" ? "observed_stop" : "observed_failure" });
          const retained = await repository.getRun(run._id);
          if (retained?.generationCompletedAtMs != null && retained.safeFailure === "definite_failure" && !retained.activeOperationId && !retained.preparation) {
            await createExperimentCompletionService(deps.database, store()).completeAdvisoryFailure({ runId: retained._id,
              expectedRevision: retained.revision, nowMs: now() });
          }
        } else if (execution.status !== "running" || now() >= (current.deadlineAtMs ?? (current.dispatchStartedAtMs ?? now()) + OPERATION_LIMIT_MS)) {
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
        await assemblePage(run._id, saved.subjectId, saved._id);
      } catch (error) {
        // The provider result is known and retained. A materialization failure
        // is not permission to create a new manager/image operation.
        await repository.blockRun({ runId: run._id, category: "definite_failure", nowMs: now(), failureDiagnostics: assemblyDiagnostic(error) });
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

  const coordinator = createOperationCoordinator({ database: deps.database, runtime, now, binding: bindingFor,
    resolvedFailure: async (run, operation) => {
      if (!authority || run.mode !== "balanced" || operation.state !== "failed") return false;
      const local = operation.localPreparationCancellation ??
        (operation.m4Continuation?.kind === "undispatched_text_v1" ? operation.m4Continuation : null);
      if (local) return await withMongoTransaction(deps.database, session =>
        verifyUndispatchedText(deps.database, session, authority, run, operation._id)) === local.evidenceDigest;
      return await closeM4KnownFailure(deps.database, authority, { runId: run._id, operationId: operation._id, nowMs: now() }) === "closed";
    },
    reconcile: (run, operation, result) => reconcile(run, operation, result, true) });

  async function advanceWork(runId: string): Promise<"advanced" | "waiting" | "boundary" | "blocked"> {
    return mutate(async () => {
      let run = await repository.getRun(runId);
      if (!run || run.mode === "real" || run.mode === "balanced" && (!authority || run.m4?.campaignId !== authority.grant.campaignId) ||
          run.status === "completed" || run.status === "failed") return "blocked";
      if (run.generationCompletedAtMs != null && !run.activeOperationId && run.status === "blocked" && run.safeFailure === "definite_failure") {
        try {
          await createExperimentCompletionService(deps.database, store()).completeAdvisoryFailure({ runId, expectedRevision: run.revision, nowMs: now() });
          return "boundary";
        } catch (error) {
          if (error instanceof ExperimentRepositoryError && error.code === "invalid_state") return "blocked";
          throw error;
        }
      }
      let snapshot: Awaited<ReturnType<typeof context.getExecutionView>> | undefined;
      let snapshotRevision = -1;
      const viewForRun = async () => {
        if (snapshotRevision !== run!.revision || snapshot === undefined) {
          snapshot = await context.getExecutionView(runId); snapshotRevision = snapshot?.revision ?? -1;
        }
        return snapshot;
      };
      if (!run.activeOperationId && run.status !== "blocked") {
        const last = await repository.latestOperation(runId);
        if (last?.role === "image" && last.taskId === "J13" && last.state === "succeeded" && last.verifiedWorkflowId && last.imageCompletionDigest) {
          const startedAt = performance.now();
          try {
            await assemblePage(runId, last.subjectId, last._id);
            for (const batch of await batches().listActive(runId)) {
              if (batch.items.some((item) => item.operationId === last._id)) await batches().reconcile({ runId, jobId: batch.jobId });
            }
            run = (await repository.getRun(runId))!;
          } catch (error) {
            await repository.blockRun({ runId, category: "definite_failure", nowMs: now(),
              failureDiagnostics: buildFailureDiagnostics(error, { phase: "page_assembly", operationId: last._id, startedAt, timestampMs: now() }) });
            return "blocked";
          }
        }
      }
      // Completed slice evidence remains complete after a newer suite is bound.
      // This is a saved-state read, not permission to execute an old publication.
      if (!run.activeOperationId && run.status !== "blocked") {
        const savedView = await viewForRun();
        if (savedView?.nextNarrativeTask === "slice_complete") {
          const last = await repository.latestOperation(runId);
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
      if (operation) await bindTrackedMutationOperation(runId, operation._id);
      if (operation?.dispatchStartedAtMs != null) {
        // A retained ID is the only read-back path. Never POST after the marker.
        if (operation.workflowRunId) {
          if (!await repository.beginObservation(operation._id, now())) return "waiting";
          await reconcile(run, operation, await retrieveOperation(run, operation), true);
        } else {
          await reconcile(run, operation, { kind: "unknown" });
        }
        return "waiting";
      }
      if (operation && (run.pauseRequested || run.status === "paused")) return "waiting";
      if (run.status === "blocked" && (operation || run.safeFailure !== "unknown_outcome")) return "blocked";
      let parentWorkflowRunId: string | null = null;
      if (!operation) {
        if (run.mode === "balanced") {
          const campaign = await deps.database.collections.experiment_campaigns.findOne({ _id: run.m4!.campaignId });
          if (campaign?.state !== "active") return "blocked";
        }
        const deployment = await deps.database.collections.deployment_control.findOne({ environment: process.env.DEPLOYMENT_ENV ?? "local" });
        let latest = await repository.latestOperation(runId);
        if (latest?.state === "succeeded" && !latest.verifiedWorkflowId) {
          if (latest.workflowRunId && !await repository.beginObservation(latest._id, now())) return "waiting";
          await reconcile(run, latest, latest.workflowRunId ? await retrieveOperation(run, latest) : { kind: "unknown" }, true);
          run = (await repository.getRun(runId))!;
          if (run.status === "blocked") return "blocked";
          // Reconciliation persists publication evidence. Admission must use that
          // refreshed record, not the callback-completed snapshot read above.
          latest = await repository.getOperation(latest._id);
          if (!latest?.verifiedWorkflowId) return "waiting";
        }
        // A callback can clear activeOperationId before publication readback.
        // Drain blocks new work, not reconciliation of that admitted execution.
        if (deployment?.draining || deployment?.maintenance) return "waiting";
        if (latest?.state === "succeeded" && run.progressOperationId !== latest._id) {
          await observeProgress(runId, latest);
          run = (await repository.getRun(runId))!;
          if (run.status === "blocked") return "blocked";
        }
        if (run.pauseRequested || run.status === "paused") return "waiting";
        const view = await viewForRun();
        if (!view || !view.nextNarrativeTask) return "waiting";
        let evaluationRole: "tester" | "judge" | null = null;
        if (view.nextNarrativeTask === "slice_complete") {
          if (!savedConfigurationSchema.parse(JSON.parse(run.configurationJson)).some((binding) => binding.role === "judge")) return "boundary";
          const startedAt = performance.now();
          let phase: "generation_verification" | "evaluation_completion" = "generation_verification";
          try {
            const completion = createExperimentCompletionService(deps.database, store());
            run = await completion.markGenerationComplete({ runId, expectedRevision: run.revision, nowMs: now() });
            const reports = view.reports ?? [];
            evaluationRole = !reports.some((item) => item.report.role === "tester" && item.matchesCurrentVersions) ? "tester" :
              !reports.some((item) => item.report.role === "judge" && item.matchesCurrentVersions) ? "judge" : null;
            if (!evaluationRole) {
              phase = "evaluation_completion";
              await completion.completeEvaluation({ runId, expectedRevision: run.revision, nowMs: now() });
              return "boundary";
            }
          } catch (error) {
            if (error instanceof ExperimentRepositoryError && error.code === "stale_revision") return "waiting";
            await repository.blockRun({ runId, category: "definite_failure", nowMs: now(),
              failureDiagnostics: buildFailureDiagnostics(error, { phase, operationId: latest?._id, startedAt, timestampMs: now() }) });
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
            await repository.blockRun({ runId, category: "definite_failure", nowMs: now(), failureDiagnostics: assemblyDiagnostic(error) });
            return "blocked";
          }
        } else {
        const last = latest;
        const initialDelegation = run.persona !== "professional_creator" && !last;
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
          operation = await prepareOperation({ runId, operationId: randomUUID(), expectedRevision: run.revision, role, taskId, subjectKind, subjectId, inputFingerprint: fingerprint({ revision: run.revision, role, taskId, subjectKind, subjectId, view }), attempt: 1, providerKind: "text", nowMs: now() });
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
          parentWorkflowRunId = (await repository.latestOperation(runId, { role: "manager", state: "succeeded" }))?.workflowRunId ?? null;
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
          const uploads = await measurePhase({ runId, operationId: operation._id }, "reference_preparation", () =>
            createExperimentReferenceUploads({ database: deps.database, store: store(), upload: uploadReference })
              .prepare({ runId, operationId: operation!._id, parentWorkflowRunId }, binding));
          if (uploads.kind !== "ready") {
            await repository.failPreparation(runId, operation._id, now());
            return "blocked";
          }
          if (uploads.fileIds.length) referenceFileIds = uploads.fileIds;
        } catch (error) {
          const current = await repository.getRun(runId);
          if (error instanceof ExperimentRepositoryError && (current?.pauseRequested || current?.status === "paused")) return "waiting";
          await repository.failPreparation(runId, operation._id, now());
          return "blocked";
        }
      }
      await bindTrackedMutationOperation(runId, operation._id);
      if (run.mode === "balanced" && operation.providerKind === "text") {
        if (!authority) return "blocked";
        await measurePhase({ runId, operationId: operation._id }, "text_preparation", () =>
          createM4TextPreparation(deps.database, authority, { store }).prepare({ runId, operationId: operation!._id, nowMs: now() }));
      }
      const admission = await measurePhase({ runId, operationId: operation._id }, "dispatch_admission", () =>
        repository.beginDispatch({ runId, operationId: operation!._id, parentWorkflowRunId, nowMs: now() }));
      if (!admission.dispatched) return "waiting";
      operation = admission.operation;
      const result = await runtime.start(binding, { runId, operationId: operation._id, parentWorkflowRunId, mode: run.mode === "balanced" ? "balanced" : "simulated",
        ...(referenceFileIds ? { referenceFileIds } : {}) }, {
        deadlineAtMs: (operation.deadlineAtMs ?? operation.dispatchStartedAtMs! + OPERATION_LIMIT_MS) - RECONCILIATION_RESERVE_MS,
        onStarted: async (execution) => {
          // Persist identity before returning to the dispatcher. Callback-first
          // claims remain valid only when both paths identify the same run.
          const identity = { runId, operationId: operation!._id, parentWorkflowRunId, nowMs: now(), workflowRunId: execution.id,
            ...(execution.task_id ? { workflowTaskId: execution.task_id } : {}) };
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
    }, { admitted: true, runId });
  }

  async function finalizeLocalReportFailure(runId: string): Promise<"boundary" | "blocked"> {
    const retained = await repository.getRun(runId);
    if (!retained || retained.generationCompletedAtMs == null || retained.activeOperationId || retained.preparation) return "blocked";
    try {
      await withOperationBudget(now() + OPERATION_LIMIT_MS, () => mutate(() =>
        createExperimentCompletionService(deps.database, store()).completeAdvisoryFailure({
          runId, expectedRevision: retained.revision, nowMs: now(),
        }), { admitted: true, runId }), { now });
      return "boundary";
    } catch (error) {
      if (error instanceof ExperimentRepositoryError && error.code === "invalid_state") return "blocked";
      throw error;
    }
  }

  async function advanceOwned(runId: string): Promise<"advanced" | "waiting" | "boundary" | "blocked"> {
    let run = await repository.getRun(runId);
    if (!run) return "blocked";
    const operation = run.activeOperationId ? await repository.getOperation(run.activeOperationId) : null;
    if (run.status === "completed" || run.status === "failed") {
      // A lost bookkeeping acknowledgement cannot undo terminal business state.
      // Clear only a stale, non-uncertain preparation after terminal evidence
      // proves no operation can still own it. Leave unsupported residue visible.
      if (run.status === "completed" && !operation && run.preparation && !run.preparation.unresolved &&
          !run.preparation.stopRequestedAtMs && now() >= run.preparation.deadlineAtMs) {
        try { await withCleanupBudget(() => withMongoTransaction(deps.database, async session => {
          const saved = await deps.database.collections.experiment_runs.findOne({ _id: runId, revision: run!.revision,
            status: "completed", activeOperationId: null, evaluationStatus: "complete",
            "preparation.ownerId": run!.preparation!.ownerId }, { session });
          if (!saved?.generationCompletedAtMs || saved.safeFailure || saved.preparation?.unresolved || saved.preparation?.stopRequestedAtMs) return;
          const unfinished = await deps.database.collections.experiment_operations.findOne({ runId, $or: [
            { state: { $nin: ["succeeded", "failed"] } }, { "lifecycle.unresolved": true },
            { state: "failed", "lifecycle.unresolved": { $ne: false } },
            { state: "succeeded", $or: [{ verifiedWorkflowId: null }, { resultJson: null }, { materializationJson: null }] },
            ...["authorizationClaim", "resultFinalizationClaim", "imageCompletionClaim"].map(key => ({ [key]: { $exists: true, $ne: null } })),
          ] }, { session, projection: { _id: 1 } });
          if (!unfinished) await deps.database.collections.experiment_runs.updateOne({ _id: runId, revision: saved.revision,
            status: "completed", activeOperationId: null, "preparation.ownerId": saved.preparation!.ownerId },
          { $set: { preparation: null }, $inc: { revision: 1 } }, { session });
        })); } catch (error) {
          console.info(JSON.stringify({ event: "booklet_preparation_cleanup", runId, preparationId: run.preparation.ownerId,
            cleanupOutcome: "unresolved", ...safeFailure(error) }));
        }
      }
      return run.status === "completed" ? "boundary" : "blocked";
    }
    if (run.status === "blocked" && run.safeFailure !== "unknown_outcome") {
      if (run.generationCompletedAtMs != null && !run.activeOperationId && !run.preparation) {
        return withOperationBudget(now() + OPERATION_LIMIT_MS, () => advanceWork(runId), { now });
      }
      return "blocked";
    }
    // Expiry is uncertain regardless of controller identity. A retained own
    // preparation must not loop on an already-expired I/O budget forever.
    if (!operation && run.preparation && now() >= run.preparation.deadlineAtMs) {
      if (run.status === "blocked" && run.preparation.unresolved && run.preparation.outcome === "failed") return "blocked";
      await withMongoTransaction(deps.database, async (session) => {
        const changed = await deps.database.collections.experiment_runs.updateOne({ _id: runId, activeOperationId: null, revision: run!.revision, "preparation.ownerId": run!.preparation!.ownerId },
          { $set: { status: "blocked", safeFailure: "unknown_outcome", "preparation.outcome": "failed", "preparation.unresolved": true }, $inc: { revision: 1 } }, { session });
        if (changed.modifiedCount && authority && run!.mode === "balanced" && run!.m4?.campaignId === authority.grant.campaignId) {
          await createExperimentCampaignLedger(deps.database, authority).stop(session, now());
        }
      });
      return "blocked";
    }
    // Pause does not transfer a live preparation lease to another controller.
    if (!operation && run.preparation && run.preparation.ownerId !== ownerId) return "waiting";
    if (operation?.deadlineAtMs && now() >= operation.deadlineAtMs - RECONCILIATION_RESERVE_MS) {
      if (operation.dispatchStartedAtMs == null) {
        await repository.failPreparation(runId, operation._id, now());
        return operation.localReportFailure ? finalizeLocalReportFailure(runId) : "blocked";
      }
      if (operation.lifecycle?.attemptOutcome && !await repository.beginObservation(operation._id, now())) return "waiting";
      await mutate(() => coordinator.inspect({ runId, operationId: operation!._id, stop: "deadline" }), { admitted: true, runId, operationId: operation._id });
      return "waiting";
    }
    if (!operation && !run.pauseRequested && (run.status === "queued" || run.status === "running")) {
      const deployment = await deps.database.collections.deployment_control.findOne({ environment: process.env.DEPLOYMENT_ENV ?? "local" });
      if (deployment?.maintenance || deployment?.draining) return "waiting";
      if (!run.preparation) {
        const preparation = { ownerId, startedAtMs: now(), deadlineAtMs: now() + OPERATION_LIMIT_MS };
        const claimed = await deps.database.collections.experiment_runs.findOneAndUpdate({ _id: runId, revision: run.revision, activeOperationId: null, preparation: null }, { $set: { preparation } }, { returnDocument: "after" });
        if (!claimed) return "waiting";
        run = claimed;
      }
    }
    const deadline = operation?.deadlineAtMs ?? run.preparation?.deadlineAtMs ?? now() + OPERATION_LIMIT_MS;
    const startedAt = performance.now();
    try {
      const result = await withOwnedController(runId, (signal) => withOperationBudget(deadline - RECONCILIATION_RESERVE_MS,
        () => measurePhase({ runId, ...(operation ? { operationId: operation._id } : {}) }, "advance", () => advanceWork(runId)), { now, signal }));
      if (!operation && run.preparation) await deps.database.collections.experiment_runs.updateOne({ _id: runId, activeOperationId: null, "preparation.ownerId": ownerId },
        { $set: result === "blocked" ? { "preparation.outcome": "failed", "preparation.unresolved": false } : { preparation: null } });
      return result;
    } catch (error) {
      const unownedReadFailure = !operation && run.mode === "balanced" && ["MongoOperationTimeoutError", "MongoNetworkError",
        "MongoServerError", "MongoServerSelectionError", "AbortError", "OperationBudgetExpired"].includes(safeFailure(error).errorKind);
      if (error instanceof CompletionReconciliationError || unownedReadFailure) {
        // Without an admitted operation, a transient scheduling read cannot
        // establish failure of the last committed result (or a new request).
        // Keep uncertainty when the database cannot establish current state.
        const diagnostic = error instanceof CompletionReconciliationError ? error.diagnostic
          : new CompletionReconciliationError(error, "completion_readback", startedAt, "unknown").diagnostic;
        console.info(JSON.stringify({ event: "booklet_completion_failure", runId,
          ...(operation ? { operationId: operation._id } : {}), ...diagnostic }));
        return "waiting";
      }
      const current = await repository.getRun(runId);
      if (current) {
        const cancelled = await deps.database.collections.experiment_operations.find({ runId,
          ...(operation ? { _id: operation._id } : { "lifecycle.ownerId": ownerId,
            createdAtMs: { $gte: run.preparation?.startedAtMs ?? now() } }),
          "localPreparationCancellation.kind": "paused_text_v1" }).limit(2).toArray();
        // Resume or another controller may already have advanced the run. This
        // worker still owns only its cancelled attempt, never that newer state.
        if (cancelled.length === 1 && authority && await withMongoTransaction(deps.database, session =>
          verifyUndispatchedText(deps.database, session, authority, current, cancelled[0]._id)) ===
            cancelled[0].localPreparationCancellation!.evidenceDigest) return "waiting";
      }
      if (!current?.activeOperationId && current?.preparation?.ownerId === ownerId && current.preparation.stopRequestedAtMs) {
        await deps.database.collections.experiment_runs.updateOne({ _id: runId, activeOperationId: null,
          "preparation.ownerId": ownerId, "preparation.stopRequestedAtMs": current.preparation.stopRequestedAtMs },
        { $set: { "preparation.unresolved": false, safeFailure: "definite_failure" } });
        return "blocked";
      }
      if (error instanceof ExperimentRepositoryError && (error.code === "stale_revision" || error.code === "conflict")) return "waiting";
      const currentOperation = current?.activeOperationId ? await repository.getOperation(current.activeOperationId) : null;
      const owned = currentOperation && (currentOperation._id === operation?._id || currentOperation.lifecycle?.ownerId === ownerId);
      if (currentOperation && !owned) return "waiting";
      if (currentOperation?.dispatchStartedAtMs != null) {
        await mutate(() => coordinator.inspect({ runId, operationId: currentOperation._id,
          ...(error instanceof OperationBudgetExpired || now() >= deadline - RECONCILIATION_RESERVE_MS ? { stop: "deadline" as const } : {}) }), { admitted: true, runId, operationId: currentOperation._id });
      } else {
        if (currentOperation) await repository.failPreparation(runId, currentOperation._id, now());
        else await repository.blockRun({ runId, category: "definite_failure", nowMs: now() });
        if (run.preparation) await deps.database.collections.experiment_runs.updateOne({ _id: runId, "preparation.ownerId": ownerId }, { $set: { "preparation.outcome": "failed", "preparation.unresolved": false } });
        if (currentOperation?.localReportFailure) return finalizeLocalReportFailure(runId);
      }
      return "blocked";
    }
  }

  async function advance(runId: string): Promise<"advanced" | "waiting" | "boundary" | "blocked"> {
    if (activeAdvances.has(runId)) return "waiting";
    activeAdvances.add(runId);
    try { return await advanceOwned(runId); }
    finally { activeAdvances.delete(runId); }
  }

  async function cycle() {
    const runs = (await repository.listRuns()).reverse();
    const heads = new Map((await repository.listOperationHeads(runs.map((run) => run._id)))
      .map((operation) => [operation.runId, operation]));
    type Head = Awaited<ReturnType<typeof repository.listOperationHeads>>[number];
    async function unresolved(run: ExperimentRunDocument, head?: Head | null) {
      const operation = run.activeOperationId ? await repository.getOperation(run.activeOperationId) :
        head === undefined ? (await repository.listOperationHeads([run._id]))[0] : head;
      return operation && (operation.dispatchStartedAtMs != null || operation.state === "unknown") &&
        (run.activeOperationId === operation._id || operation.state === "succeeded" && !operation.verifiedWorkflowId)
        ? operation : null;
    }
    // Reconcile retained workflow IDs before admitting another persona's POST.
    for (const run of runs) {
      if (run.preparation?.unresolved) return "waiting" as const;
      if (run.preparation && !run.activeOperationId && run.preparation.outcome !== "failed") {
        await advance(run._id);
        return "waiting" as const;
      }
      const operation = await unresolved(run, heads.get(run._id) ?? null);
      if (!operation) continue;
      // Unresolved work retains the single-experiment lane even after expiry,
      // without an ID, or after a conflicting publication. Never admit a new
      // persona merely because the old observation deadline elapsed.
      if (run.status === "blocked" && run.safeFailure !== "unknown_outcome") return "waiting" as const;
      await advance(run._id);
      const currentRun = await repository.getRun(run._id);
      // Re-read after observation. The cycle's initial heads are not evidence
      // for state changed by a callback or reconciliation during this pass.
      if (currentRun && await unresolved(currentRun)) return "waiting" as const;
    }
    for (const run of runs) {
      if (run.status === "completed" || run.status === "failed" || (run.status === "paused" && !run.activeOperationId)) continue;
      if (run.status === "blocked" && (run.safeFailure !== "unknown_outcome" || !run.activeOperationId)) continue;
      if (run.status === "blocked" && run.activeOperationId && !(await repository.getOperation(run.activeOperationId))?.workflowRunId) continue;
      if (run.status === "blocked" && run.activeOperationId) {
        const operation = await repository.getOperation(run.activeOperationId);
        if (operation && now() >= (operation.deadlineAtMs ?? (operation.dispatchStartedAtMs ?? now()) + OPERATION_LIMIT_MS)) continue;
      }
      const outcome = await advance(run._id);
      if (outcome === "advanced") return outcome;
    }
    return "idle" as const;
  }
  async function inspectPreparation(input: { runId: string; preparationId: string; expectedRevision: number; stop?: boolean }) {
    const run = await repository.getRun(input.runId);
    if (!run || run.revision !== input.expectedRevision) throw new ExperimentRepositoryError("stale_revision", "Run revision changed.");
    if (run.activeOperationId || run.preparation?.ownerId !== input.preparationId) throw new ExperimentRepositoryError("conflict", "Preparation ownership changed.");
    if (!input.stop) return run.preparation;
    // Incrementing revision fences an in-flight prepareOperation transaction.
    const changed = await withMongoTransaction(deps.database, async (session) => {
      const result = await deps.database.collections.experiment_runs.updateOne({ _id: run._id, revision: run.revision,
        activeOperationId: null, "preparation.ownerId": input.preparationId }, { $set: {
        pauseRequested: true, status: "blocked", safeFailure: "unknown_outcome", "preparation.outcome": "failed",
        "preparation.unresolved": true, "preparation.stopRequestedAtMs": now(), updatedAtMs: now(),
      }, $inc: { revision: 1 } }, { session });
      if (result.modifiedCount && authority && run.mode === "balanced" && run.m4?.campaignId === authority.grant.campaignId) {
        await createExperimentCampaignLedger(deps.database, authority).stop(session, now());
      }
      return result;
    });
    if (!changed.modifiedCount) throw new ExperimentRepositoryError("stale_revision", "Preparation changed before stop.");
    cancelOwnedControllers(run._id);
    return (await repository.getRun(run._id))?.preparation;
  }
  // Internal maintenance caller only: its fresh authenticated GET and full
  // preservation proof precede this call. Keep the interactive Inspect/Stop
  // budgets unchanged; inherit the existing bounded maintenance request instead.
  async function reconcileRetainedCompletion(target: { runId: string; operationId: string; expectedRevision: number }, observed: RuntimeResult) {
    const remaining = operationBudgetRemainingMs();
    if (remaining === null || remaining <= 0 || remaining > 150_000) {
      throw new ExperimentRepositoryError("invalid_state", "Retained completion requires a bounded maintenance request.");
    }
    const run = await repository.getRun(target.runId);
    const operation = await repository.getOperation(target.operationId);
    if (!run || !operation ||
        !authority?.grant.completionRecoveries?.some(item => item.runId === target.runId && item.operationId === target.operationId) ||
        run.revision !== target.expectedRevision || run.mode !== "balanced" || run.status !== "blocked" || run.safeFailure !== "definite_failure" ||
        run.activeOperationId !== operation._id || run.preparation || run.generationCompletedAtMs != null ||
        operation.runId !== run._id || !isCompletionRecoveryRole(operation) || operation.providerKind !== "text" ||
        operation.state !== "started" || operation.lifecycle?.stop || operation.resultJson || operation.materializationJson || operation.m4CompletionRecovery ||
        operation.authorizationClaim || operation.imageCompletionClaim || operation.resultFinalizationClaim ||
        observed.kind !== "execution" || observed.execution.status !== "succeeded" || observed.execution.id !== operation.workflowRunId ||
        observed.execution.workflow_id !== operation.verifiedWorkflowId ||
        operation.workflowTaskId && observed.execution.task_id && operation.workflowTaskId !== observed.execution.task_id ||
        typeof observed.execution.outputs?.booklet_provider_result !== "string" ||
        createHash("sha256").update(observed.execution.outputs.booklet_provider_result).digest("hex") !== operation.m4Observation?.wrapperDigest) {
      throw new ExperimentRepositoryError("invalid_state", "Retained completion requires exact bounded maintenance proof.");
    }
    // Preserve the coordinator's authenticated status write, fenced to the
    // inspected operation. A newly acquired claim requires fresh inspection.
    const recorded = await deps.database.collections.experiment_operations.updateOne({ _id: operation._id, runId: run._id,
      state: "started", workflowRunId: observed.execution.id, verifiedWorkflowId: observed.execution.workflow_id,
      authorizationClaim: null, imageCompletionClaim: null, resultFinalizationClaim: null,
      "m4Observation.wrapperDigest": operation.m4Observation!.wrapperDigest }, { $set: { remoteStatus: "succeeded" } });
    if (recorded.matchedCount !== 1) throw new ExperimentRepositoryError("conflict", "Retained completion ownership changed.");
    await reconcile(run, operation, observed, true);
  }
  return { advance, cycle, inspect: coordinator.inspect, inspectPreparation, reconcileRetainedCompletion };
}
