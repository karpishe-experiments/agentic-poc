import { z } from "zod";
import { withMongoTransaction, type Database } from "@/db/client";
import { verifyExperimentGeneration } from "@/db/experiment-completion";
import { createAssetStore } from "@/lib/assets/create-asset-store";
import type { ApprovalDocument, ArtifactDocument, ArtifactVersionDocument, ExperimentRunDocument } from "@/db/documents";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { createExperimentImageRepository } from "@/db/experiment-images";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { assembledVisualStyleSchema } from "@/lib/contracts/experiment-references";
import { configuredNarrativeTasks, currentApprovedSourceIds, isNarrativeTask, type NarrativeTask } from "@/lib/experiment-runner/narrative-tasks";
import type { ExperimentTask, SpecialistTask } from "@/lib/contracts/experiment-runner";
import { configuredReferenceSheetTasks, nextReferenceSheetWork, referenceSheetTargets } from "@/lib/experiment-runner/reference-targets";
import { configuredPaginationTask, currentPaginationSourceIds } from "@/lib/experiment-runner/pagination-tasks";
import { configuredPageBibleTask, parsePageBibleForLayout } from "@/lib/experiment-runner/page-bible-tasks";
import { parseStoredPageLayout } from "@/lib/contracts/experiment-pages";
import { configuredPageIllustrationTask, nextPageIllustrationWork } from "@/lib/experiment-runner/page-illustration-tasks";
import type { AssetStore } from "@/lib/assets/asset-store";
import { experimentReportSchema } from "@/lib/contracts/experiment-reports";
import { experimentPageBatchSchema, type ExperimentPageBatch } from "@/lib/contracts/experiment-page-batches";
import type { ExperimentImageRequest } from "@/lib/contracts/experiment-image";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { measurePhase } from "@/lib/experiment-runner/diagnostics";

const contextIdentity = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema, workflowRunId: opaqueIdSchema, parentWorkflowRunId: opaqueIdSchema.nullable() });
type NextTask = ExperimentTask | "style_samples" | "sheet_image" | "tester" | "slice_complete" | null;
function parseJson(value: string | null): unknown { return value === null ? null : JSON.parse(value) as unknown; }
function deny(message: string): never { throw new ExperimentRepositoryError("conflict", message); }

