import { createHash, randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";
import { z } from "zod";
import { withMongoTransaction, type Database } from "@/db/client";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentImageRequestSchema, imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { pageCanvasSchema } from "@/lib/contracts/experiment-pages";
import { buildSavedPageIllustrationPackage, validateSavedPageIllustrationPackage } from "@/lib/contracts/experiment-page-illustrations";
import { verifyCurrentPageIllustrationSources } from "@/db/experiment-pages";
import { configuredPageIllustrationTask } from "@/lib/experiment-runner/page-illustration-tasks";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";
import { validateExperimentImage } from "@/lib/experiment-runner/image-validation";
import type { AssetStore } from "@/lib/assets/asset-store";

const inputSchema = z.strictObject({ runId: opaqueIdSchema, pageId: opaqueIdSchema, imageOperationId: opaqueIdSchema });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const outputSchema = z.strictObject({ mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]), sha256,
  byteLength: z.number().int().positive(), width: z.number().int().positive(), height: z.number().int().positive() });
const assetMetadataSchema = z.strictObject({ sha256, byteLength: z.number().int().positive(), operationId: opaqueIdSchema,
  attempt: z.number().int().positive(), workflowRunId: opaqueIdSchema, parentWorkflowRunId: opaqueIdSchema.nullable(),
  inputFingerprint: sha256, sourceVersionIds: z.array(opaqueIdSchema), request: experimentImageRequestSchema });
const summarySchema = z.strictObject({ assetId: opaqueIdSchema, sha256, uri: z.string().min(1) });
const acknowledgementSchema = z.array(z.strictObject({ role: z.enum(["character", "location"]), subjectId: opaqueIdSchema,
  assetId: opaqueIdSchema, artifactVersionId: opaqueIdSchema, uploadFileId: opaqueIdSchema,
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]), sha256, byteLength: z.number().int().positive(),
  width: z.number().int().positive(), height: z.number().int().positive() })).max(15);
const managerDelegateSchema = z.strictObject({ kind: z.literal("delegate"), payload: z.strictObject({ taskId: z.literal("J13"),
  subjectKind: z.literal("page"), subjectId: opaqueIdSchema }) });
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))) : item);
function invalid(message: string): never { throw new ExperimentRepositoryError("invalid_state", message); }
function conflict(message: string): never { throw new ExperimentRepositoryError("conflict", message); }
function json(raw: string | null | undefined, message: string): unknown {
  try { return JSON.parse(raw ?? ""); } catch { return invalid(message); }
}

// A provider can return a technically usable image that does not match the
// preferred J11 working canvas. Preserve it for tester review and record the
// deviation instead of turning a quality preference into a failed operation.
function canvasWarnings(canvas: unknown, output: z.infer<typeof outputSchema>): string[] {
  const parsed = pageCanvasSchema.safeParse(canvas);
  if (!parsed.success) return [];
  const { workingPixels, aspectRatio } = parsed.data;
  const warnings: string[] = [];
  if (output.width !== workingPixels.width || output.height !== workingPixels.height) {
    warnings.push(`Saved page output geometry ${output.width}x${output.height} differs from approved working canvas ${workingPixels.width}x${workingPixels.height}.`);
  }
  if (BigInt(output.width) * BigInt(aspectRatio.height) !== BigInt(output.height) * BigInt(aspectRatio.width)) {
    warnings.push(`Saved page output aspect ratio ${output.width}:${output.height} differs from approved canvas aspect ratio ${aspectRatio.width}:${aspectRatio.height}.`);
  }
  return warnings;
}

