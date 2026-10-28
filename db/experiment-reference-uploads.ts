import { z } from "zod";
import { withMongoTransaction, type Database } from "@/db/client";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { verifyCurrentPageIllustrationSources } from "@/db/experiment-pages";
import type { AssetStore } from "@/lib/assets/asset-store";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { pageIllustrationAttachmentSchema } from "@/lib/contracts/experiment-page-illustrations";
import { configuredPageIllustrationTask } from "@/lib/experiment-runner/page-illustration-tasks";
import { savedConfigurationSchema, type BookletBinding } from "@/lib/experiment-runner/config";
import type { ReferenceUploadResult } from "@/lib/experiment-runner/reference-transport";
import { MAX_REFERENCE_UPLOAD_BYTES } from "@/lib/experiment-runner/image-limits";
import { measurePhase } from "@/lib/experiment-runner/diagnostics";
import { hasExperimentImagePolicy } from "@/db/experiment-m4-state";
import { operationSignal, remainingOperationMs } from "@/lib/operations/budget";

const identity = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema, parentWorkflowRunId: opaqueIdSchema });
const acknowledgement = pageIllustrationAttachmentSchema.transform(({ uploadUser, ...item }) => {
  // Ownership is derived from the run, not retained from caller input.
  void uploadUser;
  return item;
});
const journalSchema = z.array(z.strictObject({
  assetId: opaqueIdSchema, artifactVersionId: opaqueIdSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(["started", "uploaded", "unknown", "rejected"]),
  uploadFileId: opaqueIdSchema.nullable(),
})).max(15);
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
function conflict(message: string): never { throw new ExperimentRepositoryError("conflict", message); }