export function createExperimentContextService(database: Database, options: { store?: () => AssetStore } = {}) {
  const { experiment_runs: runs, experiment_operations: operations, experiment_delegations: delegations, artifacts, artifact_versions: versions, approvals, messages, booklets } = database.collections;

  function projectArtifact(artifact: ArtifactDocument,
    rows: ArtifactVersionDocument[], approvalRows: ApprovalDocument[]) {
    const approvalByVersion = new Map(approvalRows.map((row) => [row.artifactVersionId, row]));
    return {
      id: artifact._id, taskId: artifact.taskId as ExperimentTask, subjectKind: artifact.subjectKind, subjectId: artifact.subjectId,
      state: artifact.state, currentVersionId: artifact.currentVersionId,
      versions: rows.map((row) => {
        const approval = approvalByVersion.get(row._id);
        return {
          id: row._id, number: row.versionNumber, content: parseJson(row.contentJson),
          dependencyVersionIds: parseJson(row.dependencyVersionIdsJson), warnings: parseJson(row.warningsJson ?? "[]"),
          sourceVersionId: row.sourceVersionId, sourceOperationId: row.sourceOperationId ?? null,
          approval: approval ? { id: approval._id, origin: approval.origin, testerDecisionId: approval.testerDecisionId ?? null, delegationId: approval.delegationId ?? null, reviewGroupId: approval.reviewGroupId ?? null } : null,
        };
      }),
    };
  }

  function sheetTargets(run: ExperimentRunDocument, projected: Awaited<ReturnType<typeof projectArtifact>>[]) {
    if (!configuredReferenceSheetTasks(run.configurationJson).length) return [];
    if (!configuredNarrativeTasks(run.configurationJson).every((task) => projected.some((item) => item.taskId === task && item.state === "approved" && item.currentVersionId))) return [];
    function source(task: "J06" | "J07" | "J08") {
      const matches = projected.filter((item) => item.taskId === task && item.subjectKind === "book" && item.subjectId === run.bookletId);
      const artifact = matches.length === 1 ? matches[0] : null;
      const version = artifact?.versions.find((item) => item.id === artifact.currentVersionId);
      if (!version?.approval) deny("Sheet source approval is missing.");
      return { versionId: version.id, content: version.content };
    }
    return referenceSheetTargets({ characters: source("J06"), locations: source("J07"), style: source("J08") });
  }

  function sheetWork(run: ExperimentRunDocument, projected: Awaited<ReturnType<typeof projectArtifact>>[]) {
    const targets = sheetTargets(run, projected);
    const saved = projected.filter((item) => item.taskId === "J09" || item.taskId === "J10").map((item) => ({
      taskId: item.taskId as "J09" | "J10", subjectKind: item.subjectKind as "character" | "location", subjectId: item.subjectId!,
      state: item.state, currentVersionId: item.currentVersionId, content: item.versions.find((version) => version.id === item.currentVersionId)?.content,
    }));
    return nextReferenceSheetWork(targets, saved);
  }

  function paginationSources(run: ExperimentRunDocument, projected: Awaited<ReturnType<typeof projectArtifact>>[]) {
    if (!configuredPaginationTask(run.configurationJson)) return null;
    return currentPaginationSourceIds(run.bookletId, run._id, sheetTargets(run, projected), projected.flatMap((item) => {
      if (!item.subjectId || (item.subjectKind !== "book" && item.subjectKind !== "character" && item.subjectKind !== "location")) return [];
      const dependencies = item.versions.find((version) => version.id === item.currentVersionId)?.dependencyVersionIds as string[] | undefined;
      return [{ bookletId: run.bookletId, runId: run._id, taskId: item.taskId, subjectKind: item.subjectKind, subjectId: item.subjectId,
        state: item.state, currentVersionId: item.currentVersionId,
        sourceVersionIds: item.taskId === "J09" || item.taskId === "J10" ? dependencies?.slice(-2) : dependencies }];
    }));
  }

  function pageBibleWork(run: ExperimentRunDocument, projected: Awaited<ReturnType<typeof projectArtifact>>[]) {
    if (!configuredPageBibleTask(run.configurationJson)) return null;
    const source = (taskId: "J11" | "J05" | "J08") => {
      const matches = projected.filter((item) => item.taskId === taskId && item.subjectKind === "book" && item.subjectId === run.bookletId);
      const artifact = matches.length === 1 ? matches[0] : null;
      const version = artifact?.versions.find((item) => item.id === artifact.currentVersionId);
      return artifact?.state === "approved" && version?.approval ? version : null;
    };
    const layoutSource = source("J11"), manuscript = source("J05"), style = source("J08");
    if (!layoutSource || !manuscript || !style) return null;
    const layout = parseStoredPageLayout(run.persona, layoutSource.content);
    const pending = parseJson(run.pendingDecisionJson) as { kind?: string; taskId?: string; subjectKind?: string; subjectId?: string; artifactVersionId?: string } | null;
    const selected = pending?.kind === "revision" && pending.taskId === "J12" && pending.subjectKind === "page" ? pending.subjectId : null;
    if (pending?.kind === "revision" && pending.taskId === "J12" && !selected) return null;
    for (const page of layout.pages) {
      if (selected && page.pageId !== selected) continue;
      const references = page.panels.flatMap((panel) => panel.sheetReferences)
        .sort((a, b) => (a.subjectKind === "character" ? "J09" : "J10").localeCompare(b.subjectKind === "character" ? "J09" : "J10") || a.subjectId.localeCompare(b.subjectId));
      if (references.some((reference) => {
        const matches = projected.filter((item) => item.taskId === (reference.subjectKind === "character" ? "J09" : "J10") &&
          item.subjectKind === reference.subjectKind && item.subjectId === reference.subjectId);
        const artifact = matches.length === 1 ? matches[0] : null;
        return artifact?.state !== "approved" || artifact.currentVersionId !== reference.artifactVersionId ||
          !artifact.versions.find((version) => version.id === reference.artifactVersionId)?.approval;
      })) return null;
      const sourceVersionIds = [...new Set([layoutSource.id, manuscript.id, style.id, ...references.map((reference) => reference.artifactVersionId)])];
      const matches = projected.filter((item) => item.taskId === "J12" && item.subjectKind === "page" && item.subjectId === page.pageId);
      if (matches.length > 1) deny("Page has duplicate current artifacts.");
      const artifact = matches[0];
      const current = artifact?.versions.find((version) => version.id === artifact.currentVersionId);
      if (selected) {
        if (!artifact || artifact.currentVersionId !== pending?.artifactVersionId) return null;
        return { taskId: "J12" as const, subjectKind: "page" as const, subjectId: page.pageId, pageIndex: page.pageIndex, sourceVersionIds };
      }
      if (!artifact || artifact.state === "needs_review") return { taskId: "J12" as const, subjectKind: "page" as const, subjectId: page.pageId, pageIndex: page.pageIndex, sourceVersionIds };
      if (artifact.state === "draft") return { taskId: "J12" as const, subjectKind: "page" as const, subjectId: page.pageId, pageIndex: page.pageIndex, sourceVersionIds, review: true as const };
      if (artifact.state !== "approved" || !current?.approval || !current ||
          JSON.stringify(current.dependencyVersionIds) !== JSON.stringify(sourceVersionIds)) return null;
      try {
        parsePageBibleForLayout({ persona: run.persona, pageId: page.pageId, layout, layoutVersionId: layoutSource.id,
          manuscriptVersionId: manuscript.id, styleVersionId: style.id, proposal: current.content });
      } catch { return null; }
    }
    return selected ? null : { complete: true as const };
  }

  function chooseNext(run: ExperimentRunDocument, projected: Awaited<ReturnType<typeof projectArtifact>>[], batch?: ExperimentPageBatch): NextTask {
    if (run.pauseRequested || run.status === "paused" || run.status === "blocked" || run.status === "failed" || run.status === "completed" || run.activeOperationId) return null;
    const enabled = configuredNarrativeTasks(run.configurationJson);
    const pending = parseJson(run.pendingDecisionJson) as { kind?: string; taskId?: ExperimentTask; subjectId?: string; subjectKind?: string } | null;
    if (pending?.kind === "question") return "tester";
    if (pending?.kind === "revision") {
      if (pending.taskId === "J13") return illustrationWork(run, projected)?.kind === "image" ? "J13" : null;
      if (pending.taskId === "J12") return pageBibleWork(run, projected)?.taskId === "J12" ? "J12" : null;
      if (pending.taskId === "J11") return paginationSources(run, projected) !== null ? "J11" : null;
      if (pending.taskId === "J09" || pending.taskId === "J10") return sheetTargets(run, projected).some((target) => target.taskId === pending.taskId && target.subjectKind === pending.subjectKind && target.subjectId === pending.subjectId) ? pending.taskId : null;
      return isNarrativeTask(pending.taskId) && enabled.includes(pending.taskId) && currentApprovedSourceIds(pending.taskId, projected) !== null ? pending.taskId : null;
    }
    for (const task of enabled) {
      const current = projected.find((item) => item.taskId === task);
      if ((!current || current.state === "needs_review") && currentApprovedSourceIds(task, projected) !== null) return task;
    }
    const style = projected.find((item) => item.taskId === "J08" && item.state === "draft");
    if (style && !assembledVisualStyleSchema.safeParse(style.versions.find((item) => item.id === style.currentVersionId)?.content).success) return "style_samples";
    if (projected.some((item) => enabled.some((task) => task === item.taskId) && item.state === "draft")) return "tester";
    if (!enabled.every((task) => projected.some((item) => item.taskId === task && item.state === "approved" && item.currentVersionId))) return null;
    const work = sheetWork(run, projected);
    if (work) return work.kind === "proposal" ? work.target.taskId : work.kind === "image" ? "sheet_image" : "tester";
    if (configuredPaginationTask(run.configurationJson)) {
      const layout = projected.find((item) => item.taskId === "J11");
      if ((!layout || layout.state === "needs_review") && paginationSources(run, projected) !== null) return "J11";
      if (layout?.state === "draft") return "tester";
      if (layout?.state !== "approved") return null;
    }
    if (configuredPageBibleTask(run.configurationJson)) {
      const work = pageBibleWork(run, projected);
      if (!work) return null;
      if ("complete" in work) {
        if (!configuredPageIllustrationTask(run.configurationJson)) return "slice_complete";
        const page = illustrationWork(run, projected, batch);
        return page?.kind === "image" ? "J13" : page?.kind === "review" ? "tester" : page?.kind === "complete" ? "slice_complete" : null;
      }
      return "review" in work ? "tester" : "J12";
    }
    return "slice_complete";
  }

  function illustrationWork(run: ExperimentRunDocument, projected: Awaited<ReturnType<typeof projectArtifact>>[], batch?: ExperimentPageBatch) {
    if (!configuredPageIllustrationTask(run.configurationJson)) return null;
    const bibleWork = pageBibleWork(run, projected);
    if (!bibleWork || !("complete" in bibleWork)) return null;
    const layoutArtifact = projected.find((item) => item.taskId === "J11" && item.state === "approved");
    const layoutVersion = layoutArtifact?.versions.find((item) => item.id === layoutArtifact.currentVersionId);
    if (!layoutVersion?.approval) return null;
    const layout = parseStoredPageLayout(run.persona, layoutVersion.content);
    const pages = layout.pages.map((page) => {
      const artifact = projected.find((item) => item.taskId === "J12" && item.subjectKind === "page" && item.subjectId === page.pageId);
      const version = artifact?.versions.find((item) => item.id === artifact.currentVersionId);
      if (!version?.approval || artifact?.state !== "approved" || !Array.isArray(version.dependencyVersionIds) ||
          version.dependencyVersionIds.some((id) => typeof id !== "string")) return null;
      return { pageId: page.pageId, pageIndex: page.pageIndex, pageBibleVersionId: version.id,
        sourceVersionIds: [version.id, ...version.dependencyVersionIds as string[]] };
    });
    if (pages.some((page) => page === null)) return null;
    // An active selection supplies order, not source authorization. Revisions
    // refresh its saved sources transactionally before another image dispatch.
    const pending = parseJson(run.pendingDecisionJson) as { kind?: string; taskId?: string; subjectKind?: string; subjectId?: string; artifactVersionId?: string } | null;
    if (pending && !(pending.kind === "revision" && pending.taskId === "J13" && pending.subjectKind === "page" &&
        pending.subjectId && pending.artifactVersionId)) return null;
    return nextPageIllustrationWork({ runId: run._id, persona: run.persona, configurationJson: run.configurationJson,
      pages: pages.filter((page) => page !== null), artifacts: projected,
      selectedPageIds: batch?.pages.map((page) => page.pageId),
      revision: pending ? { pageId: pending.subjectId!, artifactVersionId: pending.artifactVersionId! } : null });
  }

  async function getRunView(runId: string, projection: "inspection" | "execution" | "role" = "inspection") {
    const checked = opaqueIdSchema.parse(runId);
    const run = await runs.findOne({ _id: checked });
    if (!run) return null;
    const booklet = await booklets.findOne({ _id: run.bookletId });
    if (!booklet || booklet.experimentRunId !== run._id) deny("Run booklet is missing or mismatched.");
    const enabled = configuredNarrativeTasks(run.configurationJson);
    const sheetsEnabled = configuredReferenceSheetTasks(run.configurationJson).length > 0;
    const artifactRows = await artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId, $or: [
      { subjectKind: "book", subjectId: run.bookletId, taskId: { $in: [...enabled, ...(configuredPaginationTask(run.configurationJson) ? ["J11" as const] : [])] } },
      ...(sheetsEnabled ? [{ taskId: "J09" as const, subjectKind: "character" as const }, { taskId: "J10" as const, subjectKind: "location" as const }] : []),
      ...(configuredPageBibleTask(run.configurationJson) ? [{ taskId: "J12" as const, subjectKind: "page" as const }] : []),
      ...(configuredPageIllustrationTask(run.configurationJson) ? [{ taskId: "J13" as const, subjectKind: "page" as const }] : []),
    ] }).sort({ taskId: 1, subjectId: 1 }).toArray();
    if (new Set(artifactRows.map((row) => `${row.taskId}:${row.subjectKind}:${row.subjectId}`)).size !== artifactRows.length) deny("Run has duplicate task subject artifacts.");
    const versionRows = await versions.find(projection === "inspection"
      ? { artifactId: { $in: artifactRows.map((row) => row._id) } }
      : { _id: { $in: artifactRows.flatMap((row) => row.currentVersionId ? [row.currentVersionId] : []) } })
      .sort({ versionNumber: 1 }).toArray();
    const approvalRows = await approvals.find({ experimentRunId: run._id,
      artifactVersionId: { $in: versionRows.map((row) => row._id) } }).toArray();
    const currentArtifacts = artifactRows.map((artifact) => projectArtifact(artifact,
      versionRows.filter((row) => row.artifactId === artifact._id), approvalRows));
    const batchRows = configuredPageIllustrationTask(run.configurationJson) ? await database.collections.generation_jobs.find({
      bookletId: run.bookletId, jobType: "dify_pages",
    }).sort({ createdAtMs: -1, _id: -1 }).toArray() : [];
    const ownedBatches = batchRows.map((row) => ({ row, batch: experimentPageBatchSchema.parse(JSON.parse(row.inputJson)) }))
      .filter(({ batch }) => batch.runId === run._id && batch.configurationHash === run.configurationHash);
    const activeBatches = ownedBatches.filter(({ row }) => ["pending", "running", "paused", "unknown", "partial"].includes(row.status));
    if (activeBatches.length > 1) deny("Run has overlapping active page batches.");
    // Completed batches can prioritize their current draft's review. They must
    // never revive old generation selection after an upstream source revision.
    const reviewBatch = ownedBatches.find(({ row, batch }) => row.status === "succeeded" &&
      currentArtifacts.some((artifact) => artifact.taskId === "J11" && artifact.state === "approved" && artifact.currentVersionId === batch.layoutVersionId) &&
      batch.pages.every((page) => currentArtifacts.some((artifact) => artifact.taskId === "J12" && artifact.subjectId === page.pageId &&
        artifact.state === "approved" && artifact.currentVersionId === page.pageBibleVersionId)) &&
      batch.pages.some((page) => currentArtifacts.some((artifact) => artifact.taskId === "J13" && artifact.subjectId === page.pageId && artifact.state === "draft")));
    const pageBatch = activeBatches[0]?.batch ?? reviewBatch?.batch;
    const grant = run.activeDelegationId ? await delegations.findOne({ _id: run.activeDelegationId, runId: run._id }) : null;
    const creatorRows = await messages.find({ experimentRunId: run._id, role: "user" },
      projection === "execution" ? { projection: { _id: 1, sequence: 1, createdAtMs: 1 } } : {}).sort({ sequence: 1 }).toArray();
    const operationRows = projection === "inspection" ? await operations.find({ runId: run._id }).sort({ createdAtMs: 1, _id: 1 }).toArray()
      : run.generationCompletedAtMs != null ? await operations.find({ runId: run._id, role: { $in: ["tester", "judge"] }, state: "succeeded" }).sort({ createdAtMs: 1, _id: 1 }).toArray() : [];
    let pageSelection = null;
    if (configuredPageIllustrationTask(run.configurationJson) && run.mode === "simulated" &&
        run.status === "paused" && run.pauseRequested && !run.activeOperationId && !run.pendingDecisionJson &&
        run.generationCompletedAtMs == null && !pageBatch) {
      const readiness = pageBibleWork(run, currentArtifacts);
      const layoutArtifact = currentArtifacts.find((item) => item.taskId === "J11" && item.state === "approved");
      const layoutVersion = layoutArtifact?.versions.find((item) => item.id === layoutArtifact.currentVersionId);
      if (readiness && "complete" in readiness && layoutVersion?.approval) {
        const layout = parseStoredPageLayout(run.persona, layoutVersion.content);
        const pages = layout.pages.flatMap((page) => {
          const bible = currentArtifacts.find((item) => item.taskId === "J12" && item.subjectId === page.pageId);
          const illustration = currentArtifacts.find((item) => item.taskId === "J13" && item.subjectId === page.pageId);
          if (!bible?.currentVersionId || illustration && illustration.state !== "needs_review") return [];
          return [{ pageId: page.pageId, pageIndex: page.pageIndex, pageBibleVersionId: bible.currentVersionId,
            previousPageVersionId: illustration?.currentVersionId ?? null }];
        });
        if (pages.length) pageSelection = { schemaVersion: "2" as const, runId: run._id,
          configurationHash: run.configurationHash, layoutVersionId: layoutVersion.id, pages };
      }
    }
    return {
      runId: run._id, predecessorRunId: run.predecessorRunId, bookletId: run.bookletId, workingTitle: booklet.workingTitle, persona: run.persona, mode: run.mode,
      brief: run.brief, status: run.status, revision: run.revision, pauseRequested: run.pauseRequested,
      evaluationStatus: run.evaluationStatus, counters: { ...run.counters }, limits: { ...run.limits },
      generationStatus: run.generationCompletedAtMs != null ? "complete" as const : "in_progress" as const,
      generationCompletedAtMs: run.generationCompletedAtMs ?? null,
      safeFailure: run.safeFailure, activeOperationId: run.activeOperationId,
      preparation: run.preparation ? { identity: run.preparation.ownerId, startedAtMs: run.preparation.startedAtMs,
        deadlineAtMs: run.preparation.deadlineAtMs, unresolved: run.preparation.unresolved ?? false,
        stopRequestedAtMs: run.preparation.stopRequestedAtMs ?? null } : null,
      createdAtMs: run.createdAtMs, updatedAtMs: run.updatedAtMs,
      pendingDecision: parseJson(run.pendingDecisionJson),
      activeDelegation: grant && !grant.revokedAtMs && !grant.supersededById ? { id: grant._id, taskIds: [...grant.taskIds], subjectKind: grant.subjectKind, subjectId: grant.subjectId, testerDecisionId: grant.testerDecisionId, effectiveSequence: grant.effectiveSequence } : null,
      currentArtifacts,
      pageSelection,
      creatorMessages: creatorRows.map((row) => ({ id: row._id, sequence: row.sequence, content: row.uiMessageJson ? parseJson(row.uiMessageJson) : null, createdAtMs: row.createdAtMs })),
      operationHistory: operationRows.map((row) => ({ id: row._id, role: row.role, taskId: row.taskId, state: row.state,
        workflowRunId: row.workflowRunId, parentWorkflowRunId: row.parentWorkflowRunId,
        verifiedWorkflowId: row.verifiedWorkflowId ?? null,
        workflowTaskId: row.workflowTaskId ?? null, deadlineAtMs: row.deadlineAtMs, remoteStatus: row.remoteStatus ?? null,
        elapsedMs: ["succeeded", "failed"].includes(row.state) && row.lifecycle?.endedAtMs == null ? null :
          Math.max(0, (row.lifecycle?.endedAtMs ?? Date.now()) - (row.lifecycle?.startedAtMs ?? row.dispatchStartedAtMs ?? row.createdAtMs)),
        lifecycle: row.lifecycle ? { phase: row.lifecycle.phase, startedAtMs: row.lifecycle.startedAtMs,
          lastProgressAtMs: row.lifecycle.lastProgressAtMs, attemptOutcome: row.lifecycle.attemptOutcome,
          unresolved: row.lifecycle.unresolved, stop: row.lifecycle.stop, timeoutAtMs: row.lifecycle.timeoutAtMs } : null,
        reservationCount: row.reservationCount, safeFailure: row.safeFailure,
        createdAtMs: row.createdAtMs, updatedAtMs: row.updatedAtMs })),
      nextNarrativeTask: chooseNext(run, currentArtifacts, pageBatch),
      ...(pageBatch ? { pageBatch } : {}),
      ...(sheetsEnabled ? { nextSheetWork: sheetWork(run, currentArtifacts) } : {}),
      ...(configuredPageBibleTask(run.configurationJson) ? { nextPageBibleWork: pageBibleWork(run, currentArtifacts) } : {}),
      ...(configuredPageIllustrationTask(run.configurationJson) ? { nextPageIllustrationWork: illustrationWork(run, currentArtifacts, pageBatch) } : {}),
      ...(configuredPageIllustrationTask(run.configurationJson) ? { reports: operationRows.flatMap((row) => {
        if (row.state !== "succeeded" || row.role !== "tester" && row.role !== "judge") return [];
        const result = parseJson(row.resultJson) as { kind?: string; payload?: unknown } | null;
        if (result?.kind !== (row.role === "tester" ? "feedback" : "assessment")) return [];
        const parsed = experimentReportSchema.safeParse(result.payload);
        if (!parsed.success || parsed.data.runId !== run._id || parsed.data.role !== row.role ||
            parsed.data.mode !== run.mode || parsed.data.configurationHash !== run.configurationHash) return [];
        const currentIds = currentArtifacts.map((artifact) => artifact.currentVersionId);
        return [{ operationId: row._id, workflowRunId: row.workflowRunId, verifiedWorkflowId: row.verifiedWorkflowId ?? null,
          matchesCurrentVersions: currentIds.length === parsed.data.evidence.versionIds.length &&
            currentIds.every((id) => id !== null && parsed.data.evidence.versionIds.includes(id)), report: parsed.data }];
      }) } : {}),
    };
  }

  async function getQuestionAnswers(runId: string, taskId: ExperimentTask, subjectId: string) {
    const questionRows = await operations.find({ runId, state: "succeeded", $or: [{ taskId: null }, { taskId, subjectId }] }).sort({ createdAtMs: 1, _id: 1 }).toArray();
    const creatorRows = await messages.find({ experimentRunId: runId, role: "user" }).sort({ sequence: 1 }).toArray();
    const answers = new Map<string, string>();
    for (const row of creatorRows) {
      const content = parseJson(row.uiMessageJson) as { decision?: { action?: string; questionId?: string; text?: string } } | null;
      if (content?.decision?.action === "answer" && content.decision.questionId && typeof content.decision.text === "string") answers.set(content.decision.questionId, content.decision.text);
    }
    return questionRows.flatMap((row) => {
      const result = parseJson(row.resultJson) as { kind?: string; payload?: { question?: string } } | null;
      if ((result?.kind !== "ask" && result?.kind !== "clarification") || typeof result.payload?.question !== "string") return [];
      return [{ questionId: row._id, taskId: row.taskId, question: result.payload.question, answer: answers.get(row._id) ?? null }];
    });
  }

  async function getOperationContext(raw: unknown, claimedImageRequest?: ExperimentImageRequest) {
    const identity = contextIdentity.parse(raw);
    const run = await runs.findOne({ _id: identity.runId });
    const operation = await operations.findOne({ _id: identity.operationId, runId: identity.runId });
    if (!run || !operation || run.activeOperationId !== operation._id || (operation.state !== "started" && operation.state !== "unknown") || operation.workflowRunId !== identity.workflowRunId || operation.parentWorkflowRunId !== identity.parentWorkflowRunId) deny("Operation claim identity is not current.");
    if (operation.role === "image") {
      // Only the authorize handler passes fresh evidence returned by its claim.
      // Standalone context requests perform a new current-source check.
      if (claimedImageRequest && (imageRequestFingerprint(claimedImageRequest) !== operation.inputFingerprint ||
          JSON.stringify(claimedImageRequest.sourceVersionIds) !== JSON.stringify(operation.dependencyVersionIds))) deny("Claimed image request differs from saved identity.");
      const imageRequest = claimedImageRequest ?? await createExperimentImageRepository(database, options)
        .authorizeFixture({ ...identity, inputFingerprint: operation.inputFingerprint });
      return { role: "image" as const, mode: "simulated" as const, inputFingerprint: operation.inputFingerprint, imageRequest,
        ...(operation.taskId === "J13" && operation.subjectId ? { answers: await getQuestionAnswers(run._id, "J13", operation.subjectId) } : {}) };
    }
    const report = (operation.role === "judge" || operation.role === "tester") && run.generationCompletedAtMs != null;
    const view = await measurePhase(identity, "role_context", () => getRunView(run._id, report ? "inspection" : "role"));
    if (!view) deny("Run view is unavailable.");
    if ((operation.role === "judge" || operation.role === "tester") &&
        run.generationCompletedAtMs != null &&
        configuredPageIllustrationTask(run.configurationJson) &&
        chooseNext({ ...run, activeOperationId: null, pauseRequested: false,
          status: run.status === "paused" || run.status === "blocked" && run.safeFailure === "unknown_outcome" ? "running" : run.status },
        view.currentArtifacts, view.pageBatch) === "slice_complete") {
      // Context is needed inside execution, before runtime readback can verify
      // publication. Report materialization still uses the strict completion phase.
      const generation = await withMongoTransaction(database, (session) =>
        verifyExperimentGeneration(database, session, run, (options.store ?? createAssetStore)(), operation._id, "context"));
      return { role: operation.role as "tester" | "judge", bookletId: view.bookletId, brief: view.brief, persona: view.persona,
        currentArtifacts: view.currentArtifacts, creatorMessages: view.creatorMessages, operationHistory: view.operationHistory,
        counters: view.counters, limits: view.limits, warnings: generation.warnings,
        imageEvidence: { finalPages: generation.finalPages, referenceAssetIds: generation.referenceAssetIds },
        reportEvidence: { role: operation.role as "tester" | "judge", mode: "simulated" as const, runId: run._id,
          configurationHash: generation.configurationHash, versionIds: generation.artifacts.map((artifact) => artifact.versionId),
          warningCount: generation.warnings.reduce((count, entry) => count + (Array.isArray(entry.warnings) ? entry.warnings.length : 0), 0) } };
    }
    if (operation.role === "manager") {
      const eligibleRoute = chooseNext({ ...run, activeOperationId: null, pauseRequested: false, status: run.status === "paused" ? "running" : run.status }, view.currentArtifacts, view.pageBatch);
      const pending = view.pendingDecision as { kind?: string; subjectKind?: string; subjectId?: string; taskId?: string } | null;
      const eligibleTarget = eligibleRoute === "J13" ? (view.nextPageIllustrationWork?.kind === "image" ? view.nextPageIllustrationWork : null) : eligibleRoute === "J12" ? (view.nextPageBibleWork && "taskId" in view.nextPageBibleWork ? view.nextPageBibleWork : null) : eligibleRoute === "J09" || eligibleRoute === "J10" ?
        sheetTargets(run, view.currentArtifacts).find((target) => target.taskId === eligibleRoute && (pending?.kind === "revision" ? target.subjectId === pending.subjectId && target.subjectKind === pending.subjectKind : target.subjectId === view.nextSheetWork?.target.subjectId)) ?? null : null;
      return { role: "manager" as const, run: view, eligibleRoute, ...(eligibleTarget ? { eligibleTarget } : {}) };
    }
    if (operation.role === "tester") return { role: "tester" as const, bookletId: view.bookletId, brief: view.brief, persona: view.persona, currentArtifacts: view.currentArtifacts, pendingDecision: view.pendingDecision, activeDelegation: view.activeDelegation, creatorMessages: view.creatorMessages, eligibleTaskIds: [...configuredNarrativeTasks(run.configurationJson), ...configuredReferenceSheetTasks(run.configurationJson), ...(configuredPaginationTask(run.configurationJson) ? ["J11" as const] : []), ...(configuredPageBibleTask(run.configurationJson) ? ["J12" as const] : []), ...(configuredPageIllustrationTask(run.configurationJson) ? ["J13" as const] : [])] };
    if (operation.role === "specialist") {
      const enabled = configuredNarrativeTasks(run.configurationJson);
      const isSheet = operation.taskId === "J09" || operation.taskId === "J10";
      const isPagination = operation.taskId === "J11" && configuredPaginationTask(run.configurationJson);
      const isPageBible = operation.taskId === "J12" && configuredPageBibleTask(run.configurationJson);
      const pageWork = isPageBible ? pageBibleWork(run, view.currentArtifacts) : null;
      if (!operation.taskId || (isPageBible ? operation.subjectKind !== "page" || operation.subjectId !== pageWork?.subjectId :
        !isSheet && ((!isPagination && !enabled.includes(operation.taskId as NarrativeTask)) || operation.subjectKind !== "book" || operation.subjectId !== run.bookletId))) deny("Specialist task is outside this slice.");
      const taskId = operation.taskId as SpecialistTask;
      const currentTarget = view.currentArtifacts.find((item) => item.taskId === taskId && item.subjectKind === operation.subjectKind && item.subjectId === operation.subjectId) ?? null;
      if ((currentTarget?.currentVersionId ?? null) !== operation.expectedTargetVersionId) deny("Specialist target version changed.");
      const target = isSheet ? sheetTargets(run, view.currentArtifacts).find((item) => item.taskId === taskId && item.subjectKind === operation.subjectKind && item.subjectId === operation.subjectId) : null;
      const expectedSources = isPageBible && pageWork && "sourceVersionIds" in pageWork ? pageWork.sourceVersionIds : isPagination ? paginationSources(run, view.currentArtifacts) : isSheet ? target?.sourceVersionIds ?? null : currentApprovedSourceIds(taskId as NarrativeTask, view.currentArtifacts);
      if (!expectedSources || JSON.stringify(expectedSources) !== JSON.stringify(operation.dependencyVersionIds)) deny("Specialist source version changed.");
      const approvedSources = expectedSources.map((versionId) => {
        const artifact = view.currentArtifacts.find((item) => item.currentVersionId === versionId);
        const version = artifact?.versions.find((item) => item.id === versionId);
        if (!version) deny("Specialist approved source version is unavailable.");
        return { taskId: artifact!.taskId, ...((isPagination || isPageBible) ? { subjectKind: artifact!.subjectKind, subjectId: artifact!.subjectId } : {}), ...version };
      });
      const pending = view.pendingDecision as { kind?: string; taskId?: SpecialistTask; subjectKind?: string; subjectId?: string; artifactVersionId?: string } | null;
      const matchingRevision = pending?.kind === "revision" && pending.taskId === taskId && pending.artifactVersionId === operation.expectedTargetVersionId &&
        (!isPageBible || (pending.subjectKind === "page" && pending.subjectId === operation.subjectId)) ? pending : null;
      return { role: "specialist" as const, taskId, subjectKind: operation.subjectKind, subjectId: operation.subjectId, brief: view.brief, persona: view.persona, currentTarget, approvedSources, approvedUpstream: taskId === "J02" ? approvedSources[0] ?? null : null, matchingRevision, questionAnswers: await getQuestionAnswers(run._id, taskId, operation.subjectId) };
    }
    deny("Role context is not supported in this slice.");
  }

  const getExecutionView = (runId: string) => measurePhase({ runId }, "execution_view", () => getRunView(runId, "execution"));
  return { getRunView, getExecutionView, getOperationContext };
}
