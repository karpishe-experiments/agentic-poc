import { createHash, randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";
import { z } from "zod";
import { withMongoTransaction, type Database } from "@/db/client";
import { assertCurrentImageSources } from "@/db/experiment-images";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentImageRequestSchema } from "@/lib/contracts/experiment-image";
import { finalCharacterListSchema, finalLocationListSchema } from "@/lib/contracts/experiment-runner";
import { parseReferenceProposal } from "@/lib/contracts/experiment-references";
import { assembleReferenceSheet } from "@/lib/experiment-runner/reference-assembly";
import type { AssetStore } from "@/lib/assets/asset-store";

const inputSchema = z.strictObject({ runId: opaqueIdSchema, draftSheetVersionId: opaqueIdSchema, imageOperationId: opaqueIdSchema });
const metadataSchema = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().positive(),
  operationId: opaqueIdSchema, attempt: z.number().int().positive(), workflowRunId: opaqueIdSchema,
  parentWorkflowRunId: opaqueIdSchema.nullable(), inputFingerprint: z.string(),
  sourceVersionIds: z.array(opaqueIdSchema), request: experimentImageRequestSchema });
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
function conflict(message: string): never { throw new ExperimentRepositoryError("conflict", message); }
function invalid(message: string): never { throw new ExperimentRepositoryError("invalid_state", message); }
function json(raw: string | null | undefined): unknown {
  try { return JSON.parse(raw ?? ""); } catch { return invalid("Saved sheet evidence is malformed."); }
}

