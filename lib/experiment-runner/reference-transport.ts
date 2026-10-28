import { opaqueIdSchema } from "@/lib/contracts/common";
import { ExperimentImageValidationError, validateExperimentImage } from "@/lib/experiment-runner/image-validation";
import { MAX_REFERENCE_UPLOAD_BYTES } from "@/lib/experiment-runner/image-limits";
import type { BookletBinding, BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { operationSignal, remainingOperationMs } from "@/lib/operations/budget";
import { readStreamChunk } from "@/lib/operations/read-stream";

const MAX_ACK_BYTES = 64 * 1024;

export type ReferenceUploadResult =
  | { kind: "uploaded"; id: string; byteLength: number; mimeType: "image/png" | "image/jpeg" | "image/webp"; sha256: string }
  | { kind: "rejected"; reason: "invalid_input" | "invalid_image" | "too_large" | "http_rejected" }
  | { kind: "unknown" };

async function readAcknowledgement(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new Error("Missing acknowledgement body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await readStreamChunk(reader, signal);
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ACK_BYTES) { await reader.cancel(); throw new Error("Acknowledgement exceeds limit."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

// One call is one upload attempt. A timeout or uncertain response must be
// reconciled by the caller; this adapter never repeats a POST.
export function createReferenceTransport(config: BookletRunnerConfig, fetcher: typeof fetch = fetch) {
  return {
    async upload(binding: BookletBinding, runId: string, original: Uint8Array): Promise<ReferenceUploadResult> {
      if (!opaqueIdSchema.safeParse(runId).success || ![...config.bindings, ...(config.real?.bindings ?? [])].some((item) =>
        item.appId === binding.appId && item.apiKey === binding.apiKey && item.publishedWorkflowId === binding.publishedWorkflowId)) {
        return { kind: "rejected", reason: "invalid_input" };
      }
      if (!(original instanceof Uint8Array)) return { kind: "rejected", reason: "invalid_input" };
      if (original.byteLength > MAX_REFERENCE_UPLOAD_BYTES) return { kind: "rejected", reason: "too_large" };
      const bytes = Uint8Array.from(original);
      let image: Awaited<ReturnType<typeof validateExperimentImage>>;
      try { image = await validateExperimentImage(bytes); }
      catch (error) {
        if (error instanceof ExperimentImageValidationError) return { kind: "rejected", reason: error.code === "too_large" ? "too_large" : "invalid_image" };
        return { kind: "rejected", reason: "invalid_image" };
      }
      const body = new FormData();
      body.append("user", `booklet-${runId}`);
      body.append("file", new Blob([bytes], { type: image.mimeType }), `reference.${image.extension}`);
      let response: Response;
      const parent = operationSignal();
      const signal = AbortSignal.any([AbortSignal.timeout(remainingOperationMs()), ...(parent ? [parent] : [])]);
      try {
        response = await fetcher(`${config.baseUrl}/v1/files/upload`, {
          method: "POST", redirect: "error", cache: "no-store",
          headers: { Authorization: `Bearer ${binding.apiKey}` }, body, signal,
        });
      } catch { return { kind: "unknown" }; }
      if ([400, 401, 403, 404, 413, 415, 422].includes(response.status)) return { kind: "rejected", reason: "http_rejected" };
      if (!response.ok) return { kind: "unknown" };
      try {
        const acknowledgement = await readAcknowledgement(response, signal);
        if (!acknowledgement || typeof acknowledgement !== "object") return { kind: "unknown" };
        const record = acknowledgement as Record<string, unknown>;
        const id = opaqueIdSchema.safeParse(record.id);
        if (!id.success || record.size !== image.byteLength) return { kind: "unknown" };
        return { kind: "uploaded", id: id.data, byteLength: image.byteLength, mimeType: image.mimeType, sha256: image.sha256 };
      } catch { return { kind: "unknown" }; }
    },
  };
}
