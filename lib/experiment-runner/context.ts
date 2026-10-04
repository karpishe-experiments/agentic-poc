import { z } from "zod";
import type { Database } from "@/db/client";
import type { ArtifactDocument, ExperimentRunDocument } from "@/db/documents";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { opaqueIdSchema } from "@/lib/contracts/common";

const contextIdentity = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema, workflowRunId: opaqueIdSchema, parentWorkflowRunId: opaqueIdSchema.nullable() });
type Task = "J01" | "J02";
type NextTask = Task | "tester" | "slice_complete" | null;
function parseJson(value: string | null): unknown { return value === null ? null : JSON.parse(value) as unknown; }
function deny(message: string): never { throw new ExperimentRepositoryError("conflict", message); }

export function createExperimentContextService(database: Database) {
  const { experiment_runs: runs, experiment_operations: operations, experiment_delegations: delegations, artifacts, artifact_versions: versions, approvals, messages, booklets } = database.collections;

  async function projectArtifact(artifact: ArtifactDocument) {
    const rows = await versions.find({ artifactId: artifact._id }).sort({ versionNumber: 1 }).toArray();
    const approvalRows = await approvals.find({ experimentRunId: artifact.experimentRunId, artifactVersionId: { $in: rows.map((row) => row._id) } }).toArray();
    const approvalByVersion = new Map(approvalRows.map((row) => [row.artifactVersionId, row]));
    return {
      id: artifact._id, taskId: artifact.taskId as Task, subjectKind: artifact.subjectKind, subjectId: artifact.subjectId,
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
    const pending = parseJson(run.pendingDecisionJson) as { kind?: string; taskId?: Task } | null;
    if (pending?.kind === "question") return "tester";
    if (pending?.kind === "revision") return pending.taskId === "J01" || pending.taskId === "J02" ? pending.taskId : null;
    const concept = projected.find((item) => item.taskId === "J01");
    if (!concept) return "J01";
    if (concept.state === "needs_review") return "J01";
    if (concept.state !== "approved") return "tester";
    const outline = projected.find((item) => item.taskId === "J02");
    if (!outline || outline.state === "needs_review") return "J02";
    if (outline.state !== "approved") return "tester";
    return "slice_complete";
  }

  async function getRunView(runId: string) {
    const checked = opaqueIdSchema.parse(runId);
    const run = await runs.findOne({ _id: checked });
    if (!run) return null;
    const booklet = await booklets.findOne({ _id: run.bookletId });
    if (!booklet || booklet.experimentRunId !== run._id) deny("Run booklet is missing or mismatched.");
    const artifactRows = await artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId, taskId: { $in: ["J01", "J02"] } }).sort({ taskId: 1 }).toArray();
    const currentArtifacts = await Promise.all(artifactRows.map(projectArtifact));
    const grant = run.activeDelegationId ? await delegations.findOne({ _id: run.activeDelegationId, runId: run._id }) : null;
    const creatorRows = await messages.find({ experimentRunId: run._id, role: "user" }).sort({ sequence: 1 }).toArray();
    const operationRows = await operations.find({ runId: run._id }).sort({ createdAtMs: 1, _id: 1 }).toArray();
    return {
      runId: run._id, bookletId: run.bookletId, workingTitle: booklet.workingTitle, persona: run.persona, mode: run.mode,
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

  async function getQuestionAnswers(runId: string, taskId: Task) {
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
    const view = await getRunView(run._id);
    if (!view) deny("Run view is unavailable.");
    if (operation.role === "manager") return { role: "manager" as const, run: view, eligibleRoute: chooseNext({ ...run, activeOperationId: null, pauseRequested: false, status: run.status === "paused" ? "running" : run.status }, view.currentArtifacts) };
    if (operation.role === "tester") return { role: "tester" as const, bookletId: view.bookletId, brief: view.brief, persona: view.persona, currentArtifacts: view.currentArtifacts, pendingDecision: view.pendingDecision, activeDelegation: view.activeDelegation, creatorMessages: view.creatorMessages };
    if (operation.role === "specialist") {
      if (operation.taskId !== "J01" && operation.taskId !== "J02" || operation.subjectKind !== "book" || operation.subjectId !== run.bookletId) deny("Specialist task is outside this slice.");
      const currentTarget = view.currentArtifacts.find((item) => item.taskId === operation.taskId) ?? null;
      if ((currentTarget?.currentVersionId ?? null) !== operation.expectedTargetVersionId) deny("Specialist target version changed.");
      const approvedConcept = view.currentArtifacts.find((item) => item.taskId === "J01");
      const expectedSources = operation.taskId === "J02" && approvedConcept?.state === "approved" && approvedConcept.currentVersionId ? [approvedConcept.currentVersionId] : [];
      if (JSON.stringify(expectedSources) !== JSON.stringify(operation.dependencyVersionIds)) deny("Specialist source version changed.");
      const pending = view.pendingDecision as { kind?: string; taskId?: Task; artifactVersionId?: string } | null;
      const matchingRevision = pending?.kind === "revision" && pending.taskId === operation.taskId && pending.artifactVersionId === operation.expectedTargetVersionId ? pending : null;
      return { role: "specialist" as const, taskId: operation.taskId, brief: view.brief, persona: view.persona, currentTarget, approvedUpstream: operation.taskId === "J02" ? approvedConcept?.versions.find((item) => item.id === operation.dependencyVersionIds[0]) ?? null : null, matchingRevision, questionAnswers: await getQuestionAnswers(run._id, operation.taskId) };
    }
    deny("Role context is not supported in this slice.");
  }

  return { getRunView, getOperationContext };
}
