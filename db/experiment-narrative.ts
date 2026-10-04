import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ArtifactDocument, ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { CASES, type RoleResult, type NarrativeWarning } from "@/lib/contracts/experiment-runner";
import { ExperimentRepositoryError } from "@/db/experiment-repository";

type RunPatch = Partial<Pick<ExperimentRunDocument, "activeDelegationId" | "decisionSequence" | "pendingDecisionJson" | "textRevisions">>;
export type Materialized = { summary: Record<string, unknown>; runPatch: RunPatch };
const names = { J01: "book_concept_brief", J02: "story_outline" } as const;
function conflict(message: string): never { throw new ExperimentRepositoryError("conflict", message); }
function invalid(message: string): never { throw new ExperimentRepositoryError("invalid_result", message); }
function canonical(value: unknown) { return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item); }
function pending(run: ExperimentRunDocument): Record<string, unknown> | null { return run.pendingDecisionJson ? JSON.parse(run.pendingDecisionJson) as Record<string, unknown> : null; }
function targetQuery(run: ExperimentRunDocument, taskId: "J01" | "J02") { return { bookletId: run.bookletId, experimentRunId: run._id, taskId, subjectKind: "book" as const, subjectId: run.bookletId }; }

export async function prepareNarrativeContext(database: Database, session: ClientSession, run: ExperimentRunDocument, taskId: "J01" | "J02") {
  const target = await database.collections.artifacts.findOne(targetQuery(run, taskId), { session });
  const pendingDecision = pending(run);
  if (pendingDecision?.kind === "question") conflict("A creator answer is pending.");
  if (pendingDecision?.kind === "revision" && (pendingDecision.taskId !== taskId || pendingDecision.artifactVersionId !== target?.currentVersionId)) conflict("Pending revision belongs to another current artifact.");
  if (target?.currentVersionId && target.state !== "needs_review" && pendingDecision?.kind !== "revision") conflict("A new version requires a recorded creator revision.");
  const dependencyVersionIds: string[] = [];
  if (taskId === "J02") {
    const concept = await database.collections.artifacts.findOne(targetQuery(run, "J01"), { session });
    if (!concept || concept.state !== "approved" || !concept.currentVersionId) conflict("J02 requires a current approved J01 version.");
    dependencyVersionIds.push(concept.currentVersionId);
  }
  return { expectedTargetVersionId: target?.currentVersionId ?? null, dependencyVersionIds };
}

async function assertDependencies(database: Database, session: ClientSession, run: ExperimentRunDocument, operation: ExperimentOperationDocument) {
  if (operation.taskId !== "J01" && operation.taskId !== "J02") invalid("Unsupported narrative task.");
  const current = await database.collections.artifacts.findOne(targetQuery(run, operation.taskId), { session });
  if ((current?.currentVersionId ?? null) !== operation.expectedTargetVersionId) conflict("Narrative target changed after preparation.");
  const concept = operation.taskId === "J02" ? await database.collections.artifacts.findOne(targetQuery(run, "J01"), { session }) : null;
  const expected = concept?.state === "approved" && concept.currentVersionId ? [concept.currentVersionId] : [];
  if (canonical(expected) !== canonical(operation.dependencyVersionIds)) conflict("Approved upstream version changed after preparation.");
  return current;
}

async function approveVersion(database: Database, session: ClientSession, run: ExperimentRunDocument, versionId: string, origin: "explicit" | "delegated", testerDecisionId: string, delegationId: string | null, reviewGroupId: string | null, nowMs: number) {
  const version = await database.collections.artifact_versions.findOne({ _id: versionId }, { session });
  if (!version) invalid("Approval version does not exist.");
  const artifact = await database.collections.artifacts.findOne({ _id: version.artifactId }, { session });
  if (!artifact || artifact.experimentRunId !== run._id || artifact.bookletId !== run.bookletId || artifact.subjectKind !== "book" || artifact.subjectId !== run.bookletId || artifact.currentVersionId !== versionId) invalid("Approval target is not the current run artifact.");
  if (artifact.taskId === "J02") {
    const concept = await database.collections.artifacts.findOne(targetQuery(run, "J01"), { session });
    const dependencies = JSON.parse(version.dependencyVersionIdsJson) as string[];
    if (!concept || concept.state !== "approved" || !concept.currentVersionId || canonical(dependencies) !== canonical([concept.currentVersionId])) invalid("Approval dependencies are not current.");
  }
  if (artifact.taskId === "J01") {
    const content = JSON.parse(version.contentJson) as { audience?: { ageBand?: string } };
    const expected = { playful_kid: "6-8", enthusiast_parent: "3-5", professional_creator: "9-12" }[run.persona];
    if (origin === "delegated" && content.audience?.ageBand !== expected) invalid("Brief intent conflict needs explicit tester review.");
  }
  const existing = await database.collections.approvals.findOne({ experimentRunId: run._id, artifactVersionId: versionId }, { session });
  if (existing) return existing._id;
  const approvalId = randomUUID();
  await database.collections.approvals.insertOne({ _id: approvalId, bookletId: run.bookletId, artifactVersionId: versionId, scope: "artifact", subjectKey: null, action: "approve", origin, sourceApprovalId: null, cardResponseId: null, qualityReviewId: null, experimentRunId: run._id, testerDecisionId, delegationId, reviewGroupId, createdAtMs: nowMs }, { session });
  await database.collections.artifacts.updateOne({ _id: artifact._id, currentVersionId: versionId }, { $set: { state: "approved", updatedAtMs: nowMs } }, { session });
  await database.collections.booklets.updateOne({ _id: run.bookletId }, { $set: { currentStage: artifact.taskId === "J01" ? "J02" : "J03", updatedAtMs: nowMs } }, { session });
  return approvalId;
}

