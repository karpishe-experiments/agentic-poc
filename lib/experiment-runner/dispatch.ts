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

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
function fingerprint(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }

export function createExperimentDispatcher(deps: {
  database: Database; config: BookletRunnerConfig; runtime?: WorkflowRuntime;
  mutate?: typeof runTrackedMutation; now?: () => number;
  store?: () => AssetStore;
}) {
  const store = deps.store ?? createAssetStore;
  const repository = createExperimentRepository(deps.database, { store });
  const context = createExperimentContextService(deps.database);
  const runtime = deps.runtime ?? createWorkflowRuntime(deps.config);
  const mutate = deps.mutate ?? runTrackedMutation;
  const now = deps.now ?? Date.now;
  const bindingFor = (operation: ExperimentOperationDocument, run: ExperimentRunDocument) => selectBinding(deps.config,
    operation.role as "manager" | "specialist" | "tester" | "image", operation.taskId as SpecialistTask | null, run.persona);

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
    const images = view.operationHistory.filter((item) => item.role === "image" && item.state === "succeeded").map((item) => item.id);
    await repository.recordProgress({ runId, operationId: operation._id, nowMs: now(), fingerprint64: fingerprint({
      artifacts: view.currentArtifacts.map(({ id, state, currentVersionId, versions }) => ({ id, state, currentVersionId, approvals: versions.map((version) => version.approval?.id ?? null) })),
      delegation: view.activeDelegation?.id ?? null, pending: view.pendingDecision, messages: view.creatorMessages.map((message) => message.id),
      ...(images.length ? { images } : {}),
    }) });
  }

  async function reconcile(run: ExperimentRunDocument, operation: ExperimentOperationDocument, result: RuntimeResult) {
    const identity = { runId: run._id, operationId: operation._id, parentWorkflowRunId: operation.parentWorkflowRunId, nowMs: now() };
    const current = await repository.getOperation(operation._id);
    if (!current) return;
    const binding = bindingFor(operation, run);
    if (result.kind === "execution") {
      const execution = result.execution;
      if (execution.workflow_id !== binding.publishedWorkflowId || (current.workflowRunId && current.workflowRunId !== execution.id)) {
        await repository.blockRun({ runId: run._id, category: "definite_failure", nowMs: now() });
        return;
      }
      await repository.recordDispatchIdentity({ ...identity, workflowRunId: execution.id });
      const imageCompletion = operation.role === "image" ? runtimeImageCompletion(execution) : null;
      const completion = operation.role === "image" ? null : runtimeCompletion(execution);
      const unclaimedPause = execution.status === "succeeded" && execution.outputs?.authorization_reason === "paused" &&
        current.state === "prepared" && current.reservationCount === 0;
      if (operation.role === "image" && !unclaimedPause) {
        if (execution.status === "running" && execution.outputs?.image_result === undefined) {
          if (now() >= (current.deadlineAtMs ?? (current.dispatchStartedAtMs ?? now()) + 600_000)) {
            if (current.state === "succeeded") await repository.blockRun({ runId: run._id, category: "unknown_outcome", nowMs: now() });
            else await repository.recordDispatchOutcome({ ...identity, category: "unknown_outcome" });
          }
          return;
        }
        if ((execution.status === "failed" || execution.status === "stopped") && current.state !== "succeeded") {
          await repository.recordDispatchOutcome({ ...identity, category: "definite_failure" });
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
      if (operation.role !== "image" || execution.status === "succeeded") {
        await repository.verifyDispatchPublication({ ...identity, workflowRunId: execution.id, workflowId: execution.workflow_id });
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
          await repository.recordDispatchOutcome({ ...identity, category: "definite_failure" });
        } else if (execution.status !== "running" || now() >= (current.deadlineAtMs ?? (current.dispatchStartedAtMs ?? now()) + 600_000)) {
          await repository.recordDispatchOutcome({ ...identity, category: "unknown_outcome" });
        }
      }
    } else if (current.state !== "succeeded") {
      await repository.recordDispatchOutcome({ ...identity, category: result.kind === "rejected" && current.reservationCount === 0 ? "definite_failure" : "unknown_outcome" });
    } else if (!current.verifiedWorkflowId) {
      const recovered = current.workflowRunId ? await runtime.retrieve(binding, current.workflowRunId) : { kind: "unknown" as const };
      if (recovered.kind === "execution") await reconcile(run, current, recovered);
      else await repository.blockRun({ runId: run._id, category: "unknown_outcome", nowMs: now() });
      return;
    }
    const saved = await repository.getOperation(operation._id);
    if (saved) await observeProgress(run._id, saved);
  }

  async function advance(runId: string): Promise<"advanced" | "waiting" | "boundary" | "blocked"> {
    return mutate(async () => {
      let run = await repository.getRun(runId);
      if (!run || run.mode !== "simulated" || run.status === "completed" || run.status === "failed") return "blocked";
      // Completed slice evidence remains complete after a newer suite is bound.
      // This is a saved-state read, not permission to execute an old publication.
      if (!run.activeOperationId && run.status !== "blocked") {
        const savedView = await context.getRunView(runId);
        if (savedView?.nextNarrativeTask === "slice_complete") {
          const last = (await repository.listOperations(runId)).at(-1);
          if (last?.state === "succeeded" && last.verifiedWorkflowId && run.progressOperationId === last._id) return "boundary";
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
        await reconcile(run, operation, operation.workflowRunId ? await runtime.retrieve(binding, operation.workflowRunId) : { kind: "unknown" });
        return "waiting";
      }
      if (run.pauseRequested || run.status === "paused") return "waiting";
      if (run.status === "blocked") return "blocked";
      let parentWorkflowRunId: string | null = null;
      if (!operation) {
        const latest = (await repository.listOperations(runId)).at(-1);
        if (latest?.state === "succeeded" && !latest.verifiedWorkflowId) {
          const binding = bindingFor(latest, run);
          await reconcile(run, latest, latest.workflowRunId ? await runtime.retrieve(binding, latest.workflowRunId) : { kind: "unknown" });
          run = (await repository.getRun(runId))!;
          if (run.status === "blocked") return "blocked";
          if (!(await repository.getOperation(latest._id))?.verifiedWorkflowId) return "waiting";
        }
        if (latest?.state === "succeeded" && run.progressOperationId !== latest._id) {
          await observeProgress(runId, latest);
          run = (await repository.getRun(runId))!;
          if (run.status === "blocked") return "blocked";
        }
        const view = await context.getRunView(runId);
        if (!view || !view.nextNarrativeTask) return "waiting";
        if (view.nextNarrativeTask === "slice_complete") return "boundary";
        if (view.nextNarrativeTask === "style_samples" || view.nextNarrativeTask === "sheet_image") {
          try {
            const prepared = view.nextNarrativeTask === "style_samples" ? await prepareStyleSample(run, view) : await prepareSheetImage(run, view);
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
        let role: "manager" | "specialist" | "tester" = view.nextNarrativeTask === "tester" || initialDelegation ? "tester" : "manager";
        let taskId: SpecialistTask | null = null;
        let subjectKind: ExperimentOperationDocument["subjectKind"] = "book", subjectId = run.bookletId;
        if (!initialDelegation && view.nextNarrativeTask !== "tester" && last?.state === "succeeded" && last.role === "manager") {
          const result = JSON.parse(last.resultJson ?? "null") as { kind?: string; payload?: { taskId?: string; subjectKind?: string; subjectId?: string } } | null;
          const delegated = result?.payload?.taskId;
          const sheet = delegated === "J09" || delegated === "J10";
          const target = view.currentArtifacts.find((item) => item.taskId === delegated && (!sheet || item.subjectKind === result?.payload?.subjectKind && item.subjectId === result?.payload?.subjectId));
          const pending = view.pendingDecision as { kind?: string; taskId?: string; artifactVersionId?: string } | null;
          const matchingRevision = pending?.kind === "revision" && pending.taskId === delegated && pending.artifactVersionId === target?.currentVersionId;
          // Both siblings can be ready. Honor the saved manager choice rather
          // than forcing the projection's deterministic display order.
          if (result?.kind === "delegate" && sheet && configuredReferenceSheetTasks(run.configurationJson).includes(delegated) &&
              result.payload?.subjectKind === (delegated === "J09" ? "character" : "location") && result.payload.subjectId &&
              (!pending || matchingRevision) && (!target || target.state === "needs_review" || matchingRevision)) {
            role = "specialist"; taskId = delegated; subjectKind = result.payload.subjectKind; subjectId = result.payload.subjectId; parentWorkflowRunId = last.workflowRunId;
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
        } else if (operation.role === "image") {
          const imageTarget = operation.taskId === "J09" || operation.taskId === "J10" ?
            await deps.database.collections.artifacts.findOne({ experimentRunId: run._id, bookletId: run.bookletId, taskId: operation.taskId,
              subjectKind: operation.subjectKind, subjectId: operation.subjectId }) : null;
          const draft = await deps.database.collections.artifact_versions.findOne({ _id: imageTarget?.currentVersionId ?? operation.dependencyVersionIds[0] });
          parentWorkflowRunId = draft?.sourceOperationId ? (await repository.getOperation(draft.sourceOperationId))?.workflowRunId ?? null : null;
        }
      }
      const admission = await repository.beginDispatch({ runId, operationId: operation._id, parentWorkflowRunId, nowMs: now() });
      if (!admission.dispatched) return "waiting";
      operation = admission.operation;
      const binding = bindingFor(operation, run);
      await reconcile(run, operation, await runtime.start(binding, { runId, operationId: operation._id, parentWorkflowRunId, mode: "simulated" }));
      return "advanced";
    });
  }

  async function cycle() {
    const runs = (await repository.listRuns()).reverse();
    // Reconcile retained workflow IDs before admitting another persona's POST.
    for (const run of runs) {
      if (run.status === "blocked" && run.safeFailure !== "unknown_outcome") continue;
      if (!run.activeOperationId) continue;
      const operation = await repository.getOperation(run.activeOperationId);
      if (!operation?.workflowRunId || operation.dispatchStartedAtMs == null ||
          now() >= (operation.deadlineAtMs ?? operation.dispatchStartedAtMs + 600_000)) continue;
      await advance(run._id);
      const currentRun = await repository.getRun(run._id);
      const current = currentRun?.activeOperationId ? await repository.getOperation(currentRun.activeOperationId) : null;
      if (current?.workflowRunId && current.dispatchStartedAtMs != null &&
          now() < (current.deadlineAtMs ?? current.dispatchStartedAtMs + 600_000)) return "waiting" as const;
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
