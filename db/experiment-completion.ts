import { hasExperimentImagePolicy } from "@/db/experiment-m4-state";
import { verifyM4Accounting } from "@/db/experiment-m4-accounting";
import { verifyExecutionAccounting } from "@/db/experiment-execution-accounting";
import type { ClientSession } from "mongodb";
import { withMongoTransaction, type Database } from "@/db/client";
import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentReportSchema, validateExperimentReport } from "@/lib/contracts/experiment-reports";
import type { ExperimentRunDocument } from "@/db/documents";
import type { AssetStore } from "@/lib/assets/asset-store";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { CASES } from "@/lib/contracts/experiment-runner";
import { parseStoredPageLayout } from "@/lib/contracts/experiment-pages";
import { parseReferenceProposal } from "@/lib/contracts/experiment-references";
import { validateSavedPageIllustrationPackage } from "@/lib/contracts/experiment-page-illustrations";
import { configuredPageIllustrationTask } from "@/lib/experiment-runner/page-illustration-tasks";
import { verifyCurrentPaginationSources } from "@/db/experiment-pages";
import { createExperimentPageIllustrationAssembly } from "@/db/experiment-page-illustrations";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";
import { createVerificationAttempt, type VerificationReadOptions } from "@/lib/experiment-runner/verification-attempt";
import { isBalancedImageVerificationRun, verificationMetadata } from "@/db/experiment-verification-metadata";
import { isVerifiedAdvisoryFailure } from "@/db/experiment-advisory-failure";
import { currentMutationOwnerId } from "@/lib/application/deployment-control";
import { measurePhase, countVerificationQuery, countVerificationRead } from "@/lib/experiment-runner/diagnostics";
import type { FailureReason } from "@/lib/contracts/experiment-failure";
import { tagFailureReason } from "@/lib/experiment-runner/failure-diagnostics";

function incomplete(message: string, reason?: FailureReason): never { throw new ExperimentRepositoryError("invalid_state", message, reason); }

