import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { withMongoTransaction } from "@/db/client";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { assertCurrentImageSources } from "@/db/experiment-images";
import { verifyCurrentPageIllustrationSources } from "@/db/experiment-pages";
import { createExecutionAllowanceLedger } from "@/db/experiment-execution-allowance";
import { experimentImageRequestSchema, imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { executionPolicySnapshot } from "@/lib/experiment-runner/execution-policy";
import { realImageRequest, verifyRealImageRequest, type RealImageRequest } from "@/lib/experiment-runner/real-image-contract";
import { m4CanonicalJson } from "@/lib/experiment-runner/m4-request";
import type { AssetStore } from "@/lib/assets/asset-store";
import { RECONCILIATION_RESERVE_MS } from "@/lib/operations/budget";

function conflict(message: string): never { throw new ExperimentRepositoryError("conflict", message); }

// The logical request remains the saved operation identity. This separate
// request binds provider settings to the selected original reference bytes.
export async function currentRealImageRequest(database: Database, session: ClientSession,
  run: ExperimentRunDocument, operation: ExperimentOperationDocument, store: AssetStore): Promise<RealImageRequest> {
  if (run.mode !== "real" || operation.mode !== "real" || operation.providerKind !== "image" ||
      !operation.imageRequestJson || !run.execution || operation.inputFingerprint.length !== 64) {
    conflict("Real image operation is not current.");
  }
  const campaign = await createExecutionAllowanceLedger(database).current(session, run.execution.campaignId, run);
  const policy = executionPolicySnapshot(JSON.parse(campaign.profileJson)).policy;
  if (policy.mode !== "real" || !policy.realImage) conflict("Real image technical profile is incomplete.");
  const logical = experimentImageRequestSchema.parse(JSON.parse(operation.imageRequestJson));
  if (imageRequestFingerprint(logical) !== operation.inputFingerprint ||
      m4CanonicalJson(logical.sourceVersionIds) !== m4CanonicalJson(operation.dependencyVersionIds)) {
    conflict("Real image logical request differs from its saved operation.");
  }
  let references: RealImageRequest["references"] = [];
  if (operation.taskId === "J13") {
    const sources = await verifyCurrentPageIllustrationSources(database, session, run, operation.subjectId, store);
    if (m4CanonicalJson(sources.request.request) !== m4CanonicalJson(logical)) {
      conflict("Real page image sources changed.");
    }
    references = sources.attachments.map(item => ({ assetId: item.assetId,
      versionId: item.artifactVersionId, sha256: item.sha256, byteLength: item.byteLength,
      mimeType: item.mimeType, width: item.width, height: item.height }));
    const uploads = JSON.parse(operation.referenceUploadsJson ?? "null") as unknown;
    if (!Array.isArray(uploads) || uploads.length !== references.length || uploads.some((raw, index) => {
      const item = raw as Record<string, unknown>, reference = references[index]!;
      return item.assetId !== reference.assetId || item.artifactVersionId !== reference.versionId ||
        item.sha256 !== reference.sha256 || item.byteLength !== reference.byteLength ||
        item.mimeType !== reference.mimeType || item.width !== reference.width || item.height !== reference.height ||
        typeof item.uploadFileId !== "string" || !item.uploadFileId;
    })) conflict("Real image original references differ from uploaded file evidence.");
  } else await assertCurrentImageSources(database, session, run, logical);
  if (logical.prompt.length > 32_000) conflict("Image prompt exceeds the provider's 32,000-character limit.");
  return realImageRequest({ schemaVersion: "booklet_real_image_request_v1",
    operation: references.length ? "edit" : "generate", prompt: logical.prompt,
    model: policy.realImage.model, size: policy.realImage.size, quality: policy.realImage.quality,
    background: policy.realImage.background, outputFormat: policy.realImage.outputFormat,
    n: policy.realImage.n, retries: policy.realImage.retries,
    timeoutSeconds: policy.realImage.timeoutSeconds,
    deadlineAtMs: operation.deadlineAtMs! - RECONCILIATION_RESERVE_MS, references });
}

export function createRealImagePreparation(database: Database, store: AssetStore) {
  async function prepare(input: { runId: string; operationId: string; nowMs: number }) {
    return withMongoTransaction(database, async session => {
      const run = await database.collections.experiment_runs.findOne({ _id: input.runId }, { session });
      const operation = await database.collections.experiment_operations.findOne({ _id: input.operationId,
        runId: input.runId }, { session });
      if (!run || !operation || run.activeOperationId !== operation._id || run.pauseRequested ||
          !["queued", "running"].includes(run.status) || operation.state !== "prepared" ||
          operation.dispatchStartedAtMs != null || !operation.deadlineAtMs ||
          input.nowMs >= operation.deadlineAtMs - RECONCILIATION_RESERVE_MS) {
        conflict("Real image preparation has no current undispatched operation.");
      }
      const request = await currentRealImageRequest(database, session, run, operation, store);
      if (operation.realImagePreparation) {
        if (operation.realImagePreparation.requestJson !== m4CanonicalJson(request) ||
            operation.realImagePreparation.logicalFingerprint !== operation.inputFingerprint) {
          conflict("Saved Real image provider request differs from current original sources.");
        }
        return request;
      }
      const saved = await database.collections.experiment_operations.updateOne({ _id: operation._id,
        state: "prepared", dispatchStartedAtMs: null, realImagePreparation: { $exists: false } }, { $set: {
        realImagePreparation: { requestJson: m4CanonicalJson(request), requestDigest: request.requestDigest,
          logicalFingerprint: operation.inputFingerprint, preparedAtMs: input.nowMs },
      } }, { session });
      if (saved.modifiedCount !== 1) conflict("Real image preparation changed concurrently.");
      return request;
    });
  }
  async function verify(session: ClientSession, run: ExperimentRunDocument,
    operation: ExperimentOperationDocument): Promise<RealImageRequest> {
    const saved = operation.realImagePreparation;
    if (!saved) conflict("Real image semantic request was not prepared.");
    const current = await currentRealImageRequest(database, session, run, operation, store);
    const retained = verifyRealImageRequest(JSON.parse(saved.requestJson));
    if (saved.requestDigest !== current.requestDigest || saved.requestJson !== m4CanonicalJson(current) ||
        saved.logicalFingerprint !== operation.inputFingerprint || retained.requestDigest !== current.requestDigest) {
      conflict("Real image semantic request or original references changed before claim.");
    }
    return current;
  }
  return { prepare, verify };
}