// Network calls stay outside retryable Mongo transactions. A durable started
// marker survives a lost response or process exit and prevents another POST.
// This service does not dispatch a workflow or recover an unknown file identity.
export function createExperimentReferenceUploads(input: {
  database: Database; store: AssetStore;
  upload: (binding: BookletBinding, runId: string, bytes: Uint8Array) => Promise<ReferenceUploadResult>;
}) {
  const { database } = input;
  async function prepare(raw: unknown, binding: BookletBinding): Promise<
    { kind: "ready"; fileIds: string[] } | { kind: "unknown" } | { kind: "rejected" }
  > {
    const value = identity.parse(raw);
    // Original bytes are immutable evidence for this one preparation only.
    // Every upload admission still reads current metadata in a fresh transaction
    // and validates these bytes against its current digest/length/approval chain.
    const bytes = new Map<string, Uint8Array>();
    const preparedStore: AssetStore = { ...input.store,
      put: (...args) => input.store.put(...args), exists: (uri) => input.store.exists(uri),
      async get(uri) {
        if (!bytes.has(uri)) bytes.set(uri, Uint8Array.from(await input.store.get(uri)));
        return Uint8Array.from(bytes.get(uri)!);
      },
    };
    for (;;) {
      const next = await withMongoTransaction(database, async (session) => {
        const options = { session };
        const run = await database.collections.experiment_runs.findOne({ _id: value.runId }, options);
        const operation = await database.collections.experiment_operations.findOne({ _id: value.operationId, runId: value.runId }, options);
        if (!run || !operation || run.mode !== "simulated" && !hasExperimentImagePolicy(run) || !configuredPageIllustrationTask(run.configurationJson) ||
            operation.role !== "image" || operation.taskId !== "J13" || operation.subjectKind !== "page" ||
            operation.mode !== run.mode || operation.providerKind !== "image" || operation.state !== "prepared" || operation.lifecycle?.stop ||
            operation.dispatchStartedAtMs != null || operation.workflowRunId !== null || operation.reservationCount !== 0 ||
            run.activeOperationId !== operation._id || !["queued", "running"].includes(run.status) || run.pauseRequested ||
            operationSignal()?.aborted || remainingOperationMs() <= 0) {
          conflict("Reference upload requires current, undispatched simulated J13 work.");
        }
        const configuration = savedConfigurationSchema.parse(JSON.parse(run.configurationJson));
        const saved = configuration.find((item) =>
          item.role === "image" && item.taskId === null && item.finalPageIllustration === true);
        if (!saved || binding.role !== "image" || binding.taskId !== null || binding.persona !== null ||
            binding.finalPageIllustration !== true || binding.appId !== saved.appId || binding.publishedWorkflowId !== saved.publishedWorkflowId) {
          conflict("Reference upload binding differs from the saved image publication.");
        }
        const managerBinding = configuration.find((item) => item.role === "manager" && item.taskId === null);
        const manager = await database.collections.experiment_operations.findOne({ runId: run._id, role: "manager", taskId: null,
          subjectKind: "book", subjectId: run.bookletId, mode: run.mode, providerKind: "text", state: "succeeded",
          reservationCount: 1, workflowRunId: value.parentWorkflowRunId }, options);
        const decision = z.strictObject({ kind: z.literal("delegate"), payload: z.strictObject({ taskId: z.literal("J13"),
          subjectKind: z.literal("page"), subjectId: opaqueIdSchema }) }).safeParse(JSON.parse(manager?.resultJson ?? "null"));
        if (!manager || !managerBinding || manager.verifiedWorkflowId !== managerBinding.publishedWorkflowId ||
            !decision.success || decision.data.payload.subjectId !== operation.subjectId ||
            (operation.parentWorkflowRunId !== null && operation.parentWorkflowRunId !== value.parentWorkflowRunId)) {
          conflict("Reference upload requires the verified manager selection for this page.");
        }
        const sources = await measurePhase(value, "reference_source_verification", () =>
          verifyCurrentPageIllustrationSources(database, session, run, operation.subjectId, preparedStore));
        if (canonical(JSON.parse(operation.imageRequestJson ?? "null")) !== canonical(sources.request.request) ||
            imageRequestFingerprint(sources.request.request) !== operation.inputFingerprint ||
            canonical(operation.dependencyVersionIds) !== canonical(sources.request.request.sourceVersionIds)) {
          conflict("Reference upload sources changed.");
        }
        const selected = sources.attachments;
        if (selected.length > 15 || selected.some((item) => item.byteLength > MAX_REFERENCE_UPLOAD_BYTES)) {
          conflict("Selected references exceed the runtime file limits.");
        }
        const journal = journalSchema.parse(JSON.parse(operation.referenceUploadJournalJson ?? "[]"));
        const acknowledgements = z.array(acknowledgement).max(15).parse(JSON.parse(operation.referenceUploadsJson ?? "[]")
          .map((item: Record<string, unknown>) => ({ ...item, uploadUser: `booklet-${run._id}` })));
        if (journal.length > selected.length || journal.some((item, index) => {
          const reference = selected[index]!;
          return item.assetId !== reference.assetId || item.artifactVersionId !== reference.artifactVersionId || item.sha256 !== reference.sha256;
        })) conflict("Retained upload journal differs from current selected references.");
        const completed = journal.filter((item) => item.state === "uploaded");
        if (completed.length !== acknowledgements.length || acknowledgements.some((item, index) => {
          const reference = selected[index]!, attempt = journal[index]!;
          return attempt.state !== "uploaded" || item.uploadFileId !== attempt.uploadFileId ||
            item.role !== reference.subjectKind || item.subjectId !== reference.subjectId || item.assetId !== reference.assetId ||
            item.artifactVersionId !== reference.artifactVersionId || item.sha256 !== reference.sha256 ||
            item.mimeType !== reference.mimeType || item.byteLength !== reference.byteLength || item.width !== reference.width || item.height !== reference.height;
        }) || new Set(acknowledgements.map((item) => item.uploadFileId)).size !== acknowledgements.length) {
          conflict("Retained upload acknowledgements differ from selected reference evidence.");
        }
        if (journal.some((item) => item.state === "rejected")) return { kind: "rejected" as const };
        if (journal.some((item) => item.state !== "uploaded")) return { kind: "unknown" as const };
        if (journal.length === selected.length) {
          // Persist [] for reference-free pages so assembly can distinguish a
          // verified empty route from missing preparation.
          await database.collections.experiment_operations.updateOne({ _id: operation._id },
            { $set: { referenceUploadsJson: JSON.stringify(acknowledgements), parentWorkflowRunId: value.parentWorkflowRunId } }, options);
          return { kind: "ready" as const, fileIds: acknowledgements.map((item) => item.uploadFileId) };
        }
        const reference = selected[journal.length]!;
        journal.push({ assetId: reference.assetId, artifactVersionId: reference.artifactVersionId,
          sha256: reference.sha256, state: "started", uploadFileId: null });
        const marker = JSON.stringify(journal);
        // Pause and admission write the same run document. If Pause commits
        // after our snapshot read, Mongo retries this transaction and observes
        // the paused state before any POST can start.
        const admitted = await database.collections.experiment_runs.updateOne({ _id: run._id, revision: run.revision,
          activeOperationId: operation._id, pauseRequested: false, status: { $in: ["queued", "running"] } },
        { $inc: { revision: 1 } }, options);
        if (admitted.modifiedCount !== 1) conflict("Run changed before reference upload admission.");
        await database.collections.experiment_operations.updateOne({ _id: operation._id },
          { $set: { referenceUploadJournalJson: marker, parentWorkflowRunId: value.parentWorkflowRunId } }, options);
        return { kind: "upload" as const, reference, marker, journal, acknowledgements };
      });
      if (next.kind !== "upload") return next;
      let result: ReferenceUploadResult;
      try { result = await measurePhase(value, "reference_upload", () => input.upload(binding, value.runId, Uint8Array.from(next.reference.bytes))); }
      catch { result = { kind: "unknown" }; }
      const reference = next.reference;
      if (result.kind === "uploaded") {
        const returnedId = result.id;
        if (result.sha256 !== reference.sha256 || result.byteLength !== reference.byteLength ||
            result.mimeType !== reference.mimeType || !opaqueIdSchema.safeParse(returnedId).success ||
            next.acknowledgements.some((item) => item.uploadFileId === returnedId)) result = { kind: "unknown" };
      }
      const last = next.journal[next.journal.length - 1]!;
      last.state = result.kind;
      if (result.kind === "uploaded") {
        last.uploadFileId = result.id;
        next.acknowledgements.push({ role: reference.subjectKind, subjectId: reference.subjectId, assetId: reference.assetId,
          artifactVersionId: reference.artifactVersionId, uploadFileId: result.id, mimeType: reference.mimeType,
          sha256: reference.sha256, byteLength: reference.byteLength, width: reference.width, height: reference.height });
      }
      const saved = await database.collections.experiment_operations.updateOne({ _id: value.operationId, runId: value.runId,
        referenceUploadJournalJson: next.marker }, { $set: {
        referenceUploadJournalJson: JSON.stringify(next.journal), referenceUploadsJson: JSON.stringify(next.acknowledgements),
      } });
      if (saved.matchedCount !== 1) conflict("Upload acknowledgement could not be reconciled; do not repeat the upload.");
      if (result.kind !== "uploaded") return result.kind === "rejected" ? { kind: "rejected" } : { kind: "unknown" };
    }
  }
  return { prepare };
}