// Read-only evidence for the generation/evaluation boundary. The caller owns
// the transaction and any later run transition; this does not mark completion.
export async function verifyExperimentGeneration(database: Database, session: ClientSession,
  inputRun: ExperimentRunDocument, store: AssetStore, reportOperationId?: string,
  phase: "completion" | "context" | "preparation" = "completion", nowMs?: number, reads: VerificationReadOptions = {}) {
  const attempt = createVerificationAttempt(store, reads);
  const run = await database.collections.experiment_runs.findOne({ _id: inputRun._id }, { session });
  if (!run || run.revision !== inputRun.revision || run.configurationHash !== inputRun.configurationHash) incomplete("Generation run evidence changed before verification.", "invalid_dependencies");
  const preparation = phase === "preparation";
  if (preparation && (!reportOperationId || !isBalancedImageVerificationRun(run) || run.pauseRequested ||
      !["queued", "running"].includes(run.status) || nowMs == null || !Number.isSafeInteger(nowMs) || nowMs < 0)) {
    incomplete("Report preparation requires active execution and an original deadline check.");
  }
  if (reportOperationId) {
    const operation = await database.collections.experiment_operations.findOne({ _id: reportOperationId, runId: run._id }, { session });
    if (!operation || run.activeOperationId !== reportOperationId || !["tester", "judge"].includes(operation.role) ||
        operation.taskId !== null || operation.subjectKind !== "book" || operation.subjectId !== run.bookletId ||
        operation.providerKind !== "text" || operation.mode !== run.mode || (preparation
          ? operation.reservationCount !== 0 || operation.state !== "prepared" || operation.m4Reservation != null ||
            operation.lifecycle?.stop != null || operation.dispatchStartedAtMs != null || operation.workflowRunId !== null ||
            operation.parentWorkflowRunId !== null || operation.verifiedWorkflowId != null ||
            operation.deadlineAtMs == null || operation.deadlineAtMs <= nowMs!
          : operation.reservationCount !== 1 || !["started", "unknown"].includes(operation.state))) {
      incomplete(preparation ? "Report preparation requires its current unreserved evaluation operation." : "Report evidence requires its current claimed evaluation operation.");
    }
    const bindings = savedConfigurationSchema.parse(JSON.parse(run.configurationJson) as unknown)
      .filter((binding) => binding.role === operation.role && binding.taskId === null);
    if (bindings.length !== 1 || (!preparation && (!operation.workflowRunId || operation.dispatchStartedAtMs == null ||
        (phase === "completion" ? operation.verifiedWorkflowId !== bindings[0].publishedWorkflowId :
          operation.verifiedWorkflowId != null && operation.verifiedWorkflowId !== bindings[0].publishedWorkflowId)))) {
      incomplete("Report requires its exact verified published workflow binding.");
    }
    if (preparation) await assertExperimentEvaluationOrder(database, session, run, operation.role as "tester" | "judge");
  }
  if ((run.mode !== "simulated" && !hasExperimentImagePolicy(run)) || !configuredPageIllustrationTask(run.configurationJson) ||
      (run.activeOperationId && run.activeOperationId !== reportOperationId) || run.pendingDecisionJson ||
      (run.pauseRequested && !reportOperationId) || run.status === "failed" ||
      (run.status === "paused" && !reportOperationId) ||
      (run.status === "blocked" && !(reportOperationId && run.safeFailure === "unknown_outcome"))) incomplete("Generation has unfinished or blocked work.", "unresolved_ownership");
  // Preparation is a read-only source projection, not accounting acceptance.
  // Generation/report materialization and final exit require retained usage.
  if ((run.mode === "balanced" || run.mode === "real") && !preparation) {
    try {
      await measurePhase({ runId: run._id, ...(reportOperationId ? { operationId: reportOperationId } : {}) }, "generation_accounting", () =>
        run.execution ? verifyExecutionAccounting(database, session, run, reportOperationId) :
          verifyM4Accounting(database, session, run, reportOperationId, attempt));
    } catch (error) { tagFailureReason(error, "invalid_accounting"); throw error; }
  }
  const metadata = await verificationMetadata(database, session, run._id, attempt);
  const artifacts = metadata.artifacts;
  const tasks = Array.from({ length: 13 }, (_, index) => `J${String(index + 1).padStart(2, "0")}`);
  if (tasks.some((task) => !artifacts.some((artifact) => artifact.taskId === task)) ||
      artifacts.some((artifact) => !artifact.taskId || !tasks.includes(artifact.taskId) || artifact.state !== "approved" || !artifact.currentVersionId)) {
    incomplete("All thirteen responsibilities require current approved artifacts.", "missing_approvals");
  }
  const evidence: { artifactId: string; versionId: string; pageId: string | null }[] = [];
  const currentVersionIds = new Set(artifacts.map((artifact) => artifact.currentVersionId!));
  const contents = new Map<string, unknown>();
  const warnings: { versionId: string; warnings: unknown }[] = [];
  // Batch independent evidence reads. Keep commands serial on this transaction
  // session; per-artifact queries make the evaluation callback scale with pages.
  const versions = metadata.versions;
  const approvals = metadata.approvals;
  const dependencyEdges = metadata.edges;
  const versionsById = new Map(versions.map((version) => [version._id, version]));
  const approvedVersionIds = new Set(approvals.map((approval) => approval.artifactVersionId));
  for (const artifact of artifacts) {
    const version = versionsById.get(artifact.currentVersionId!);
    if (!version || version.artifactId !== artifact._id || !approvedVersionIds.has(artifact.currentVersionId!)) incomplete("Current artifact version or approval evidence is missing.", "missing_approvals");
    const dependencies = JSON.parse(version.dependencyVersionIdsJson) as unknown;
    if (!Array.isArray(dependencies) || dependencies.some((id) => typeof id !== "string") ||
        new Set(dependencies).size !== dependencies.length) incomplete("Artifact dependencies are malformed.", "invalid_dependencies");
    const edges = dependencyEdges.filter((edge) => edge.downstreamVersionId === version._id);
    if (edges.length !== dependencies.length || new Set(edges.map((edge) => edge.upstreamVersionId)).size !== edges.length ||
        edges.some((edge) => !dependencies.includes(edge.upstreamVersionId))) incomplete("Artifact dependency edges differ from saved sources.", "invalid_dependencies");
    for (const dependency of dependencies as string[]) {
      if (currentVersionIds.has(dependency)) continue;
      const originatingDraft = version.createdBy === "application" && ["J08", "J09", "J10"].includes(artifact.taskId!) &&
        version.sourceVersionId === dependency && versions.some((item) => item._id === dependency && item.artifactId === artifact._id);
      if (!originatingDraft) incomplete("Artifact depends on a superseded source.", "invalid_dependencies");
    }
    evidence.push({ artifactId: artifact._id, versionId: version._id, pageId: artifact.subjectKind === "page" ? artifact.subjectId ?? null : null });
    contents.set(artifact._id, JSON.parse(version.contentJson) as unknown);
    warnings.push({ versionId: version._id, warnings: JSON.parse(version.warningsJson ?? "[]") as unknown });
  }
  for (const task of [...tasks.slice(0, 8), "J11"]) {
    const rows = artifacts.filter((artifact) => artifact.taskId === task);
    if (rows.length !== 1 || rows[0].subjectKind !== "book" || rows[0].subjectId !== run.bookletId) incomplete("Book artifact identities are ambiguous.");
  }
  const pagination = await verifyCurrentPaginationSources(database, session, run, store, { attempt });
  const sheets = artifacts.filter((artifact) => artifact.taskId === "J09" || artifact.taskId === "J10");
  if (sheets.length !== pagination.targets.length || pagination.targets.some((target) =>
      sheets.filter((artifact) => artifact.taskId === target.taskId && artifact.subjectKind === target.subjectKind &&
        artifact.subjectId === target.subjectId).length !== 1)) incomplete("Reference artifacts differ from the exact required sheet targets.");
  const layoutArtifact = artifacts.find((artifact) => artifact.taskId === "J11")!;
  const layout = parseStoredPageLayout(run.persona, contents.get(layoutArtifact._id));
  const finalPages: { pageId: string; pageIndex: number; versionId: string; assetId: string }[] = [];
  for (const task of ["J12", "J13"]) {
    const rows = artifacts.filter((artifact) => artifact.taskId === task);
    if (rows.length !== CASES[run.persona].storyPages + 1 ||
        rows.some((artifact) => artifact.subjectKind !== "page" || !layout.pages.some((page) => page.pageId === artifact.subjectId)) ||
        new Set(rows.map((artifact) => artifact.subjectId)).size !== rows.length) incomplete("Page and cover identities are incomplete or ambiguous.");
  }
  const assembly = createExperimentPageIllustrationAssembly({ database, store });
  for (const page of layout.pages) {
    const artifact = artifacts.find((item) => item.taskId === "J13" && item.subjectId === page.pageId)!;
    // verifyVersion loads the exact current page and checks its approved sources,
    // reference bytes and final bytes. Do not repeat that same source walk here.
    await assembly.verifyVersion({ runId: run._id, versionId: artifact.currentVersionId! }, session, attempt);
    const content = validateSavedPageIllustrationPackage(contents.get(artifact._id));
    finalPages.push({ pageId: page.pageId, pageIndex: page.pageIndex, versionId: artifact.currentVersionId!, assetId: content.assetId });
  }
  const referenceAssetIds = artifacts.flatMap((artifact) => {
    if (artifact.taskId === "J08") return parseReferenceProposal("J08", "assembled", contents.get(artifact._id)).content.samples.map((sample) => sample.build.assetId);
    if (artifact.taskId === "J09") return [parseReferenceProposal("J09", "assembled", contents.get(artifact._id)).content.build.assetId];
    if (artifact.taskId === "J10") return [parseReferenceProposal("J10", "assembled", contents.get(artifact._id)).content.build.assetId];
    return [];
  });
  const finalAssetIds = finalPages.map((page) => page.assetId);
  if (new Set([...referenceAssetIds, ...finalAssetIds]).size !== referenceAssetIds.length + finalAssetIds.length) incomplete("Generated asset identities are duplicated.");
  if (run.generationCompletedAtMs != null && (!run.generationVersionIds || run.generationVersionIds.length !== evidence.length ||
      new Set(run.generationVersionIds).size !== evidence.length || evidence.some((item) => !run.generationVersionIds!.includes(item.versionId)))) {
    incomplete("Completed generation versions changed; retain this run and use a successor.");
  }
  return { runId: run._id, configurationHash: run.configurationHash, artifacts: evidence,
    finalPages, finalAssetIds, referenceAssetIds, warnings };
}

