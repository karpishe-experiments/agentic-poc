import { z } from "zod";
import type { ClientSession } from "mongodb";
import { withMongoTransaction, type Database } from "@/db/client";
import type { AssetDocument, ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentImageRequestSchema, imageRequestFingerprint, type ExperimentImageRequest } from "@/lib/contracts/experiment-image";
import { MAX_EXPERIMENT_IMAGE_BYTES, MAX_EXPERIMENT_IMAGE_PIXELS } from "@/lib/experiment-runner/image-validation";

const time = z.number().int().nonnegative();
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const identitySchema = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema, workflowRunId: opaqueIdSchema, parentWorkflowRunId: opaqueIdSchema.nullable(), inputFingerprint: digest });
const metadataSchema = z.strictObject({ mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]), extension: z.enum(["png", "jpg", "webp"]), width: z.number().int().positive(), height: z.number().int().positive(), byteLength: z.number().int().positive().max(MAX_EXPERIMENT_IMAGE_BYTES), sha256: digest })
  .refine((item) => item.width * item.height <= MAX_EXPERIMENT_IMAGE_PIXELS && ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[item.mimeType] === item.extension), "Image metadata is inconsistent.");
const claimSchema = identitySchema.extend({ validatedImage: metadataSchema, claimId: opaqueIdSchema, nowMs: time });
const finalizeSchema = claimSchema.omit({ validatedImage: true }).extend({ validatedImage: metadataSchema, uri: z.string().min(1) });
const releaseSchema = identitySchema.extend({ claimId: opaqueIdSchema, nowMs: time });
const LEASE_MS = 60_000;

function conflict(message: string): never { throw new ExperimentRepositoryError("conflict", message); }
function invalid(message: string): never { throw new ExperimentRepositoryError("invalid_state", message); }
function requestFor(operation: ExperimentOperationDocument): ExperimentImageRequest {
  if (!operation.imageRequestJson) return invalid("Image operation has no saved request.");
  try { return experimentImageRequestSchema.parse(JSON.parse(operation.imageRequestJson) as unknown); }
  catch { return invalid("Saved image request is invalid."); }
}

export async function assertCurrentImageSources(database: Database, session: ClientSession, run: ExperimentRunDocument, request: ExperimentImageRequest): Promise<void> {
  for (const sourceId of request.sourceVersionIds) {
    const version = await database.collections.artifact_versions.findOne({ _id: sourceId }, { session });
    if (!version) conflict("Image source version is missing.");
    const artifact = await database.collections.artifacts.findOne({ _id: version.artifactId }, { session });
    if (!artifact || artifact.experimentRunId !== run._id || artifact.bookletId !== run.bookletId || artifact.currentVersionId !== sourceId) conflict("Image source is not current for this run.");
    const styleDraft = request.kind === "style_preview" && request.styleVersionId === sourceId && artifact.taskId === "J08" && artifact.state === "draft";
    if (artifact.state !== "approved" && !styleDraft) conflict("Image source is not approved.");
    if (!styleDraft) {
      const approval = await database.collections.approvals.findOne({ experimentRunId: run._id, bookletId: run.bookletId, artifactVersionId: sourceId, scope: "artifact", action: "approve" }, { session });
      if (!approval) conflict("Image source has no saved approval for this version.");
    }
  }
}