// This is application-only J13 materialization. It consumes one completed,
// published image operation; it never uploads, dispatches, approves, or starts work.
export function createExperimentPageIllustrationAssembly(input: { database: Database; store: AssetStore; now?: () => number }) {
  const { database, store } = input;
  const now = input.now ?? Date.now;

  async function load(value: z.infer<typeof inputSchema>, session: ClientSession, verificationOnly = false) {
    const options = { session };
    const run = await database.collections.experiment_runs.findOne({ _id: value.runId }, options);
    if (!run) throw new ExperimentRepositoryError("not_found", "Page illustration run was not found.");
    const recovery = verificationOnly && run.status === "blocked" && run.safeFailure === "unknown_outcome" && run.activeOperationId
      ? await database.collections.experiment_operations.findOne({ _id: run.activeOperationId, runId: run._id,
        $or: [{ role: "tester" }, { role: "judge", taskId: null, subjectKind: "book", subjectId: run.bookletId,
          providerKind: "text", workflowRunId: { $ne: null }, verifiedWorkflowId: { $ne: null } }],
        state: "unknown", safeFailure: "unknown_outcome", reservationCount: 1 }, options) : null;
    if (run.mode !== "simulated" || (!recovery && !["queued", "running", "paused"].includes(run.status)) || (!verificationOnly && run.activeOperationId)) {
      invalid("Page illustration assembly requires idle simulated work.");
    }
    if (!configuredPageIllustrationTask(run.configurationJson)) invalid("Page illustration is not enabled by this saved run configuration.");
    const configuration = savedConfigurationSchema.parse(json(run.configurationJson, "Saved run configuration is malformed."));
    const managerBinding = configuration.find((item) => item.role === "manager" && item.taskId === null);
    const imageBinding = configuration.find((item) => item.role === "image" && item.taskId === null && item.finalPageIllustration === true);
    const sources = await verifyCurrentPageIllustrationSources(database, session, run, value.pageId, store);
    const operation = await database.collections.experiment_operations.findOne({ _id: value.imageOperationId, runId: run._id }, options);
    if (!operation || operation.role !== "image" || operation.providerKind !== "image" || operation.taskId !== "J13" ||
      operation.subjectKind !== "page" || operation.subjectId !== value.pageId || operation.mode !== "simulated" || operation.state !== "succeeded" ||
      operation.reservationCount !== 1 || !operation.workflowRunId || !operation.verifiedWorkflowId || !operation.parentWorkflowRunId || operation.imageCompletionClaim) {
      invalid("Page illustration operation is not a completed authorized J13 image.");
    }
    const manager = await database.collections.experiment_operations.findOne({ runId: run._id, role: "manager", taskId: null, mode: "simulated", reservationCount: 1,
      subjectKind: "book", subjectId: run.bookletId, providerKind: "text", workflowRunId: operation.parentWorkflowRunId,
      state: "succeeded", verifiedWorkflowId: { $ne: null } }, options);
    if (!manager) invalid("Page illustration operation has no verified manager parent.");
    if (!managerBinding || !imageBinding || manager.verifiedWorkflowId !== managerBinding.publishedWorkflowId || operation.verifiedWorkflowId !== imageBinding.publishedWorkflowId) {
      invalid("Page illustration publication does not match the saved run configuration.");
    }
    const delegation = managerDelegateSchema.safeParse(json(manager.resultJson, "Saved manager delegation is malformed."));
    if (!delegation.success || delegation.data.payload.subjectId !== value.pageId) invalid("Page illustration manager parent did not select this J13 page.");
    const request = experimentImageRequestSchema.parse(json(operation.imageRequestJson, "Saved page image request is malformed."));
    if (request.kind !== "page_source" || canonical(request) !== canonical(sources.request.request) || imageRequestFingerprint(request) !== operation.inputFingerprint ||
      canonical(operation.dependencyVersionIds) !== canonical(sources.request.request.sourceVersionIds)) conflict("Page illustration operation request or sources differ from current approved evidence.");
    const acknowledgements = acknowledgementSchema.parse(json(operation.referenceUploadsJson, "Saved page reference uploads are malformed."));
    const asset = await database.collections.assets.findOne({ _id: operation._id, bookletId: run.bookletId }, options);
    if (!asset || asset.kind !== "page_source" || !asset.metadataJson || asset.width === null || asset.height === null) invalid("Saved page illustration asset is missing.");
    const metadata = assetMetadataSchema.parse(json(asset.metadataJson, "Saved page illustration metadata is malformed."));
    const decodedOutput = await decodedOutputEvidence(asset.uri, { sha256: metadata.sha256, byteLength: metadata.byteLength,
      width: asset.width, height: asset.height });
    const output = outputSchema.parse(decodedOutput.output);
    const outputWarnings = asset.mimeType === output.mimeType ? [] : [`Saved page asset ${asset._id} metadata MIME ${asset.mimeType} differs from decoded ${output.mimeType}.`];
    const expectedSummary = { assetId: asset._id, sha256: output.sha256, uri: asset.uri };
    const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const)[output.mimeType];
    if (metadata.operationId !== operation._id || metadata.attempt !== operation.attempt || metadata.workflowRunId !== operation.workflowRunId ||
      metadata.parentWorkflowRunId !== operation.parentWorkflowRunId || metadata.inputFingerprint !== operation.inputFingerprint ||
      canonical(metadata.request) !== canonical(request) || canonical(metadata.sourceVersionIds) !== canonical(request.sourceVersionIds) ||
      asset.uri !== `experiments/${run.bookletId}/${run._id}/${operation._id}/attempt-${operation.attempt}/image.${extension}` ||
      operation.resultDigest !== output.sha256 || operation.imageCompletionDigest !== output.sha256 ||
      canonical(summarySchema.parse(json(operation.resultJson, "Saved page result is malformed."))) !== canonical(expectedSummary) ||
      canonical(summarySchema.parse(json(operation.materializationJson, "Saved page materialization is malformed."))) !== canonical(expectedSummary)) {
      conflict("Saved page illustration lineage is inconsistent.");
    }
    const artifact = (await database.collections.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId,
      taskId: "J13", subjectKind: "page", subjectId: value.pageId }, options).toArray());
    if (artifact.length > 1) invalid("Page illustration target is ambiguous.");
    const target = artifact[0] ?? null;
    const current = target?.currentVersionId ? await database.collections.artifact_versions.findOne({ _id: target.currentVersionId, artifactId: target._id }, options) : null;
    if (target?.currentVersionId && !current) conflict("Page illustration target version is missing.");
    const prior = current ? (() => {
      try { return validateSavedPageIllustrationPackage(json(current.contentJson, "Saved page illustration package is malformed.")); }
      catch { return invalid("Saved page illustration package is malformed."); }
    })() : null;
    const pending = run.pendingDecisionJson ? json(run.pendingDecisionJson, "Saved page revision is malformed.") as Record<string, unknown> : null;
    const requestedRevision = pending?.kind === "revision" && pending.taskId === "J13" && pending.subjectKind === "page" &&
      pending.subjectId === value.pageId && pending.artifactVersionId === current?._id;
    if (prior && prior.operationId !== operation._id && (operation.expectedTargetVersionId !== current!._id ||
        !(target!.state === "needs_review" || target!.state === "draft" && requestedRevision))) {
      conflict("Page illustration revision is not eligible for this saved page target.");
    }
    const expectedAttachments = sources.attachments.map((attachment) => ({ role: attachment.subjectKind, subjectId: attachment.subjectId,
      assetId: attachment.assetId, artifactVersionId: attachment.artifactVersionId }));
    if (acknowledgements.length !== sources.attachments.length || acknowledgements.some((acknowledgement, index) => {
      const source = sources.attachments[index];
      const expected = expectedAttachments[index];
      return !source || !expected || acknowledgement.role !== expected.role || acknowledgement.subjectId !== expected.subjectId ||
        acknowledgement.assetId !== expected.assetId || acknowledgement.artifactVersionId !== expected.artifactVersionId || acknowledgement.mimeType !== source.mimeType || acknowledgement.sha256 !== source.sha256 ||
        acknowledgement.byteLength !== source.byteLength || acknowledgement.width !== source.width || acknowledgement.height !== source.height;
    })) conflict("Saved page reference upload evidence differs from the selected original bytes.");
    let packageContent;
    try {
      packageContent = buildSavedPageIllustrationPackage({ runId: run._id, pageId: value.pageId, pageIndex: sources.page.pageIndex,
        pageBibleVersionId: sources.pageBibleVersionId, assetId: asset._id, output, request, operationId: operation._id,
        workflowRunId: operation.workflowRunId, publishedWorkflowId: operation.verifiedWorkflowId, parentWorkflowRunId: operation.parentWorkflowRunId,
        inputFingerprint: operation.inputFingerprint, candidateLineage: { previousPageVersionId: prior?.operationId === operation._id
          ? prior.candidateLineage.previousPageVersionId : current?._id ?? null },
        warnings: prior?.operationId === operation._id ? prior.warnings : [...sources.warnings, ...outputWarnings, ...canvasWarnings(sources.layout?.canvas, output)],
        expectedAttachments, uploadAcknowledgements: acknowledgements });
    } catch { return invalid("Saved page upload acknowledgements differ from the selected source evidence."); }
    if (prior && prior.operationId === operation._id && canonical(prior) !== canonical(packageContent)) conflict("Existing page illustration uses different evidence.");
    if (current) {
      const dependencies = json(current.dependencyVersionIdsJson, "Saved page illustration dependencies are malformed.");
      const edges = await database.collections.artifact_dependencies.find({ downstreamVersionId: current._id }, options).toArray();
      if (canonical(dependencies) !== canonical(prior!.sourceVersionIds) || edges.length !== prior!.sourceVersionIds.length ||
        new Set(edges.map((edge) => edge.upstreamVersionId)).size !== edges.length || !prior!.sourceVersionIds.every((id) => edges.some((edge) => edge.upstreamVersionId === id))) {
        conflict("Saved page illustration dependencies are incomplete.");
      }
    }
    return { run, sources, operation, asset, output, target, current, requestedRevision, reused: prior?.operationId === operation._id, packageContent,
      bytes: { uri: asset.uri, output } };
  }

  async function decodedOutputEvidence(uri: string, expected: { sha256: string; byteLength: number; width: number; height: number }) {
    try {
      if (!await store.exists(uri)) invalid("Saved page illustration bytes are missing.");
      const bytes = await store.get(uri);
      const decoded = await validateExperimentImage(bytes);
      if (decoded.byteLength !== expected.byteLength || decoded.sha256 !== expected.sha256 || decoded.width !== expected.width ||
        decoded.height !== expected.height || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) {
        invalid("Saved page illustration bytes are corrupt.");
      }
      return { output: { mimeType: decoded.mimeType, sha256: decoded.sha256, byteLength: decoded.byteLength, width: decoded.width, height: decoded.height } };
    } catch (error) {
      if (error instanceof ExperimentRepositoryError) throw error;
      invalid("Page illustration storage verification failed.");
    }
  }

  async function verifyBytes(evidence: { uri: string; output: z.infer<typeof outputSchema> }) {
    const decoded = await decodedOutputEvidence(evidence.uri, evidence.output);
    if (decoded.output.mimeType !== evidence.output.mimeType) invalid("Saved page illustration MIME evidence is inconsistent.");
  }

  async function verifyVersion(identity: { runId: string; versionId: string }, session: ClientSession) {
    const runId = opaqueIdSchema.parse(identity.runId), versionId = opaqueIdSchema.parse(identity.versionId);
    const version = await database.collections.artifact_versions.findOne({ _id: versionId }, { session });
    const artifact = version ? await database.collections.artifacts.findOne({ _id: version.artifactId }, { session }) : null;
    if (!version || !artifact || artifact.taskId !== "J13" || artifact.subjectKind !== "page" || artifact.currentVersionId !== version._id ||
      version.createdBy !== "application") invalid("Page illustration approval requires the current assembled version.");
    const content = validateSavedPageIllustrationPackage(json(version.contentJson, "Saved page illustration package is malformed."));
    const checked = await load({ runId, pageId: content.pageId, imageOperationId: content.operationId }, session, true);
    if (checked.current?._id !== versionId) conflict("Page illustration approval target changed.");
    await verifyBytes(checked.bytes);
  }

  async function assemble(raw: unknown) {
    const value = inputSchema.parse(raw);
    const initial = await withMongoTransaction(database, (session) => load(value, session));
    await verifyBytes(initial.bytes);
    return withMongoTransaction(database, async (session) => {
      const checked = await load(value, session);
      if (initial.run.revision !== checked.run.revision || canonical(initial.operation) !== canonical(checked.operation) ||
        canonical(initial.bytes) !== canonical(checked.bytes) || canonical(initial.packageContent) !== canonical(checked.packageContent)) conflict("Page illustration evidence changed during assembly.");
      if (checked.reused && checked.current) return { reused: true, version: checked.current };
      const timestamp = now();
      const artifact = checked.target ?? { _id: randomUUID(), bookletId: checked.run.bookletId, artifactType: "J13", taskId: "J13" as const,
        experimentRunId: checked.run._id, subjectKind: "page" as const, subjectId: value.pageId, state: "draft", currentVersionId: null,
        createdAtMs: timestamp, updatedAtMs: timestamp };
      if (!checked.target) await database.collections.artifacts.insertOne(artifact, { session });
      const version = { _id: randomUUID(), artifactId: artifact._id, versionNumber: (checked.current?.versionNumber ?? 0) + 1,
        schemaVersion: "2", contentJson: canonical(checked.packageContent), dependencyVersionIdsJson: canonical(checked.packageContent.sourceVersionIds),
        createdBy: "application", sourceVersionId: checked.current?._id ?? null, sourceExecutionBatchId: null, sourceOperationId: checked.operation._id,
        warningsJson: canonical(checked.packageContent.warnings.map((message) => ({ field: "image", message }))), createdAtMs: timestamp };
      await database.collections.artifact_versions.insertOne(version, { session });
      await database.collections.artifact_dependencies.insertMany(checked.packageContent.sourceVersionIds.map((upstreamVersionId) => ({
        _id: randomUUID(), downstreamVersionId: version._id, upstreamVersionId, createdAtMs: timestamp,
      })), { session });
      const changed = await database.collections.artifacts.updateOne({ _id: artifact._id, currentVersionId: checked.current?._id ?? null,
        state: artifact.state }, { $set: { currentVersionId: version._id, state: "draft", updatedAtMs: timestamp } }, { session });
      if (changed.modifiedCount !== 1) conflict("Page illustration target changed during assembly.");
      const runChanged = await database.collections.experiment_runs.updateOne({ _id: checked.run._id, revision: checked.run.revision,
        activeOperationId: null }, { $inc: { revision: 1 }, $set: { updatedAtMs: timestamp,
          ...(checked.requestedRevision ? { pendingDecisionJson: null } : {}) } }, { session });
      if (runChanged.modifiedCount !== 1) conflict("Page illustration run changed during assembly.");
      return { reused: false, version };
    });
  }
  return { assemble, verifyVersion };
}
