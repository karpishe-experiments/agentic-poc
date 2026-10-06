import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { resultEnvelopeSchema } from "@/lib/contracts/experiment-runner";
import type { BookletBinding, BookletRunnerConfig } from "@/lib/experiment-runner/config";

const savedResult = resultEnvelopeSchema.extend({ parentWorkflowRunId: opaqueIdSchema.nullable() });
const savedImageResult = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema,
  workflowRunId: opaqueIdSchema, parentWorkflowRunId: opaqueIdSchema.nullable(),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/), assetId: opaqueIdSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const execution = z.object({
  id: opaqueIdSchema, workflow_id: opaqueIdSchema,
  status: z.enum(["running", "succeeded", "failed", "stopped"]),
  outputs: z.record(z.string(), z.unknown()).nullable().optional(),
}).strip();
export type RuntimeExecution = z.infer<typeof execution>;
export type RuntimeResult = { kind: "execution"; execution: RuntimeExecution } | { kind: "unknown" } | { kind: "rejected" };
export type RuntimeInput = {
  runId: string;
  operationId: string;
  parentWorkflowRunId: string | null;
  mode: "simulated";
  referenceFileIds?: string[];
};
export type WorkflowRuntime = {
  start(binding: BookletBinding, input: RuntimeInput): Promise<RuntimeResult>;
  retrieve(binding: BookletBinding, workflowRunId: string): Promise<RuntimeResult>;
};

const runtimeInputSchema = z.object({
  runId: opaqueIdSchema,
  operationId: opaqueIdSchema,
  parentWorkflowRunId: opaqueIdSchema.nullable(),
  mode: z.literal("simulated"),
  referenceFileIds: z.array(opaqueIdSchema).min(1).max(15)
    .refine((ids) => new Set(ids).size === ids.length, "Reference file IDs must be unique")
    .optional(),
}).strict();

function runtimeBody(input: z.infer<typeof runtimeInputSchema>): string {
  // Keep the established four-input body byte-for-byte shape when no selected
  // files are supplied. Dify custom workflow inputs use descriptors, not
  // top-level `files`; the caller owns upload and reference identity checks.
  const inputs = input.referenceFileIds === undefined
    ? { run_id: input.runId, operation_id: input.operationId, parent_workflow_run_id: input.parentWorkflowRunId ?? "", mode: "simulated" }
    : {
      run_id: input.runId,
      operation_id: input.operationId,
      parent_workflow_run_id: input.parentWorkflowRunId ?? "",
      mode: "simulated",
      reference_files: input.referenceFileIds.map((upload_file_id) => ({ type: "image", transfer_method: "local_file", upload_file_id })),
    };
  return JSON.stringify({ inputs, response_mode: "blocking", user: `booklet-${input.runId}` });
}

// Do not return provider bodies, URLs or credentials to logs or browser clients.
async function readResponse(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Missing runtime response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2_500_000) { await reader.cancel(); throw new Error("Runtime response limit"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

export function createWorkflowRuntime(config: BookletRunnerConfig, fetcher: typeof fetch = fetch): WorkflowRuntime {
  async function request(binding: BookletBinding, path: string, input?: RuntimeInput): Promise<RuntimeResult> {
    try {
      const response = await fetcher(`${config.baseUrl}/v1${path}`, {
        method: input ? "POST" : "GET", redirect: "error", cache: "no-store",
        headers: { Authorization: `Bearer ${binding.apiKey}`, ...(input ? { "Content-Type": "application/json" } : {}) },
        ...(input ? { body: runtimeBody(input) } : {}),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        // A rejected request is useful only before a callback claim. The caller
        // still reads persisted state before classifying the operation.
        return { kind: input && [400, 401, 403, 404, 422].includes(response.status) ? "rejected" : "unknown" };
      }
      const raw = await readResponse(response);
      const outer = input ? z.object({ data: execution }).safeParse(raw) : execution.safeParse(raw);
      if (!outer.success) return { kind: "unknown" };
      const value = "data" in outer.data ? outer.data.data : outer.data;
      return { kind: "execution", execution: value };
    } catch { return { kind: "unknown" }; }
  }
  return {
    start(binding, input) {
      const checked = runtimeInputSchema.safeParse(input);
      // Reject malformed reference selections before any POST. A caller must
      // inspect persisted state before deciding whether an unknown POST ran.
      return checked.success ? request(binding, "/workflows/run", checked.data) : Promise.resolve({ kind: "rejected" });
    },
    async retrieve(binding, workflowRunId) {
      const checked = opaqueIdSchema.parse(workflowRunId);
      // GET can be retried safely; POST never is. No provider execution occurs here.
      let result = await request(binding, `/workflows/run/${checked}`);
      for (let retry = 0; retry < 2 && result.kind === "unknown"; retry++) result = await request(binding, `/workflows/run/${checked}`);
      return result;
    },
  };
}

export function runtimeCompletion(value: RuntimeExecution) {
  if (value.status !== "succeeded" || typeof value.outputs?.booklet_result !== "string") return null;
  try { return savedResult.parse(JSON.parse(value.outputs.booklet_result) as unknown); } catch { return null; }
}

// Image bytes must already be saved by the authenticated upload callback. This
// acknowledgement is evidence to reconcile, never a substitute for that upload.
export function runtimeImageCompletion(value: RuntimeExecution) {
  if (value.status !== "succeeded" || typeof value.outputs?.image_result !== "string") return null;
  try { return savedImageResult.parse(JSON.parse(value.outputs.image_result) as unknown); } catch { return null; }
}
