import { randomUUID, createHash } from "node:crypto";
import type { Database } from "@/db/client";
import { createExperimentImageRepository } from "@/db/experiment-images";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import type { AssetStore } from "@/lib/assets/asset-store";
import { ExperimentImageValidationError, MAX_EXPERIMENT_IMAGE_BYTES, validateExperimentImage } from "@/lib/experiment-runner/image-validation";
import { measurePhase } from "@/lib/experiment-runner/diagnostics";

type Identity = { runId: string; operationId: string; workflowRunId: string; parentWorkflowRunId: string | null; inputFingerprint: string };
function hash(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
function storageFailure(): never { throw new ExperimentRepositoryError("invalid_state", "Image storage could not verify the original bytes."); }

export function createExperimentImageStorage(input: { database: Database; store: AssetStore; now?: () => number; newClaimId?: () => string }) {
  const repository = createExperimentImageRepository(input.database, { store: () => input.store });
  const now = input.now ?? Date.now;
  const newClaimId = input.newClaimId ?? randomUUID;

  async function complete(raw: { identity: Identity; content: Uint8Array }) {
    await measurePhase(raw.identity, "image_preflight", () => repository.preflight({ ...raw.identity, nowMs: now() }));
    // The copy is the exact byte sequence validated, stored, and hashed.
    if (raw.content.byteLength > MAX_EXPERIMENT_IMAGE_BYTES) throw new ExperimentImageValidationError("too_large");
    const bytes = Uint8Array.from(raw.content);
    const validatedImage = await measurePhase(raw.identity, "image_decode", () => validateExperimentImage(bytes));
    const claimId = newClaimId();
    const claimInput = { ...raw.identity, validatedImage, claimId, nowMs: now() };
    const claim = await measurePhase(raw.identity, "image_claim", () => repository.claim(claimInput));
    if (claim.reused) {
      try {
        const saved = await measurePhase(raw.identity, "image_reused_readback", () => claim.asset ? input.store.get(claim.asset.uri) : Promise.reject(new Error("missing asset")));
        if (hash(saved) !== validatedImage.sha256) storageFailure();
      } catch { storageFailure(); }
      return claim;
    }
    const run = await input.database.collections.experiment_runs.findOne({ _id: raw.identity.runId });
    if (!run) throw new ExperimentRepositoryError("not_found", "Image run was not found.");
    const uri = `experiments/${run.bookletId}/${run._id}/${claim.operation._id}/attempt-${claim.operation.attempt}/image.${validatedImage.extension}`;
    try {
      await measurePhase(raw.identity, "image_storage", async () => {
        if (await input.store.exists(uri)) {
          if (hash(await input.store.get(uri)) !== validatedImage.sha256) storageFailure();
        } else {
          try { await input.store.put(uri, bytes, validatedImage.mimeType); }
          catch {
            // An exclusive-write collision can be another completion or a retained
            // store result after an interrupted response. Verify before reuse.
            if (!await input.store.exists(uri) || hash(await input.store.get(uri)) !== validatedImage.sha256) storageFailure();
          }
        }
        if (hash(await input.store.get(uri)) !== validatedImage.sha256) storageFailure();
      });
    } catch {
      try { await repository.release({ ...raw.identity, claimId, nowMs: now() }); }
      catch { /* The lease expires and can be recovered without another image request. */ }
      storageFailure();
    }
    return measurePhase(raw.identity, "image_finalize", () => repository.finalize({ ...claimInput, uri, nowMs: now() }));
  }
  return { complete };
}
