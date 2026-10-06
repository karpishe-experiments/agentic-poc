import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentRunDocument } from "@/db/documents";
import type { AssetStore } from "@/lib/assets/asset-store";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { CASES } from "@/lib/contracts/experiment-runner";
import { parseStoredPageLayout } from "@/lib/contracts/experiment-pages";
import { parseReferenceProposal } from "@/lib/contracts/experiment-references";
import { validateSavedPageIllustrationPackage } from "@/lib/contracts/experiment-page-illustrations";
import { configuredPageIllustrationTask } from "@/lib/experiment-runner/page-illustration-tasks";
import { verifyCurrentPageIllustrationSources, verifyCurrentPaginationSources } from "@/db/experiment-pages";
import { createExperimentPageIllustrationAssembly } from "@/db/experiment-page-illustrations";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";

function incomplete(message: string): never { throw new ExperimentRepositoryError("invalid_state", message); }

// Read-only evidence for the generation/evaluation boundary. The caller owns
// the transaction and any later run transition; this does not mark completion.
export async function verifyExperimentGeneration(database: Database, session: ClientSession,
  inputRun: ExperimentRunDocument, store: AssetStore, reportOperationId?: string) {
  const run = await database.collections.experiment_runs.findOne({ _id: inputRun._id }, { session });
  if (!run || run.revision !== inputRun.revision || run.configurationHash !== inputRun.configurationHash) incomplete("Generation run evidence changed before verification.");
  if (reportOperationId) {
    const operation = await database.collections.experiment_operations.findOne({ _id: reportOperationId, runId: run._id }, { session });
    if (!operation || run.activeOperationId !== reportOperationId || !["tester", "judge"].includes(operation.role) ||
        operation.taskId !== null || operation.subjectKind !== "book" || operation.subjectId !== run.bookletId ||
        operation.providerKind !== "text" || operation.reservationCount !== 1 || !["started", "unknown"].includes(operation.state)) {
      incomplete("Report evidence requires its current claimed evaluation operation.");
    }
    const bindings = savedConfigurationSchema.parse(JSON.parse(run.configurationJson) as unknown)
      .filter((binding) => binding.role === operation.role && binding.taskId === null);
    if (bindings.length !== 1 || !operation.workflowRunId || operation.dispatchStartedAtMs == null ||
        operation.verifiedWorkflowId !== bindings[0].publishedWorkflowId) {
      incomplete("Report requires its exact verified published workflow binding.");
    }
  }
  if (run.mode !== "simulated" || !configuredPageIllustrationTask(run.configurationJson) ||
      (run.activeOperationId && run.activeOperationId !== reportOperationId) || run.pendingDecisionJson ||
      (run.pauseRequested && !reportOperationId) || run.status === "failed" ||
      (run.status === "paused" && !reportOperationId) ||
      (run.status === "blocked" && !(reportOperationId && run.safeFailure === "unknown_outcome"))) incomplete("Generation has unfinished or blocked work.");
  const artifacts = await database.collections.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId }, { session }).toArray();
  const tasks = Array.from({ length: 13 }, (_, index) => `J${String(index + 1).padStart(2, "0")}`);
  if (tasks.some((task) => !artifacts.some((artifact) => artifact.taskId === task)) ||
      artifacts.some((artifact) => !artifact.taskId || !tasks.includes(artifact.taskId) || artifact.state !== "approved" || !artifact.currentVersionId)) {
    incomplete("All thirteen responsibilities require current approved artifacts.");
  }
  const evidence: { artifactId: string; versionId: string; pageId: string | null }[] = [];
  const currentVersionIds = new Set(artifacts.map((artifact) => artifact.currentVersionId!));
  const contents = new Map<string, unknown>();
  const warnings: { versionId: string; warnings: unknown }[] = [];
  for (const artifact of artifacts) {
    const version = await database.collections.artifact_versions.findOne({ _id: artifact.currentVersionId!, artifactId: artifact._id }, { session });
    const approval = await database.collections.approvals.findOne({ experimentRunId: run._id, bookletId: run.bookletId,
      artifactVersionId: artifact.currentVersionId!, action: "approve", scope: "artifact" }, { session });
    if (!version || !approval) incomplete("Current artifact version or approval evidence is missing.");
    const dependencies = JSON.parse(version.dependencyVersionIdsJson) as unknown;
    if (!Array.isArray(dependencies) || dependencies.some((id) => typeof id !== "string") ||
        new Set(dependencies).size !== dependencies.length) incomplete("Artifact dependencies are malformed.");
    const edges = await database.collections.artifact_dependencies.find({ downstreamVersionId: version._id }, { session }).toArray();
    if (edges.length !== dependencies.length || new Set(edges.map((edge) => edge.upstreamVersionId)).size !== edges.length ||
        edges.some((edge) => !dependencies.includes(edge.upstreamVersionId))) incomplete("Artifact dependency edges differ from saved sources.");
    for (const dependency of dependencies as string[]) {
      if (currentVersionIds.has(dependency)) continue;
      const originatingDraft = version.createdBy === "application" && ["J08", "J09", "J10"].includes(artifact.taskId!) &&
        version.sourceVersionId === dependency && await database.collections.artifact_versions.findOne({ _id: dependency, artifactId: artifact._id }, { session });
      if (!originatingDraft) incomplete("Artifact depends on a superseded source.");
    }
    evidence.push({ artifactId: artifact._id, versionId: version._id, pageId: artifact.subjectKind === "page" ? artifact.subjectId ?? null : null });
    contents.set(artifact._id, JSON.parse(version.contentJson) as unknown);
    warnings.push({ versionId: version._id, warnings: JSON.parse(version.warningsJson ?? "[]") as unknown });
  }
  for (const task of [...tasks.slice(0, 8), "J11"]) {
    const rows = artifacts.filter((artifact) => artifact.taskId === task);
    if (rows.length !== 1 || rows[0].subjectKind !== "book" || rows[0].subjectId !== run.bookletId) incomplete("Book artifact identities are ambiguous.");
  }
  const pagination = await verifyCurrentPaginationSources(database, session, run, store);
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
    await verifyCurrentPageIllustrationSources(database, session, run, page.pageId, store);
    const artifact = artifacts.find((item) => item.taskId === "J13" && item.subjectId === page.pageId)!;
    await assembly.verifyVersion({ runId: run._id, versionId: artifact.currentVersionId! }, session);
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
  return { runId: run._id, configurationHash: run.configurationHash, artifacts: evidence,
    finalPages, finalAssetIds, referenceAssetIds, warnings };
}