// Assemble only retained drafts and completed images. This service does not
// admit specialist work, generate images, approve content or advance the stage.
export function createExperimentSheetAssembly(input: { database: Database; store: AssetStore; now?: () => number }) {
  const { database, store } = input;
  const now = input.now ?? Date.now;
  async function load(value: z.infer<typeof inputSchema>, session: ClientSession) {
    const options = { session };
    const run = await database.collections.experiment_runs.findOne({ _id: value.runId }, options);
    if (!run) throw new ExperimentRepositoryError("not_found", "Sheet run was not found.");
    if (run.mode !== "simulated" || !["queued", "running", "paused"].includes(run.status) || run.activeOperationId) invalid("Sheet assembly requires idle simulated work.");
    const draft = await database.collections.artifact_versions.findOne({ _id: value.draftSheetVersionId }, options);
    if (!draft || draft.createdBy !== "agent") invalid("Retained specialist sheet draft was not found.");
    const artifact = await database.collections.artifacts.findOne({ _id: draft.artifactId }, options);
    if (!artifact || artifact.experimentRunId !== run._id || artifact.bookletId !== run.bookletId ||
      (artifact.taskId !== "J09" && artifact.taskId !== "J10") || !artifact.currentVersionId) invalid("Sheet draft belongs to another target.");
    const task = artifact.taskId;
    const proposal = parseReferenceProposal(task, "proposal", json(draft.contentJson)).content;
    if (!("finalListVersionId" in proposal)) invalid("Sheet proposal is invalid.");
    const subjectKind = task === "J09" ? "character" : "location";
    const subjectId = "characterId" in proposal ? proposal.characterId : proposal.locationId;
    if (artifact.subjectKind !== subjectKind || artifact.subjectId !== subjectId) invalid("Sheet subject differs from its saved artifact.");
    const current = await database.collections.artifact_versions.findOne({ _id: artifact.currentVersionId, artifactId: artifact._id }, options);
    if (!current || artifact.state === "needs_review" || artifact.state === "rejected") conflict("Sheet target is stale.");
    if (current._id === draft._id ? artifact.state !== "draft" : current.sourceVersionId !== draft._id || current.createdBy !== "application") conflict("Sheet draft is no longer the assembly target.");
    const sourceIds = [proposal.finalListVersionId, proposal.styleVersionId];
    if (canonical(json(draft.dependencyVersionIdsJson)) !== canonical(sourceIds)) conflict("Sheet draft dependencies differ.");
    for (const [index, taskId] of ([task === "J09" ? "J06" : "J07", "J08"] as const).entries()) {
      const sources = await database.collections.artifacts.find({ bookletId: run.bookletId, experimentRunId: run._id,
        taskId, subjectKind: "book", subjectId: run.bookletId }, options).toArray();
      if (sources.length !== 1 || sources[0].currentVersionId !== sourceIds[index] || sources[0].state !== "approved") conflict("Sheet sources are not current and approved.");
    }
    const finalList = await database.collections.artifact_versions.findOne({ _id: proposal.finalListVersionId }, options);
    const styleVersion = await database.collections.artifact_versions.findOne({ _id: proposal.styleVersionId }, options);
    if (!finalList || !styleVersion) invalid("Saved sheet source content is missing.");
    const style = parseReferenceProposal("J08", "assembled", json(styleVersion.contentJson)).content;
    if (style.stylePromptModule !== proposal.stylePromptModule || style.stylePromptModuleHash !== proposal.stylePromptModuleHash) conflict("Sheet style differs from the approved module.");
    if (task === "J09" && "characterId" in proposal) {
      const character = finalCharacterListSchema.parse(json(finalList.contentJson)).characters.find((item) => item.characterId === subjectId);
      if (!character?.sheetRequired || character.recurrence !== "recurring") invalid("Character is not an eligible sheet subject.");
      if (canonical(character.attireRequirements) !== canonical(proposal.attireRequirements) || canonical(character.accessories) !== canonical(proposal.accessories)) conflict("Sheet attire or accessories differ from approved facts.");
    } else if ("locationId" in proposal) {
      const location = finalLocationListSchema.parse(json(finalList.contentJson)).locations.find((item) => item.locationId === subjectId);
      if (!location?.sheetRequired) invalid("Location is not an eligible sheet subject.");
      if (canonical(location.stableAnchors) !== canonical(proposal.stableAnchors) || canonical(location.requiredFeatures) !== canonical(proposal.requiredFeatures)) conflict("Sheet anchors or features differ from approved facts.");
    } else invalid("Sheet target type differs.");
    const operation = await database.collections.experiment_operations.findOne({ _id: value.imageOperationId, runId: run._id }, options);
    if (!operation || operation.role !== "image" || operation.providerKind !== "image" || operation.taskId !== task ||
      operation.subjectKind !== subjectKind || operation.subjectId !== subjectId || operation.mode !== "simulated" ||
      operation.state !== "succeeded" || operation.reservationCount !== 1 || !operation.workflowRunId || operation.imageCompletionClaim) invalid("Sheet operation is not a completed authorized image.");
    const request = experimentImageRequestSchema.parse(json(operation.imageRequestJson));
    await assertCurrentImageSources(database, session, run, request);
    if (canonical(operation.dependencyVersionIds) !== canonical(sourceIds)) conflict("Sheet operation dependencies differ.");
    const asset = await database.collections.assets.findOne({ _id: operation._id, bookletId: run.bookletId }, options);
    if (!asset || asset.kind !== "reference" || !asset.width || !asset.height) invalid("Saved sheet asset is missing.");
    const metadata = metadataSchema.parse(json(asset.metadataJson));
    const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string | undefined>)[asset.mimeType];
    const result = { assetId: asset._id, sha256: metadata.sha256, uri: asset.uri };
    if (!extension || asset.uri !== `experiments/${run.bookletId}/${run._id}/${operation._id}/attempt-${operation.attempt}/image.${extension}` ||
      metadata.operationId !== operation._id || metadata.attempt !== operation.attempt || metadata.workflowRunId !== operation.workflowRunId ||
      metadata.parentWorkflowRunId !== operation.parentWorkflowRunId || metadata.inputFingerprint !== operation.inputFingerprint ||
      canonical(metadata.request) !== canonical(request) || canonical(metadata.sourceVersionIds) !== canonical(sourceIds) ||
      operation.resultDigest !== metadata.sha256 || operation.imageCompletionDigest !== metadata.sha256 ||
      canonical(json(operation.resultJson)) !== canonical(result) || canonical(json(operation.materializationJson)) !== canonical(result)) conflict("Saved sheet lineage is inconsistent.");
    const assembled = assembleReferenceSheet(task, proposal, { operationId: operation._id, assetId: asset._id,
      inputFingerprint: operation.inputFingerprint, request });
    const dependencies = [draft._id, ...sourceIds];
    if (current._id !== draft._id) {
      const edges = await database.collections.artifact_dependencies.find({ downstreamVersionId: current._id }, options).toArray();
      if (canonical(json(current.contentJson)) !== canonical(assembled.content) ||
        canonical(json(current.dependencyVersionIdsJson)) !== canonical(dependencies) ||
        canonical(edges.map((edge) => edge.upstreamVersionId).sort()) !== canonical([...dependencies].sort())) conflict("Existing sheet assembly uses different or incomplete evidence.");
    }
    return { run, artifact, draft, current, assembled, dependencies,
      bytes: { uri: asset.uri, sha256: metadata.sha256, byteLength: metadata.byteLength } };
  }
  async function assemble(raw: unknown) {
    const value = inputSchema.parse(raw);
    const initial = await withMongoTransaction(database, (session) => load(value, session));
    try {
      if (!await store.exists(initial.bytes.uri)) invalid("Saved sheet bytes are missing.");
      const bytes = await store.get(initial.bytes.uri);
      if (bytes.byteLength !== initial.bytes.byteLength || createHash("sha256").update(bytes).digest("hex") !== initial.bytes.sha256) invalid("Saved sheet bytes are corrupt.");
    } catch { invalid("Sheet storage verification failed."); }
    return withMongoTransaction(database, async (session) => {
      const checked = await load(value, session);
      if (canonical(initial.bytes) !== canonical(checked.bytes)) conflict("Sheet storage identity changed during assembly.");
      if (checked.current._id !== checked.draft._id) return { reused: true, version: checked.current };
      const timestamp = now();
      const version = { _id: randomUUID(), artifactId: checked.artifact._id, versionNumber: checked.draft.versionNumber + 1,
        schemaVersion: "2", contentJson: canonical(checked.assembled.content), dependencyVersionIdsJson: canonical(checked.dependencies),
        createdBy: "application", sourceVersionId: checked.draft._id, sourceExecutionBatchId: null,
        warningsJson: canonical([...z.array(z.object({ field: z.string(), message: z.string() })).parse(json(checked.draft.warningsJson ?? "[]")), ...checked.assembled.warnings]), createdAtMs: timestamp };
      await database.collections.artifact_versions.insertOne(version, { session });
      await database.collections.artifact_dependencies.insertMany(checked.dependencies.map((upstreamVersionId) => ({
        _id: randomUUID(), downstreamVersionId: version._id, upstreamVersionId, createdAtMs: timestamp,
      })), { session });
      const changed = await database.collections.artifacts.updateOne({ _id: checked.artifact._id, currentVersionId: checked.draft._id,
        state: "draft" }, { $set: { currentVersionId: version._id, updatedAtMs: timestamp } }, { session });
      if (changed.modifiedCount !== 1) conflict("Sheet target changed during assembly.");
      const runChanged = await database.collections.experiment_runs.updateOne({ _id: checked.run._id, revision: checked.run.revision,
        activeOperationId: null }, { $inc: { revision: 1 }, $set: { updatedAtMs: timestamp } }, { session });
      if (runChanged.modifiedCount !== 1) conflict("Sheet run changed during assembly.");
      return { reused: false, version };
    });
  }
  return { assemble };
}