const transitionInput = z.strictObject({ runId: opaqueIdSchema, expectedRevision: z.number().int().nonnegative(), nowMs: z.number().int().nonnegative() });

function evaluationResult(raw: string | null) {
  try { return JSON.parse(raw ?? "null"); }
  catch (error) { tagFailureReason(error, "invalid_report_evidence"); throw error; }
}

// These consumers validate report results and dispatch identity. Historical
// preparation/request bodies belong to the separate accounting proof reader.
export function readExperimentEvaluationOperations(database: Database, session: ClientSession, runId: string) {
  return measurePhase({ runId }, "evaluation_operations_read", async () => {
    countVerificationQuery();
    const rows = await database.collections.experiment_operations.find({ runId, state: "succeeded",
      role: { $in: ["tester", "judge"] } }, { session, projection: {
      _id: 1, role: 1, taskId: 1, subjectKind: 1, subjectId: 1, providerKind: 1, mode: 1,
      reservationCount: 1, workflowRunId: 1, verifiedWorkflowId: 1, dispatchStartedAtMs: 1, resultJson: 1,
    } }).toArray();
    countVerificationRead(rows);
    return rows;
  });
}

export async function assertExperimentEvaluationOrder(database: Database, session: ClientSession, run: ExperimentRunDocument, role: "tester" | "judge") {
  if (run.generationCompletedAtMs == null || !run.generationVersionIds) incomplete("Evaluation requires saved generation completion.");
  const bindings = savedConfigurationSchema.parse(JSON.parse(run.configurationJson));
  const rows = await readExperimentEvaluationOperations(database, session, run._id);
  const reports = rows.flatMap((operation) => {
    const result = evaluationResult(operation.resultJson);
    if (result?.kind !== (operation.role === "tester" ? "feedback" : "assessment")) return [];
    const report = experimentReportSchema.safeParse(result.payload);
    const binding = bindings.find((item) => item.role === operation.role && item.taskId === null);
    if (!report.success || !binding || operation.verifiedWorkflowId !== binding.publishedWorkflowId || !operation.workflowRunId ||
        operation.reservationCount !== 1 || operation.dispatchStartedAtMs == null || operation.subjectKind !== "book" ||
        operation.subjectId !== run.bookletId || operation.taskId !== null || operation.providerKind !== "text" || operation.mode !== run.mode ||
        report.data.role !== operation.role || report.data.runId !== run._id || report.data.mode !== run.mode ||
        report.data.configurationHash !== run.configurationHash || report.data.evidence.versionIds.length !== run.generationVersionIds!.length ||
        report.data.evidence.versionIds.some((id) => !run.generationVersionIds!.includes(id))) incomplete("Saved evaluation report evidence is invalid.", "invalid_report_evidence");
    return [operation.role];
  });
  if (reports.includes("judge") || reports.filter((item) => item === "tester").length !== (role === "judge" ? 1 : 0)) {
    incomplete("Evaluation must save one tester report before one independent judge report.", "invalid_report_evidence");
  }
}

