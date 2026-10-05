import { createHash, randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ArtifactDocument, ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { CASES, MAX_DRAFT_LIST_CONTENT_BYTES, type SpecialistTask, type RoleResult, type NarrativeWarning } from "@/lib/contracts/experiment-runner";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { configuredNarrativeTasks, currentApprovedSourceIds, isNarrativeTask, NARRATIVE_DEPENDENCIES } from "@/lib/experiment-runner/narrative-tasks";
import { materializeNarrativeContent } from "@/db/experiment-narrative-content";
import { parseReferenceProposal } from "@/lib/contracts/experiment-references";
import type { AssetStore } from "@/lib/assets/asset-store";
import { createAssetStore } from "@/lib/assets/create-asset-store";
import { configuredReferenceSheetTasks, referenceSheetTargets } from "@/lib/experiment-runner/reference-targets";
import { createExperimentSheetAssembly } from "@/db/experiment-sheets";

type RunPatch = Partial<Pick<ExperimentRunDocument, "activeDelegationId" | "decisionSequence" | "pendingDecisionJson" | "textRevisions">>;
export type Materialized = { summary: Record<string, unknown>; runPatch: RunPatch };
const names = { J01: "book_concept_brief", J02: "story_outline", J03: "draft_character_list", J04: "draft_location_list", J05: "page_by_page_manuscript", J06: "final_character_list", J07: "final_location_list", J08: "visual_style_package", J09: "character_sheet_package", J10: "location_sheet_package" } as const;
function conflict(message: string): never { throw new ExperimentRepositoryError("conflict", message); }
function invalid(message: string): never { throw new ExperimentRepositoryError("invalid_result", message); }
function canonical(value: unknown) { return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item); }
function pending(run: ExperimentRunDocument): Record<string, unknown> | null { return run.pendingDecisionJson ? JSON.parse(run.pendingDecisionJson) as Record<string, unknown> : null; }
function targetQuery(run: ExperimentRunDocument, taskId: SpecialistTask, subjectKind: ExperimentOperationDocument["subjectKind"] = "book", subjectId = run.bookletId) { return { bookletId: run.bookletId, experimentRunId: run._id, taskId, subjectKind, subjectId }; }

function enabled(run: ExperimentRunDocument, task: unknown): task is SpecialistTask {
  return isNarrativeTask(task) ? configuredNarrativeTasks(run.configurationJson).includes(task) :
    (task === "J09" || task === "J10") && configuredReferenceSheetTasks(run.configurationJson).includes(task);
}

export async function currentSheetTargets(database: Database, session: ClientSession, run: ExperimentRunDocument) {
  async function source(taskId: "J06" | "J07" | "J08") {
    const rows = await database.collections.artifacts.find(targetQuery(run, taskId), { session }).toArray();
    const artifact = rows.length === 1 ? rows[0] : null;
    if (!artifact || artifact.state !== "approved" || !artifact.currentVersionId) conflict("Sheet sources are not current and approved.");
    const version = await database.collections.artifact_versions.findOne({ _id: artifact.currentVersionId, artifactId: artifact._id }, { session });
    const approval = await database.collections.approvals.findOne({ experimentRunId: run._id, bookletId: run.bookletId, artifactVersionId: artifact.currentVersionId, action: "approve", scope: "artifact" }, { session });
    if (!version || !approval) conflict("Sheet sources have incomplete saved approvals.");
    return { versionId: version._id, content: JSON.parse(version.contentJson) as unknown };
  }
  return referenceSheetTargets({ characters: await source("J06"), locations: await source("J07"), style: await source("J08") });
}