export function createExperimentImageRepository(database: Database) {
  const runs = database.collections.experiment_runs;
  const operations = database.collections.experiment_operations;
  const assets = database.collections.assets;

  async function checked(input: z.infer<typeof identitySchema>, session: ClientSession) {
    const operation = await operations.findOne({ _id: input.operationId, runId: input.runId }, { session });
    const run = await runs.findOne({ _id: input.runId }, { session });
    if (!operation || !run) throw new ExperimentRepositoryError("not_found", "Image operation was not found.");
    if (operation.role !== "image" || operation.providerKind !== "image" || operation.mode !== "simulated" || run.mode !== "simulated" || operation.reservationCount !== 1) invalid("Operation is not an authorized simulated image claim.");
    if (operation.workflowRunId !== input.workflowRunId || operation.parentWorkflowRunId !== input.parentWorkflowRunId || operation.inputFingerprint !== input.inputFingerprint) conflict("Image completion identity differs from the saved claim.");
    const request = requestFor(operation);
    if (imageRequestFingerprint(request) !== input.inputFingerprint || JSON.stringify(request.sourceVersionIds) !== JSON.stringify(operation.dependencyVersionIds)) conflict("Saved image request or source identity changed.");
    return { operation, run, request };
  }

  async function assertRecoverable(run: ExperimentRunDocument, operation: ExperimentOperationDocument, session: ClientSession) {
    if ((operation.state === "started" || operation.state === "unknown") && run.activeOperationId === operation._id &&
        (["queued", "running", "paused"].includes(run.status) || operation.state === "unknown" && run.status === "blocked" && run.safeFailure === "unknown_outcome")) return;
    if (operation.state === "failed" && operation.safeFailure === "definite_failure" && run.status === "blocked" && run.safeFailure === "definite_failure" && run.activeOperationId === null) {
      const newer = await operations.findOne({ runId: run._id, $or: [{ createdAtMs: { $gt: operation.createdAtMs } }, { createdAtMs: operation.createdAtMs, _id: { $gt: operation._id } }] }, { session });
      if (!newer) return;
    }
    invalid("Image operation is no longer recoverable.");
  }

  async function authorizeFixture(raw: unknown): Promise<ExperimentImageRequest> {
    const input = identitySchema.parse(raw);
    return withMongoTransaction(database, async (session) => {
      const { operation, run, request } = await checked(input, session);
      // Download is read-only: reservation and the active operation must already
      // have been established by the ordinary provider authorization callback.
      if (operation.state !== "started" && operation.state !== "unknown") invalid("Image fixture operation has not started.");
      if (run.activeOperationId !== operation._id ||
          !(["queued", "running", "paused"].includes(run.status) || operation.state === "unknown" && run.status === "blocked" && run.safeFailure === "unknown_outcome")) invalid("Image fixture operation is no longer active.");
      await assertCurrentImageSources(database, session, run, request);
      return request;
    });
  }

  async function claim(raw: unknown): Promise<{ reused: boolean; operation: ExperimentOperationDocument; asset?: AssetDocument }> {
    const input = claimSchema.parse(raw);
    return withMongoTransaction(database, async (session) => {
      const { operation, run, request } = await checked(input, session);
      if (operation.imageCompletionDigest && operation.imageCompletionDigest !== input.validatedImage.sha256) conflict("Image operation has different original bytes.");
      if (operation.state === "succeeded") {
        const asset = await assets.findOne({ _id: operation._id, bookletId: run.bookletId }, { session });
        if (!asset || operation.imageCompletionDigest !== input.validatedImage.sha256) conflict("Saved image completion is inconsistent.");
        return { reused: true, operation, asset };
      }
      await assertRecoverable(run, operation, session);
      await assertCurrentImageSources(database, session, run, request);
      if (operation.imageCompletionClaim && operation.imageCompletionClaim.expiresAtMs > input.nowMs) conflict("Image completion is already claimed.");
      const updated = await operations.findOneAndUpdate({ _id: operation._id, state: operation.state, imageCompletionClaim: operation.imageCompletionClaim ?? null }, { $set: { imageCompletionDigest: input.validatedImage.sha256, imageCompletionClaim: { id: input.claimId, digest: input.validatedImage.sha256, expiresAtMs: input.nowMs + LEASE_MS }, updatedAtMs: input.nowMs } }, { session, returnDocument: "after" });
      if (!updated) conflict("Image completion claim changed concurrently.");
      return { reused: false, operation: updated };
    });
  }

  async function finalize(raw: unknown): Promise<{ reused: boolean; operation: ExperimentOperationDocument; asset: AssetDocument }> {
    const input = finalizeSchema.parse(raw);
    return withMongoTransaction(database, async (session) => {
      const { operation, run, request } = await checked(input, session);
      if (operation.state === "succeeded") {
        if (operation.imageCompletionDigest !== input.validatedImage.sha256) conflict("Saved image completion differs.");
        const saved = await assets.findOne({ _id: operation._id, bookletId: run.bookletId }, { session });
        if (!saved) conflict("Saved image asset is missing.");
        return { reused: true, operation, asset: saved };
      }
      await assertRecoverable(run, operation, session);
      await assertCurrentImageSources(database, session, run, request);
      const lease = operation.imageCompletionClaim;
      if (!lease || lease.id !== input.claimId || lease.digest !== input.validatedImage.sha256 || lease.expiresAtMs <= input.nowMs || operation.imageCompletionDigest !== input.validatedImage.sha256) conflict("Image completion claim expired or changed.");
      const expectedUri = `experiments/${run.bookletId}/${run._id}/${operation._id}/attempt-${operation.attempt}/image.${input.validatedImage.extension}`;
      if (input.uri !== expectedUri) conflict("Image storage path is not derived from this operation.");
      const metadata = { request, sha256: input.validatedImage.sha256, byteLength: input.validatedImage.byteLength, operationId: operation._id, attempt: operation.attempt, workflowRunId: operation.workflowRunId, parentWorkflowRunId: operation.parentWorkflowRunId, inputFingerprint: operation.inputFingerprint, sourceVersionIds: request.sourceVersionIds };
      const asset = { _id: operation._id, schemaVersion: "2", bookletId: run.bookletId, kind: request.kind, uri: expectedUri, mimeType: input.validatedImage.mimeType, width: input.validatedImage.width, height: input.validatedImage.height, sourceAssetId: null, metadataJson: JSON.stringify(metadata), createdAtMs: input.nowMs };
      await assets.insertOne(asset, { session });
      const summary = { assetId: asset._id, sha256: input.validatedImage.sha256, uri: asset.uri };
      const history = operation.imageFailureHistory ?? [];
      const updated = await operations.findOneAndUpdate({ _id: operation._id, state: operation.state, "imageCompletionClaim.id": input.claimId }, { $set: { state: "succeeded", imageCompletionClaim: null, imageFailureHistory: history, resultDigest: input.validatedImage.sha256, resultJson: JSON.stringify(summary), materializationJson: JSON.stringify(summary), safeFailure: null, updatedAtMs: input.nowMs } }, { session, returnDocument: "after" });
      if (!updated) conflict("Image operation changed before finalization.");
      const changed = await runs.updateOne({ _id: run._id, revision: run.revision, activeOperationId: run.activeOperationId }, { $set: { activeOperationId: null, status: run.pauseRequested ? "paused" : "queued", safeFailure: null, updatedAtMs: input.nowMs }, $inc: { revision: 1 } }, { session });
      if (changed.modifiedCount !== 1) conflict("Image run changed before finalization.");
      return { reused: false, operation: updated, asset };
    });
  }

  async function release(raw: unknown): Promise<void> {
    const input = releaseSchema.parse(raw);
    await operations.updateOne({ _id: input.operationId, runId: input.runId, workflowRunId: input.workflowRunId, parentWorkflowRunId: input.parentWorkflowRunId, inputFingerprint: input.inputFingerprint, "imageCompletionClaim.id": input.claimId, state: { $in: ["started", "unknown", "failed"] } }, { $set: { imageCompletionClaim: null, updatedAtMs: input.nowMs } });
  }
  return { authorizeFixture, claim, finalize, release };
}