export async function materializeNarrativeResult(database: Database, session: ClientSession, run: ExperimentRunDocument, operation: ExperimentOperationDocument, result: RoleResult, warnings: NarrativeWarning[], nowMs: number): Promise<Materialized> {
  const summary: Record<string, unknown> = {};
  const runPatch: RunPatch = {};
  if (result.kind === "proposal") {
    const taskId = result.payload.taskId;
    if (operation.role !== "specialist" || operation.taskId !== taskId || operation.subjectKind !== "book" || operation.subjectId !== run.bookletId) invalid("Proposal does not match the owning specialist operation.");
    const target = await assertDependencies(database, session, run, operation);
    const artifactId = target?._id ?? randomUUID();
    const versionId = randomUUID();
    if (!target) await database.collections.artifacts.insertOne({ _id: artifactId, bookletId: run.bookletId, artifactType: names[taskId], state: "draft", currentVersionId: null, taskId, subjectKind: "book", subjectId: run.bookletId, experimentRunId: run._id, createdAtMs: nowMs, updatedAtMs: nowMs }, { session });
    const previousNumber = target?.currentVersionId ? (await database.collections.artifact_versions.findOne({ _id: target.currentVersionId }, { session }))?.versionNumber ?? 0 : 0;
    const intentWarnings = [...warnings];
    if (taskId === "J01") {
      const expected = { playful_kid: "6-8", enthusiast_parent: "3-5", professional_creator: "9-12" }[run.persona];
      if ((result.payload.content as { audience?: { ageBand?: string } }).audience?.ageBand !== expected) intentWarnings.push({ field: "audience.ageBand", message: "Audience differs from the fixed creator brief; explicit tester review is required." });
    }
    await database.collections.artifact_versions.insertOne({ _id: versionId, artifactId, versionNumber: previousNumber + 1, schemaVersion: "2", contentJson: canonical(result.payload.content), dependencyVersionIdsJson: canonical(operation.dependencyVersionIds), createdBy: "agent", sourceVersionId: target?.currentVersionId ?? null, sourceExecutionBatchId: null, sourceOperationId: operation._id, warningsJson: canonical(intentWarnings), createdAtMs: nowMs }, { session });
    for (const upstreamVersionId of operation.dependencyVersionIds) await database.collections.artifact_dependencies.insertOne({ _id: randomUUID(), downstreamVersionId: versionId, upstreamVersionId, createdAtMs: nowMs }, { session });
    await database.collections.artifacts.updateOne({ _id: artifactId }, { $set: { currentVersionId: versionId, state: "draft", updatedAtMs: nowMs } }, { session });
    if (taskId === "J01") {
      await database.collections.booklets.updateOne({ _id: run.bookletId }, { $set: { workingTitle: (result.payload.content as { title: string }).title, currentStage: "J01", updatedAtMs: nowMs } }, { session });
      if (target?.currentVersionId) await database.collections.artifacts.updateMany({ ...targetQuery(run, "J02"), state: { $ne: "needs_review" } }, { $set: { state: "needs_review", updatedAtMs: nowMs } }, { session });
    } else await database.collections.booklets.updateOne({ _id: run.bookletId }, { $set: { currentStage: "J02", updatedAtMs: nowMs } }, { session });
    const currentPending = pending(run);
    if (currentPending?.kind === "revision" && currentPending.taskId === taskId && currentPending.artifactVersionId === (target?.currentVersionId ?? null)) runPatch.pendingDecisionJson = null;
    let approvalId: string | null = null;
    if (run.activeDelegationId && !intentWarnings.some((warning) => warning.field === "audience.ageBand")) {
      const grant = await database.collections.experiment_delegations.findOne({ _id: run.activeDelegationId, runId: run._id }, { session });
      if (grant && !grant.revokedAtMs && !grant.supersededById && grant.subjectId === run.bookletId && grant.taskIds.includes(taskId)) approvalId = await approveVersion(database, session, run, versionId, "delegated", grant.testerDecisionId, grant._id, null, nowMs);
    }
    summary.artifactId = artifactId; summary.versionId = versionId; summary.approvalId = approvalId; summary.warnings = intentWarnings;
    return { summary, runPatch };
  }
  if (result.kind === "ask" || result.kind === "clarification") {
    const current = pending(run);
    if (current?.kind === "question") invalid("An unanswered creator decision is already pending.");
    if (current?.kind === "revision" && (result.kind !== "clarification" || operation.role !== "specialist" || operation.taskId !== current.taskId || operation.expectedTargetVersionId !== current.artifactVersionId)) invalid("Clarification must belong to the pending revision owner.");
    runPatch.pendingDecisionJson = canonical({ kind: "question", questionId: operation._id, taskId: operation.taskId, question: result.payload.question, resumeRevision: current?.kind === "revision" ? current : null });
    summary.questionId = operation._id;
  } else if (result.kind === "delegate") {
    if (result.payload.subjectId !== run.bookletId || result.payload.subjectKind !== "book" || (operation.taskId && operation.taskId !== result.payload.taskId)) invalid("Manager delegation target is not eligible.");
    try { await prepareNarrativeContext(database, session, run, result.payload.taskId); }
    catch { invalid("Manager delegation target is not currently eligible."); }
    summary.delegatedTaskId = result.payload.taskId;
  } else if (result.kind === "decision") {
    const decision = result.payload.decision;
    const sequence = run.decisionSequence + 1;
    const decisionId = operation._id;
    if (decision.action === "delegate") {
      if (decision.subjectId !== run.bookletId) invalid("Delegation subject differs from the booklet.");
      const grantId = randomUUID();
      if (run.activeDelegationId) await database.collections.experiment_delegations.updateOne({ _id: run.activeDelegationId, runId: run._id, supersededById: null }, { $set: { supersededById: grantId } }, { session });
      await database.collections.experiment_delegations.insertOne({ _id: grantId, runId: run._id, testerDecisionId: decisionId, taskIds: decision.taskIds, subjectKind: "book", subjectId: run.bookletId, action: "approve", effectiveSequence: sequence, supersededById: null, revokedAtMs: null, createdAtMs: nowMs }, { session });
      runPatch.activeDelegationId = grantId;
      for (const taskId of ["J01", "J02"] as const) if (decision.taskIds.includes(taskId)) {
        const artifact = await database.collections.artifacts.findOne(targetQuery(run, taskId), { session });
        if (artifact?.currentVersionId && artifact.state !== "approved") {
          try { await approveVersion(database, session, run, artifact.currentVersionId, "delegated", decisionId, grantId, null, nowMs); }
          catch (error) { if (!(error instanceof ExperimentRepositoryError && error.code === "invalid_result")) throw error; }
        }
      }
      summary.delegationId = grantId;
    } else if (decision.action === "revoke_delegation") {
      if (run.activeDelegationId !== decision.delegationId) invalid("Delegation is not the current grant.");
      await database.collections.experiment_delegations.updateOne({ _id: decision.delegationId, runId: run._id, revokedAtMs: null }, { $set: { revokedAtMs: nowMs } }, { session });
      runPatch.activeDelegationId = null;
      summary.revokedDelegationId = decision.delegationId;
    } else if (decision.action === "approve") {
      const groupId = decision.versionIds.length > 1 ? randomUUID() : null;
      const versions = await database.collections.artifact_versions.find({ _id: { $in: decision.versionIds } }, { session }).toArray();
      const artifactByVersion = new Map<string, ArtifactDocument>();
      for (const version of versions) {
        const artifact = await database.collections.artifacts.findOne({ _id: version.artifactId }, { session });
        if (artifact) artifactByVersion.set(version._id, artifact);
      }
      const ordered = [...decision.versionIds].sort((a, b) => (artifactByVersion.get(a)?.taskId === "J01" ? -1 : 0) - (artifactByVersion.get(b)?.taskId === "J01" ? -1 : 0));
      const approvalIds: string[] = [];
      for (const versionId of ordered) approvalIds.push(await approveVersion(database, session, run, versionId, "explicit", decisionId, null, groupId, nowMs));
      summary.approvalIds = approvalIds; summary.reviewGroupId = groupId;
    } else if (decision.action === "answer") {
      const current = pending(run);
      if (current?.kind !== "question" || current.questionId !== decision.questionId) invalid("Answer does not match the pending question.");
      runPatch.pendingDecisionJson = current.resumeRevision ? canonical(current.resumeRevision) : null;
      summary.answeredQuestionId = decision.questionId;
    } else {
      const current = pending(run);
      if (current) invalid("Another creator decision is pending.");
      const artifact = await database.collections.artifacts.findOne(targetQuery(run, decision.taskId), { session });
      if (!artifact || artifact.currentVersionId !== decision.artifactVersionId) invalid("Revision target is not current.");
      if (run.textRevisions >= CASES[run.persona].textRevisionLimit) invalid("Text revision allowance is exhausted.");
      runPatch.textRevisions = run.textRevisions + 1;
      runPatch.pendingDecisionJson = canonical({ kind: "revision", taskId: decision.taskId, artifactVersionId: decision.artifactVersionId, instruction: decision.instruction });
      summary.revisionTaskId = decision.taskId;
    }
    runPatch.decisionSequence = sequence;
    await database.collections.messages.insertOne({ _id: decisionId, bookletId: run.bookletId, sequence, role: "user", schemaVersion: "2", uiMessageJson: canonical({ type: "tester_decision", decision }), experimentRunId: run._id, operationId: operation._id, createdAtMs: nowMs }, { session });
  }
  return { summary, runPatch };
}
