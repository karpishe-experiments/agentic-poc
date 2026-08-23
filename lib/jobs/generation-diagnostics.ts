import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

type DiagnosticEventName =
  | "runner_started"
  | "runner_recovered_interrupted_work"
  | "runner_job_started"
  | "runner_job_failed"
  | "runner_cycle_failed"
  | "job_item_claimed"
  | "provider_request_started"
  | "provider_request_still_waiting"
  | "provider_request_completed"
  | "provider_request_threw"
  | "job_item_failed";

type SafeErrorDetails = {
  name: string;
  message: string;
  status: number | null;
  code: string | null;
  type: string | null;
  requestId: string | null;
};

export type GenerationDiagnostic = {
  event: DiagnosticEventName;
  at: string;
  processId: number;
  bookletId?: string;
  jobId?: string;
  itemId?: string;
  itemKey?: string;
  attempt?: number;
  operation?: "generate" | "edit";
  providerRuntime?: "fake" | "real";
  model?: string;
  geometry?: string;
  referenceCount?: number;
  elapsedMs?: number;
  resultStatus?: "succeeded" | "failed";
  providerRequestId?: string | null;
  error?: SafeErrorDetails;
  recoveredItems?: number;
  recoveredExecutionBatches?: number;
};

type DiagnosticInput = Omit<GenerationDiagnostic, "at" | "processId">;

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Keep diagnostics useful after a local server restart without serialising
 * prompts, image bytes, API keys, or arbitrary provider response bodies.
 */
export function describeGenerationError(error: unknown): SafeErrorDetails {
  const source = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = error instanceof Error ? error.message : stringValue(source.message) ?? "Unknown non-Error failure";
  return {
    name: error instanceof Error ? error.name : "NonError",
    message: message.slice(0, 500),
    status: numberValue(source.status),
    code: stringValue(source.code),
    type: stringValue(source.type),
    requestId: stringValue(source.request_id) ?? stringValue(source.requestId),
  };
}

export class GenerationDiagnostics {
  public constructor(private readonly rootDirectory?: string, private readonly writeToConsole = !process.env.VITEST) {}

  public async record(input: DiagnosticInput): Promise<GenerationDiagnostic> {
    const event: GenerationDiagnostic = { ...input, at: new Date().toISOString(), processId: process.pid };
    if (this.writeToConsole) console.info("GENERATION_DIAGNOSTIC", JSON.stringify(event));

    if (!this.rootDirectory || !event.jobId) return event;

    try {
      const directory = path.join(this.rootDirectory, "diagnostics", "jobs");
      await mkdir(directory, { recursive: true });
      await appendFile(path.join(directory, `${event.jobId}.ndjson`), `${JSON.stringify(event)}\n`, "utf8");
    } catch (error) {
      // The terminal log still identifies a diagnostic-storage problem without
      // allowing observability I/O to stop paid image generation.
      if (this.writeToConsole) console.error("GENERATION_DIAGNOSTIC_WRITE_FAILED", JSON.stringify({ jobId: event.jobId, error: describeGenerationError(error) }));
    }

    return event;
  }
}