async function updateStage(database: Database, session: ClientSession, run: ExperimentRunDocument, nowMs: number) {
  const tasks = configuredNarrativeTasks(run.configurationJson);
  const artifacts = await database.collections.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId, subjectKind: "book", subjectId: run.bookletId }, { session }).toArray();
  let stage: string = tasks.find((task) => !artifacts.some((item) => item.taskId === task && item.state === "approved")) ?? (tasks.length === 2 ? "J03" : tasks.includes("J08") ? "J09" : "J08");
  if (tasks.every((task) => artifacts.some((item) => item.taskId === task && item.state === "approved")) && configuredReferenceSheetTasks(run.configurationJson).length) {
    const targets = await currentSheetTargets(database, session, run);
    const sheets = await database.collections.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId, taskId: { $in: ["J09", "J10"] } }, { session }).toArray();
    stage = targets.find((target) => !sheets.some((item) => item.taskId === target.taskId && item.subjectKind === target.subjectKind && item.subjectId === target.subjectId && item.state === "approved"))?.taskId ?? "J11";
  }
  await database.collections.booklets.updateOne({ _id: run.bookletId }, { $set: { currentStage: stage, updatedAtMs: nowMs } }, { session });
}

async function invalidateDescendants(database: Database, session: ClientSession, run: ExperimentRunDocument, versionId: string, nowMs: number) {
  const seen = new Set([versionId]);
  let frontier = [versionId];
  while (frontier.length) {
    const edges = await database.collections.artifact_dependencies.find({ upstreamVersionId: { $in: frontier } }, { session }).toArray();
    frontier = edges.map((edge) => edge.downstreamVersionId).filter((id) => !seen.has(id));
    frontier.forEach((id) => seen.add(id));
  }
  seen.delete(versionId);
  if (seen.size) await database.collections.artifacts.updateMany({ experimentRunId: run._id, bookletId: run.bookletId, currentVersionId: { $in: [...seen] } }, { $set: { state: "needs_review", updatedAtMs: nowMs } }, { session });
}

async function approvedSourceIds(database: Database, session: ClientSession, run: ExperimentRunDocument, taskId: SpecialistTask, subjectKind: ExperimentOperationDocument["subjectKind"] = "book", subjectId = run.bookletId) {
  if (taskId === "J09" || taskId === "J10") {
    const target = (await currentSheetTargets(database, session, run)).find((item) => item.taskId === taskId && item.subjectKind === subjectKind && item.subjectId === subjectId);
    return target?.sourceVersionIds ?? null;
  }
  if (subjectKind !== "book" || subjectId !== run.bookletId) return null;
  const sources = await database.collections.artifacts.find({
    bookletId: run.bookletId, experimentRunId: run._id, subjectKind: "book", subjectId: run.bookletId,
    taskId: { $in: [...NARRATIVE_DEPENDENCIES[taskId]] },
  }, { session }).toArray();
  return currentApprovedSourceIds(taskId, sources);
}

export async function prepareNarrativeContext(database: Database, session: ClientSession, run: ExperimentRunDocument, taskId: SpecialistTask, subjectKind: ExperimentOperationDocument["subjectKind"] = "book", subjectId = run.bookletId) {
  if (!enabled(run, taskId)) conflict("Narrative task is outside the saved configuration.");
  const target = await database.collections.artifacts.findOne(targetQuery(run, taskId, subjectKind, subjectId), { session });
  const pendingDecision = pending(run);
  if (pendingDecision?.kind === "question") conflict("A creator answer is pending.");
  if (pendingDecision?.kind === "revision" && (pendingDecision.taskId !== taskId || pendingDecision.artifactVersionId !== target?.currentVersionId)) conflict("Pending revision belongs to another current artifact.");
  if (target?.currentVersionId && target.state !== "needs_review" && pendingDecision?.kind !== "revision") conflict("A new version requires a recorded creator revision.");
  const dependencyVersionIds = await approvedSourceIds(database, session, run, taskId, subjectKind, subjectId);
  if (dependencyVersionIds === null) conflict(`${taskId} requires current approved source versions.`);
  return { expectedTargetVersionId: target?.currentVersionId ?? null, dependencyVersionIds };
}

