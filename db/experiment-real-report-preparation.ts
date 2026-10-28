import { withMongoTransaction, type Database } from "@/db/client";
import { verifyExperimentGeneration } from "@/db/experiment-completion";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import type { AssetStore } from "@/lib/assets/asset-store";
import type { BookletBinding } from "@/lib/experiment-runner/config";
import type { ReferenceUploadResult } from "@/lib/experiment-runner/reference-transport";
import { validateExperimentImage } from "@/lib/experiment-runner/image-validation";
import { MAX_REFERENCE_UPLOAD_BYTES } from "@/lib/experiment-runner/image-limits";
import { realReportCarrier } from "@/lib/experiment-runner/real-report-carrier";
import { executionPolicySnapshot } from "@/lib/experiment-runner/execution-policy";
import { m4AuthorizedCarrier, m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import { RECONCILIATION_RESERVE_MS } from "@/lib/operations/budget";

type Identity = { runId: string; operationId: string; nowMs: number };
type Journal = Array<{ assetId: string; versionId: string; sha256: string;
  state: "started" | "uploaded" | "unknown" | "rejected"; uploadFileId: string | null }>;
function conflict(message: string): never { throw new ExperimentRepositoryError("conflict", message); }

// A report uses current final originals only. A started upload without its
// acknowledgement is retained and cannot cause another Dify file POST.
export function createRealReportPreparation(input: { database: Database; store: AssetStore;
  upload: (binding: BookletBinding, runId: string, bytes: Uint8Array) => Promise<ReferenceUploadResult> }) {
  const { database, store } = input;
  async function current(value: Identity, binding: BookletBinding) {
    return withMongoTransaction(database, async session => {
      const run = await database.collections.experiment_runs.findOne({ _id: value.runId }, { session });
      const operation = await database.collections.experiment_operations.findOne({ _id: value.operationId, runId: value.runId }, { session });
      if (!run || !operation || run.mode !== "real" || !run.execution || operation.mode !== "real" ||
          !["tester", "judge"].includes(operation.role) || operation.providerKind !== "text" ||
          operation.state !== "prepared" || operation.dispatchStartedAtMs != null || operation.reservationCount !== 0 ||
          run.activeOperationId !== operation._id || run.pauseRequested || !["queued", "running"].includes(run.status) ||
          !operation.deadlineAtMs || value.nowMs >= operation.deadlineAtMs - RECONCILIATION_RESERVE_MS ||
          !operation.m4Preparation || operation.m4Preparation.requestDigest !== m4Hash(operation.m4Preparation.requestJson))
        conflict("Real report requires current unclaimed text preparation.");
      const profile = executionPolicySnapshot(JSON.parse(run.execution.profileJson));
      const publication = profile.policy.publications.find(item => item.role === operation.role && item.taskId === null &&
        item.persona === (operation.role === "tester" ? run.persona : null));
      if (profile.policy.mode !== "real" || profile.hash !== run.execution.profileHash ||
          !publication || binding.appId !== publication.appId || binding.publishedWorkflowId !== publication.publishedWorkflowId)
        conflict("Real report publication differs from its frozen profile.");
      const generation = await verifyExperimentGeneration(database, session, run, store, operation._id, "preparation", value.nowMs);
      const images = [];
      for (const final of generation.finalPages) {
        const asset = await database.collections.assets.findOne({ _id: final.assetId, bookletId: run.bookletId }, { session });
        if (!asset) conflict("Real report final image asset is absent.");
        const bytes = Uint8Array.from(await store.get(asset.uri));
        const checked = await validateExperimentImage(bytes);
        if (bytes.byteLength > MAX_REFERENCE_UPLOAD_BYTES || checked.mimeType !== asset.mimeType ||
            checked.width !== asset.width || checked.height !== asset.height) conflict("Real report final original differs from asset evidence.");
        images.push({ manifest: { assetId: asset._id, versionId: final.versionId, sha256: checked.sha256,
          byteLength: checked.byteLength, mimeType: checked.mimeType, width: checked.width, height: checked.height }, bytes });
      }
      if (!images.length || images.length > 15 || new Set(images.map(item => item.manifest.assetId)).size !== images.length)
        conflict("Real report requires one ordered set of final originals.");
      const textRequestJson = m4AuthorizedCarrier(operation.m4Preparation.requestJson, profile.policy.tokenPolicy).requestJson;
      const prepared = realReportCarrier({ textRequestJson, images,
        deadlineAtMs: operation.deadlineAtMs - RECONCILIATION_RESERVE_MS });
      return { run, operation, images, prepared };
    });
  }
  async function prepare(value: Identity, binding: BookletBinding): Promise<
    { kind: "ready"; fileIds: string[]; carrierJson: string } | { kind: "unknown" | "rejected" }> {
    for (;;) {
      const selected = await current(value, binding);
      const journal = JSON.parse(selected.operation.realReportUploadJournalJson ?? "[]") as Journal;
      if (!Array.isArray(journal) || journal.length > selected.images.length || journal.some((row, index) => {
        const expected = selected.images[index]!.manifest;
        return row.assetId !== expected.assetId || row.versionId !== expected.versionId || row.sha256 !== expected.sha256 ||
          !["started", "uploaded", "unknown", "rejected"].includes(row.state);
      })) conflict("Real report upload journal differs from current original images.");
      if (journal.some(row => row.state !== "uploaded")) return { kind: journal.some(row => row.state === "rejected") ? "rejected" : "unknown" };
      if (journal.length === selected.images.length) {
        const fileIds = journal.map(row => row.uploadFileId);
        if (fileIds.some(id => !id) || new Set(fileIds).size !== fileIds.length) conflict("Real report file acknowledgements are incomplete.");
        const retained = selected.operation.realReportPreparation;
        const record = { carrierJson: selected.prepared.carrierJson,
          manifestDigest: selected.prepared.carrier.manifestDigest,
          finalRequestDigest: selected.prepared.carrier.finalRequestDigest,
          textRequestDigest: selected.prepared.carrier.textRequestDigest,
          orderedImages: selected.prepared.carrier.orderedImages,
          uploadFileIds: fileIds as string[], preparedAtMs: value.nowMs };
        if (retained && m4CanonicalJson(retained) !== m4CanonicalJson(record)) {
          const { preparedAtMs: _old, ...prior } = retained;
          const { preparedAtMs: _new, ...next } = record;
          void _old; void _new;
          if (m4CanonicalJson(prior) !== m4CanonicalJson(next)) conflict("Real report saved manifest differs from current originals.");
        }
        if (!retained) {
          const saved = await database.collections.experiment_operations.updateOne({ _id: value.operationId, runId: value.runId,
            state: "prepared", realReportPreparation: { $exists: false }, realReportUploadJournalJson: selected.operation.realReportUploadJournalJson },
          { $set: { realReportPreparation: record } });
          if (saved.modifiedCount !== 1) conflict("Real report preparation changed concurrently.");
        }
        return { kind: "ready", fileIds: fileIds as string[], carrierJson: selected.prepared.carrierJson };
      }
      const image = selected.images[journal.length]!;
      const next = [...journal, { assetId: image.manifest.assetId, versionId: image.manifest.versionId,
        sha256: image.manifest.sha256, state: "started" as const, uploadFileId: null }];
      const marker = JSON.stringify(next);
      await withMongoTransaction(database, async session => {
        const run = await database.collections.experiment_runs.findOne({ _id: value.runId }, { session });
        const operation = await database.collections.experiment_operations.findOne({ _id: value.operationId }, { session });
        if (!run || !operation || run.revision !== selected.run.revision || operation.realReportUploadJournalJson !== selected.operation.realReportUploadJournalJson ||
            run.pauseRequested || run.activeOperationId !== operation._id || operation.dispatchStartedAtMs != null)
          conflict("Real report upload changed before admission.");
        const admitted = await database.collections.experiment_runs.updateOne({ _id: run._id, revision: run.revision },
          { $inc: { revision: 1 } }, { session });
        const saved = await database.collections.experiment_operations.updateOne({ _id: operation._id,
          realReportUploadJournalJson: operation.realReportUploadJournalJson },
        { $set: { realReportUploadJournalJson: marker } }, { session });
        if (admitted.modifiedCount !== 1 || saved.modifiedCount !== 1) conflict("Real report upload admission changed concurrently.");
      });
      let result: ReferenceUploadResult;
      try { result = await input.upload(binding, value.runId, image.bytes); }
      catch { result = { kind: "unknown" }; }
      if (result.kind === "uploaded") {
        const uploaded = result;
        if (uploaded.sha256 !== image.manifest.sha256 || uploaded.byteLength !== image.manifest.byteLength ||
            uploaded.mimeType !== image.manifest.mimeType || journal.some(row => row.uploadFileId === uploaded.id))
          result = { kind: "unknown" };
      }
      if (result.kind === "uploaded") {
        const uploaded = result;
        next[next.length - 1] = { ...next[next.length - 1]!, state: "uploaded", uploadFileId: uploaded.id };
      } else {
        next[next.length - 1] = { ...next[next.length - 1]!, state: result.kind, uploadFileId: null };
      }
      const saved = await database.collections.experiment_operations.updateOne({ _id: value.operationId, runId: value.runId,
        realReportUploadJournalJson: marker }, { $set: { realReportUploadJournalJson: JSON.stringify(next) } });
      if (saved.modifiedCount !== 1) conflict("Real report upload acknowledgement is unresolved; do not repeat POST.");
      if (result.kind !== "uploaded") return { kind: result.kind };
    }
  }
  async function verify(value: Identity, binding: BookletBinding) {
    const selected = await current(value, binding);
    const saved = selected.operation.realReportPreparation;
    if (!saved || saved.carrierJson !== selected.prepared.carrierJson ||
        saved.manifestDigest !== selected.prepared.carrier.manifestDigest ||
        saved.finalRequestDigest !== selected.prepared.carrier.finalRequestDigest ||
        saved.textRequestDigest !== selected.prepared.carrier.textRequestDigest ||
        saved.uploadFileIds.length !== selected.images.length) conflict("Real report carrier or originals changed before dispatch.");
    return saved;
  }
  return { prepare, verify };
}