// Generation and evaluation are separate persisted outcomes. No provider call,
// artifact approval or quality threshold is part of either transaction.
export function createExperimentCompletionService(database: Database, store: AssetStore) {
  async function completeAdvisoryFailure(raw: unknown) {
    const input = transitionInput.parse(raw);
    return withMongoTransaction(database, async session => {
      const run = await database.collections.experiment_runs.findOne({ _id: input.runId }, { session });
      if (!run) throw new ExperimentRepositoryError("stale_revision", "Completion run revision changed.");
      const alreadyComplete = run.status === "completed" && run.evaluationStatus === "failed";
      // A lost acknowledgement may repeat the original revision. Only an already
      // terminal result can accept that older revision; all evidence is rechecked.
      if (run.revision !== input.expectedRevision && !(alreadyComplete && input.expectedRevision < run.revision)) {
        throw new ExperimentRepositoryError("stale_revision", "Completion run revision changed.");
      }
      if (run.activeOperationId || run.preparation || run.pendingDecisionJson || run.generationCompletedAtMs == null ||
          run.status === "failed" || run.safeFailure === "unknown_outcome") incomplete("Evaluation ownership remains unresolved.", "unresolved_ownership");
      const controls = await database.collections.deployment_control.find({ "mutationOwners.runId": run._id }, { session }).toArray();
      if (controls.some(control => control.mutationOwners?.some(owner => owner.runId === run._id && owner.id !== currentMutationOwnerId()))) {
        incomplete("Another mutation still owns this run.", "unresolved_ownership");
      }
      const operations = await database.collections.experiment_operations.find({ runId: run._id }, { session,
        projection: { _id: 1, createdAtMs: 1, state: 1, safeFailure: 1, authorizationClaim: 1, resultFinalizationClaim: 1,
          imageCompletionClaim: 1, "lifecycle.unresolved": 1 } }).toArray();
      if (operations.some(op => !["succeeded", "failed"].includes(op.state) || op.authorizationClaim ||
          op.resultFinalizationClaim || op.imageCompletionClaim || op.lifecycle?.unresolved ||
          op.safeFailure === "unknown_outcome")) incomplete("Evaluation has unfinished work.", "unresolved_ownership");
      const latestId = [...operations].sort((a, b) => b.createdAtMs - a.createdAtMs || b._id.localeCompare(a._id))[0]?._id;
      const latest = latestId ? await database.collections.experiment_operations.findOne({ _id: latestId, runId: run._id }, { session }) : null;
      if (!latest || !await isVerifiedAdvisoryFailure(database, session, run, latest, input.nowMs)) incomplete("Evaluation failure has no verified terminal evidence.", "invalid_report_evidence");
      await assertExperimentEvaluationOrder(database, session, run, latest.role as "tester" | "judge");
      // Set the candidate terminal state within this transaction so the normal
      // generation verifier can inspect it. Any failed check rolls it back.
      const candidate = alreadyComplete ? run : await database.collections.experiment_runs.findOneAndUpdate(
        { _id: run._id, revision: run.revision, activeOperationId: null },
        { $set: { status: "completed", evaluationStatus: "failed", terminalAtMs: input.nowMs, safeFailure: null, pauseRequested: false, updatedAtMs: input.nowMs },
          $inc: { revision: 1 } }, { session, returnDocument: "after" });
      if (!candidate) throw new ExperimentRepositoryError("stale_revision", "Completion changed concurrently.");
      await verifyExperimentGeneration(database, session, candidate, store);
      return candidate;
    });
  }
  async function transition(raw: unknown, evaluation: boolean) {
    const input = transitionInput.parse(raw);
    return withMongoTransaction(database, async (session) => {
      const run = await database.collections.experiment_runs.findOne({ _id: input.runId }, { session });
      if (!run || run.revision !== input.expectedRevision) throw new ExperimentRepositoryError("stale_revision", "Completion run revision changed.");
      const evidence = await verifyExperimentGeneration(database, session, run, store);
      const bindings = savedConfigurationSchema.parse(JSON.parse(run.configurationJson) as unknown);
      if (bindings.filter((binding) => binding.role === "judge").length !== 1) incomplete("Full completion requires the independent judge binding.");
      if (evaluation) {
        if (run.generationCompletedAtMs == null) incomplete("Generation success must be retained before evaluation completion.");
        const rows = await readExperimentEvaluationOperations(database, session, run._id);
        for (const role of ["tester", "judge"] as const) {
          const reports = rows.filter((row) => row.role === role && evaluationResult(row.resultJson)?.kind === (role === "tester" ? "feedback" : "assessment"));
          const binding = bindings.find((item) => item.role === role && item.taskId === null);
          if (reports.length !== 1 || !binding) incomplete("Exactly one saved tester report and independent judge report are required.", "invalid_report_evidence");
          const operation = reports[0];
          if (operation.taskId !== null || operation.subjectKind !== "book" || operation.subjectId !== run.bookletId ||
              operation.providerKind !== "text" || operation.reservationCount !== 1 || !operation.workflowRunId ||
              operation.dispatchStartedAtMs == null || operation.verifiedWorkflowId !== binding.publishedWorkflowId) incomplete("Report publication or authorization evidence is incomplete.", "invalid_report_evidence");
          try {
            validateExperimentReport(JSON.parse(operation.resultJson!).payload, { role, mode: run.mode, runId: run._id,
              configurationHash: run.configurationHash, artifacts: evidence.artifacts,
              availableAssetIds: [...evidence.referenceAssetIds, ...evidence.finalAssetIds], requiredFinalAssetIds: evidence.finalAssetIds });
          } catch { incomplete("Saved report no longer matches current generation evidence.", "invalid_report_evidence"); }
        }
      }
      if (evaluation ? run.status === "completed" && run.evaluationStatus === "complete" : run.generationCompletedAtMs != null) return run;
      const patch = evaluation ? { status: "completed" as const, evaluationStatus: "complete" as const,
        terminalAtMs: run.status === "completed" ? run.terminalAtMs ?? null : input.nowMs, updatedAtMs: input.nowMs } :
        { generationCompletedAtMs: input.nowMs, generationVersionIds: evidence.artifacts.map((item) => item.versionId), updatedAtMs: input.nowMs };
      const updated = await database.collections.experiment_runs.findOneAndUpdate({ _id: run._id, revision: run.revision, activeOperationId: null },
        { $set: patch, $inc: { revision: 1 } }, { session, returnDocument: "after" });
      if (!updated) throw new ExperimentRepositoryError("stale_revision", "Completion changed concurrently.");
      if (!evaluation) {
        const changed = await database.collections.booklets.updateOne({ _id: run.bookletId, experimentRunId: run._id },
          { $set: { lifecycle: "completed", currentStage: "J13", coverAssetId: evidence.finalPages.find((page) => page.pageIndex === 0)!.assetId,
            updatedAtMs: input.nowMs } }, { session });
        if (changed.matchedCount !== 1) incomplete("Generation booklet identity is missing.");
      }
      return updated;
    });
  }
  return { completeAdvisoryFailure, markGenerationComplete: (raw: unknown) => transition(raw, false), completeEvaluation: (raw: unknown) => transition(raw, true) };
}