async function assertDependencies(database: Database, session: ClientSession, run: ExperimentRunDocument, operation: ExperimentOperationDocument) {
  if (!enabled(run, operation.taskId)) invalid("Unsupported narrative task.");
  const current = await database.collections.artifacts.findOne(targetQuery(run, operation.taskId, operation.subjectKind, operation.subjectId), { session });
  if ((current?.currentVersionId ?? null) !== operation.expectedTargetVersionId) conflict("Narrative target changed after preparation.");
  const expected = await approvedSourceIds(database, session, run, operation.taskId, operation.subjectKind, operation.subjectId);
  if (expected === null || canonical(expected) !== canonical(operation.dependencyVersionIds)) conflict("Approved upstream version changed after preparation.");
  return current;
}

async function approveVersion(database: Database, session: ClientSession, run: ExperimentRunDocument, versionId: string, origin: "explicit" | "delegated", testerDecisionId: string, delegationId: string | null, reviewGroupId: string | null, nowMs: number, assetStore: () => AssetStore) {
  const version = await database.collections.artifact_versions.findOne({ _id: versionId }, { session });
  if (!version) invalid("Approval version does not exist.");
  const artifact = await database.collections.artifacts.findOne({ _id: version.artifactId }, { session });
  if (!artifact || artifact.experimentRunId !== run._id || artifact.bookletId !== run.bookletId || artifact.currentVersionId !== versionId) invalid("Approval target is not the current run artifact.");
  if (!enabled(run, artifact.taskId)) invalid("Approval task is outside the saved configuration.");
  if (artifact.state === "needs_review") invalid("Stale content requires an updated proposal before approval.");
  {
    const expected = await approvedSourceIds(database, session, run, artifact.taskId, artifact.subjectKind ?? "book", artifact.subjectId ?? run.bookletId);
    const dependencies = JSON.parse(version.dependencyVersionIdsJson) as string[];
    if (artifact.taskId === "J09" || artifact.taskId === "J10") {
      if (expected === null) invalid("Sheet approval target is not eligible.");
      if (version.createdBy !== "application" || !version.sourceVersionId) invalid("Sheet approval requires a saved image assembly, not a textual draft.");
      await createExperimentSheetAssembly({ database, store: assetStore() }).verifyVersion({ runId: run._id, versionId }, session);
    } else if (artifact.taskId === "J08") {
      let assembled;
      try { assembled = parseReferenceProposal("J08", "assembled", JSON.parse(version.contentJson)).content; }
      catch { invalid("Style approval requires two assembled samples, not a textual draft."); }
      if (version.createdBy !== "application" || version.sourceVersionId !== assembled.draftStyleVersionId) invalid("Style assembly identity is invalid.");
      if (expected === null || canonical(dependencies) !== canonical([assembled.draftStyleVersionId, ...expected])) invalid("Approval dependencies are not current.");
      const draft = await database.collections.artifact_versions.findOne({ _id: assembled.draftStyleVersionId, artifactId: artifact._id }, { session });
      const edges = await database.collections.artifact_dependencies.find({ downstreamVersionId: versionId }, { session }).toArray();
      if (!draft || canonical(JSON.parse(draft.dependencyVersionIdsJson)) !== canonical(expected) ||
          canonical(edges.map((edge) => edge.upstreamVersionId).sort()) !== canonical([...dependencies].sort())) invalid("Style assembly sources are incomplete.");
      for (const sample of assembled.samples) {
        const operation = await database.collections.experiment_operations.findOne({ _id: sample.build.operationId, runId: run._id }, { session });
        const asset = await database.collections.assets.findOne({ _id: sample.build.assetId, bookletId: run.bookletId }, { session });
        if (!operation || operation.role !== "image" || operation.taskId !== "J08" || operation.subjectId !== run.bookletId ||
            operation.state !== "succeeded" || !asset || asset._id !== operation._id || asset.kind !== "style_preview") invalid("Style sample evidence is missing.");
        const result = JSON.parse(operation.resultJson ?? "null") as { assetId?: string; uri?: string; sha256?: string } | null;
        const request = JSON.parse(operation.imageRequestJson ?? "null") as { prompt?: string; sourceVersionIds?: string[] } | null;
        if (result?.assetId !== asset._id || result.uri !== asset.uri || result.sha256 !== operation.resultDigest ||
            request?.prompt !== sample.build.prompt || canonical(request.sourceVersionIds) !== canonical(sample.build.sourceVersionIds)) invalid("Style sample evidence changed after assembly.");
        try {
          const metadata = JSON.parse(asset.metadataJson ?? "null") as { sha256?: string; byteLength?: number } | null;
          const store = assetStore();
          if (!await store.exists(asset.uri)) invalid("Style sample bytes are missing.");
          const bytes = await store.get(asset.uri);
          if (metadata?.sha256 !== result.sha256 || bytes.byteLength !== metadata.byteLength ||
              createHash("sha256").update(bytes).digest("hex") !== result.sha256) invalid("Style sample bytes are corrupt.");
        } catch { invalid("Style sample storage verification failed."); }
      }
    } else if (expected === null || canonical(dependencies) !== canonical(expected)) invalid("Approval dependencies are not current.");
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
  await updateStage(database, session, run, nowMs);
  return approvalId;
}

export async function materializeNarrativeResult(database: Database, session: ClientSession, run: ExperimentRunDocument, operation: ExperimentOperationDocument, result: RoleResult, warnings: NarrativeWarning[], nowMs: number, assetStore: () => AssetStore = createAssetStore): Promise<Materialized> {
  const summary: Record<string, unknown> = {};
  const runPatch: RunPatch = {};
  if (result.kind === "proposal") {
    const taskId = result.payload.taskId;
    if (operation.role !== "specialist" || operation.taskId !== taskId) invalid("Proposal does not match the owning specialist operation.");
    const target = await assertDependencies(database, session, run, operation);
    const artifactId = target?._id ?? randomUUID();
    const versionId = randomUUID();
    if (!target) await database.collections.artifacts.insertOne({ _id: artifactId, bookletId: run.bookletId, artifactType: names[taskId], state: "draft", currentVersionId: null, taskId, subjectKind: operation.subjectKind, subjectId: operation.subjectId, experimentRunId: run._id, createdAtMs: nowMs, updatedAtMs: nowMs }, { session });
    const previous = target?.currentVersionId ? await database.collections.artifact_versions.findOne({ _id: target.currentVersionId }, { session }) : null;
    if (target?.currentVersionId && !previous) invalid("Current narrative version is missing.");
    const previousNumber = previous?.versionNumber ?? 0;
    const content = await materializeNarrativeContent(database, session, operation, taskId, result.payload.content, previous ? JSON.parse(previous.contentJson) as unknown : null);
    if (taskId !== "J01" && taskId !== "J02" && new TextEncoder().encode(canonical(content)).byteLength > MAX_DRAFT_LIST_CONTENT_BYTES) invalid("Stored narrative content exceeds the 512 KiB limit.");
    const intentWarnings = [...warnings];
    if (taskId === "J01") {
      const expected = { playful_kid: "6-8", enthusiast_parent: "3-5", professional_creator: "9-12" }[run.persona];
      if ((result.payload.content as { audience?: { ageBand?: string } }).audience?.ageBand !== expected) intentWarnings.push({ field: "audience.ageBand", message: "Audience differs from the fixed creator brief; explicit tester review is required." });
    }
    await database.collections.artifact_versions.insertOne({ _id: versionId, artifactId, versionNumber: previousNumber + 1, schemaVersion: "2", contentJson: canonical(content), dependencyVersionIdsJson: canonical(operation.dependencyVersionIds), createdBy: "agent", sourceVersionId: target?.currentVersionId ?? null, sourceExecutionBatchId: null, sourceOperationId: operation._id, warningsJson: canonical(intentWarnings), createdAtMs: nowMs }, { session });
    for (const upstreamVersionId of operation.dependencyVersionIds) await database.collections.artifact_dependencies.insertOne({ _id: randomUUID(), downstreamVersionId: versionId, upstreamVersionId, createdAtMs: nowMs }, { session });
    await database.collections.artifacts.updateOne({ _id: artifactId }, { $set: { currentVersionId: versionId, state: "draft", updatedAtMs: nowMs } }, { session });
    if (taskId === "J01") {
      await database.collections.booklets.updateOne({ _id: run.bookletId }, { $set: { workingTitle: (result.payload.content as { title: string }).title, updatedAtMs: nowMs } }, { session });
    }
    if (target?.currentVersionId) await invalidateDescendants(database, session, run, target.currentVersionId, nowMs);
    await updateStage(database, session, run, nowMs);
    const currentPending = pending(run);
    if (currentPending?.kind === "revision" && currentPending.taskId === taskId && currentPending.artifactVersionId === (target?.currentVersionId ?? null)) runPatch.pendingDecisionJson = null;
    let approvalId: string | null = null;
    if (isNarrativeTask(taskId) && taskId !== "J08" && run.activeDelegationId && !intentWarnings.some((warning) => warning.field === "audience.ageBand")) {
      const grant = await database.collections.experiment_delegations.findOne({ _id: run.activeDelegationId, runId: run._id }, { session });
      if (grant && !grant.revokedAtMs && !grant.supersededById && grant.subjectId === run.bookletId && grant.taskIds.includes(taskId)) approvalId = await approveVersion(database, session, run, versionId, "delegated", grant.testerDecisionId, grant._id, null, nowMs, assetStore);
    }
    summary.artifactId = artifactId; summary.versionId = versionId; summary.approvalId = approvalId; summary.warnings = intentWarnings;
    return { summary, runPatch };
  }
  if (result.kind === "ask" || result.kind === "clarification") {
    const current = pending(run);
    if (current?.kind === "question") invalid("An unanswered creator decision is already pending.");
    if (current?.kind === "revision" && (result.kind !== "clarification" || operation.role !== "specialist" || operation.taskId !== current.taskId || operation.expectedTargetVersionId !== current.artifactVersionId)) invalid("Clarification must belong to the pending revision owner.");
    runPatch.pendingDecisionJson = canonical({ kind: "question", questionId: operation._id, taskId: operation.taskId, subjectKind: operation.subjectKind, subjectId: operation.subjectId, question: result.payload.question, resumeRevision: current?.kind === "revision" ? current : null });
    summary.questionId = operation._id;
  } else if (result.kind === "delegate") {
    if (operation.taskId && operation.taskId !== result.payload.taskId) invalid("Manager delegation target is not eligible.");
    try { await prepareNarrativeContext(database, session, run, result.payload.taskId, result.payload.subjectKind, result.payload.subjectId); }
    catch { invalid("Manager delegation target is not currently eligible."); }
    summary.delegatedTaskId = result.payload.taskId;
  } else if (result.kind === "decision") {
    const decision = result.payload.decision;
    const sequence = run.decisionSequence + 1;
    const decisionId = operation._id;
    if (decision.action === "delegate") {
      if (decision.subjectId !== run.bookletId || decision.taskIds.some((task) => !enabled(run, task))) invalid("Delegation exceeds the saved booklet task scope.");
      const grantId = randomUUID();
      if (run.activeDelegationId) await database.collections.experiment_delegations.updateOne({ _id: run.activeDelegationId, runId: run._id, supersededById: null }, { $set: { supersededById: grantId } }, { session });
      await database.collections.experiment_delegations.insertOne({ _id: grantId, runId: run._id, testerDecisionId: decisionId, taskIds: decision.taskIds, subjectKind: "book", subjectId: run.bookletId, action: "approve", effectiveSequence: sequence, supersededById: null, revokedAtMs: null, createdAtMs: nowMs }, { session });
      runPatch.activeDelegationId = grantId;
      const candidates = await database.collections.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId,
        taskId: { $in: decision.taskIds } }, { session }).sort({ taskId: 1, subjectId: 1 }).toArray();
      for (const artifact of candidates) {
        const taskId = artifact.taskId;
        if (artifact.currentVersionId && artifact.state !== "approved") {
          try { await approveVersion(database, session, run, artifact.currentVersionId, "delegated", decisionId, grantId, null, nowMs, assetStore); }
          catch (error) {
            if (taskId === "J08" || taskId === "J09" || taskId === "J10") {
              const version = await database.collections.artifact_versions.findOne({ _id: artifact.currentVersionId }, { session });
              // Only an unassembled textual draft is an expected deferred grant.
              // Broken assembled evidence must fail instead of renewing grants forever.
              if (version?.createdBy === "application") throw error;
            }
            if (!(error instanceof ExperimentRepositoryError && error.code === "invalid_result")) throw error;
          }
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
      const rank = (id: string) => [...configuredNarrativeTasks(run.configurationJson), ...configuredReferenceSheetTasks(run.configurationJson)].findIndex((task) => task === artifactByVersion.get(id)?.taskId);
      const ordered = [...decision.versionIds].sort((a, b) => rank(a) - rank(b));
      const approvalIds: string[] = [];
      for (const versionId of ordered) approvalIds.push(await approveVersion(database, session, run, versionId, "explicit", decisionId, null, groupId, nowMs, assetStore));
      summary.approvalIds = approvalIds; summary.reviewGroupId = groupId;
    } else if (decision.action === "answer") {
      const current = pending(run);
      if (current?.kind !== "question" || current.questionId !== decision.questionId) invalid("Answer does not match the pending question.");
      runPatch.pendingDecisionJson = current.resumeRevision ? canonical(current.resumeRevision) : null;
      summary.answeredQuestionId = decision.questionId;
    } else {
      const current = pending(run);
      if (current) invalid("Another creator decision is pending.");
      if (!enabled(run, decision.taskId)) invalid("Revision task is outside the saved configuration.");
      const targetVersion = await database.collections.artifact_versions.findOne({ _id: decision.artifactVersionId }, { session });
      const artifact = targetVersion ? await database.collections.artifacts.findOne({ _id: targetVersion.artifactId,
        experimentRunId: run._id, bookletId: run.bookletId, taskId: decision.taskId }, { session }) : null;
      if (!artifact || artifact.currentVersionId !== decision.artifactVersionId) invalid("Revision target is not current.");
      if (artifact.state === "needs_review" || await approvedSourceIds(database, session, run, decision.taskId, artifact.subjectKind ?? "book", artifact.subjectId ?? run.bookletId) === null) invalid("Revision requires current approved dependencies.");
      if (run.textRevisions >= CASES[run.persona].textRevisionLimit) invalid("Text revision allowance is exhausted.");
      runPatch.textRevisions = run.textRevisions + 1;
      runPatch.pendingDecisionJson = canonical({ kind: "revision", taskId: decision.taskId, subjectKind: artifact.subjectKind, subjectId: artifact.subjectId, artifactVersionId: decision.artifactVersionId, instruction: decision.instruction });
      summary.revisionTaskId = decision.taskId;
    }
    runPatch.decisionSequence = sequence;
    await database.collections.messages.insertOne({ _id: decisionId, bookletId: run.bookletId, sequence, role: "user", schemaVersion: "2", uiMessageJson: canonical({ type: "tester_decision", decision }), experimentRunId: run._id, operationId: operation._id, createdAtMs: nowMs }, { session });
  }
  return { summary, runPatch };
}
