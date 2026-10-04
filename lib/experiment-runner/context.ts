import { z } from "zod";
import type { Database } from "@/db/client";
import type { ArtifactDocument, ExperimentRunDocument } from "@/db/documents";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { createExperimentImageRepository } from "@/db/experiment-images";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { configuredNarrativeTasks, currentApprovedSourceIds, NARRATIVE_DEPENDENCIES, type NarrativeTask } from "@/lib/experiment-runner/narrative-tasks";

const contextIdentity = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema, workflowRunId: opaqueIdSchema, parentWorkflowRunId: opaqueIdSchema.nullable() });
type NextTask = NarrativeTask | "tester" | "slice_complete" | null;
function parseJson(value: string | null): unknown { return value === null ? null : JSON.parse(value) as unknown; }
function deny(message: string): never { throw new ExperimentRepositoryError("conflict", message); }

export function createExperimentContextService(database: Database) {
  const { experiment_runs: runs, experiment_operations: operations, experiment_delegations: delegations, artifacts, artifact_versions: versions, approvals, messages, booklets } = database.collections;

  async function projectArtifact(artifact: ArtifactDocument) {
    const rows = await versions.find({ artifactId: artifact._id }).sort({ versionNumber: 1 }).toArray();
    const approvalRows = await approvals.find({ experimentRunId: artifact.experimentRunId, artifactVersionId: { $in: rows.map((row) => row._id) } }).toArray();
    const approvalByVersion = new Map(approvalRows.map((row) => [row.artifactVersionId, row]));
    return {
      id: artifact._id, taskId: artifact.taskId as NarrativeTask, subjectKind: artifact.subjectKind, subjectId: artifact.subjectId,
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

  function chooseNext(run: ExperimentRunDocument, projected: Awaited<ReturnType<typeof projectArtifact>>[]): NextTask {
    if (run.pauseRequested || run.status === "paused" || run.status === "blocked" || run.status === "failed" || run.status === "completed" || run.activeOperationId) return null;
    const enabled = configuredNarrativeTasks(run.configurationJson);
    const pending = parseJson(run.pendingDecisionJson) as { kind?: string; taskId?: NarrativeTask } | null;
    if (pending?.kind === "question") return "tester";
    if (pending?.kind === "revision") return pending.taskId && enabled.includes(pending.taskId) && currentApprovedSourceIds(pending.taskId, projected) !== null ? pending.taskId : null;
    for (const task of enabled) {
      const current = projected.find((item) => item.taskId === task);
      if ((!current || current.state === "needs_review") && currentApprovedSourceIds(task, projected) !== null) return task;
    }
    if (projected.some((item) => enabled.includes(item.taskId) && item.state === "draft")) return "tester";
    return enabled.every((task) => projected.some((item) => item.taskId === task && item.state === "approved" && item.currentVersionId)) ? "slice_complete" : null;
  }

  async function getRunView(runId: string) {
    const checked = opaqueIdSchema.parse(runId);
    const run = await runs.findOne({ _id: checked });
    if (!run) return null;
    const booklet = await booklets.findOne({ _id: run.bookletId });
    if (!booklet || booklet.experimentRunId !== run._id) deny("Run booklet is missing or mismatched.");
    const enabled = configuredNarrativeTasks(run.configurationJson);
    const artifactRows = await artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId, subjectKind: "book", subjectId: run.bookletId, taskId: { $in: [...enabled] } }).sort({ taskId: 1 }).toArray();
    if (new Set(artifactRows.map((row) => row.taskId)).size !== artifactRows.length) deny("Run has duplicate narrative task artifacts.");
    const currentArtifacts = await Promise.all(artifactRows.map(projectArtifact));
    const grant = run.activeDelegationId ? await delegations.findOne({ _id: run.activeDelegationId, runId: run._id }) : null;
    const creatorRows = await messages.find({ experimentRunId: run._id, role: "user" }).sort({ sequence: 1 }).toArray();
    const operationRows = await operations.find({ runId: run._id }).sort({ createdAtMs: 1, _id: 1 }).toArray();
    return {
      runId: run._id, predecessorRunId: run.predecessorRunId, bookletId: run.bookletId, workingTitle: booklet.workingTitle, persona: run.persona, mode: run.mode,
      brief: run.brief, status: run.status, revision: run.revision, pauseRequested: run.pauseRequested,
      evaluationStatus: run.evaluationStatus, counters: { ...run.counters }, limits: { ...run.limits },
      safeFailure: run.safeFailure, activeOperationId: run.activeOperationId,
      createdAtMs: run.createdAtMs, updatedAtMs: run.updatedAtMs,
      pendingDecision: parseJson(run.pendingDecisionJson),
      activeDelegation: grant && !grant.revokedAtMs && !grant.supersededById ? { id: grant._id, taskIds: [...grant.taskIds], subjectKind: grant.subjectKind, subjectId: grant.subjectId, testerDecisionId: grant.testerDecisionId, effectiveSequence: grant.effectiveSequence } : null,
      currentArtifacts,
      creatorMessages: creatorRows.map((row) => ({ id: row._id, sequence: row.sequence, content: parseJson(row.uiMessageJson), createdAtMs: row.createdAtMs })),
      operationHistory: operationRows.map((row) => ({ id: row._id, role: row.role, taskId: row.taskId, state: row.state,
        workflowRunId: row.workflowRunId, parentWorkflowRunId: row.parentWorkflowRunId,
        verifiedWorkflowId: row.verifiedWorkflowId ?? null,
        reservationCount: row.reservationCount, safeFailure: row.safeFailure,
        createdAtMs: row.createdAtMs, updatedAtMs: row.updatedAtMs })),
      nextNarrativeTask: chooseNext(run, currentArtifacts),
    };
  }

  async function getQuestionAnswers(runId: string, taskId: NarrativeTask) {
    const questionRows = await operations.find({ runId, state: "succeeded", taskId: { $in: [null, taskId] } }).sort({ createdAtMs: 1, _id: 1 }).toArray();
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

  async function getOperationContext(raw: unknown) {
    const identity = contextIdentity.parse(raw);
    const run = await runs.findOne({ _id: identity.runId });
    const operation = await operations.findOne({ _id: identity.operationId, runId: identity.runId });
    if (!run || !operation || run.activeOperationId !== operation._id || (operation.state !== "started" && operation.state !== "unknown") || operation.workflowRunId !== identity.workflowRunId || operation.parentWorkflowRunId !== identity.parentWorkflowRunId) deny("Operation claim identity is not current.");
    if (operation.role === "image") {
      const imageRequest = await createExperimentImageRepository(database).authorizeFixture({ ...identity, inputFingerprint: operation.inputFingerprint });
      return { role: "image" as const, mode: "simulated" as const, inputFingerprint: operation.inputFingerprint, imageRequest };
    }
    const view = await getRunView(run._id);
    if (!view) deny("Run view is unavailable.");
    if (operation.role === "manager") return { role: "manager" as const, run: view, eligibleRoute: chooseNext({ ...run, activeOperationId: null, pauseRequested: false, status: run.status === "paused" ? "running" : run.status }, view.currentArtifacts) };
    if (operation.role === "tester") return { role: "tester" as const, bookletId: view.bookletId, brief: view.brief, persona: view.persona, currentArtifacts: view.currentArtifacts, pendingDecision: view.pendingDecision, activeDelegation: view.activeDelegation, creatorMessages: view.creatorMessages, eligibleTaskIds: [...configuredNarrativeTasks(run.configurationJson)] };
    if (operation.role === "specialist") {
      const enabled = configuredNarrativeTasks(run.configurationJson);
      if (!operation.taskId || !enabled.includes(operation.taskId as NarrativeTask) || operation.subjectKind !== "book" || operation.subjectId !== run.bookletId) deny("Specialist task is outside this slice.");
      const taskId = operation.taskId as NarrativeTask;
      const currentTarget = view.currentArtifacts.find((item) => item.taskId === taskId) ?? null;
      if ((currentTarget?.currentVersionId ?? null) !== operation.expectedTargetVersionId) deny("Specialist target version changed.");
      const expectedSources = currentApprovedSourceIds(taskId, view.currentArtifacts);
      if (expectedSources === null || JSON.stringify(expectedSources) !== JSON.stringify(operation.dependencyVersionIds)) deny("Specialist source version changed.");
      const approvedSources = NARRATIVE_DEPENDENCIES[taskId].map((dependency, index) => {
        const artifact = view.currentArtifacts.find((item) => item.taskId === dependency);
        const version = artifact?.versions.find((item) => item.id === expectedSources[index]);
        if (!version) deny("Specialist approved source version is unavailable.");
        return { taskId: dependency, ...version };
      });
      const pending = view.pendingDecision as { kind?: string; taskId?: NarrativeTask; artifactVersionId?: string } | null;
      const matchingRevision = pending?.kind === "revision" && pending.taskId === taskId && pending.artifactVersionId === operation.expectedTargetVersionId ? pending : null;
      return { role: "specialist" as const, taskId, brief: view.brief, persona: view.persona, currentTarget, approvedSources, approvedUpstream: taskId === "J02" ? approvedSources[0] ?? null : null, matchingRevision, questionAnswers: await getQuestionAnswers(run._id, taskId) };
    }
    deny("Role context is not supported in this slice.");
  }

  return { getRunView, getOperationContext };
}
