import { z } from "zod";
import { registerOwnedController } from "@/lib/operations/controllers";
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
  task_id: opaqueIdSchema.optional(),
  status: z.enum(["running", "succeeded", "failed", "stopped"]),
  outputs: z.record(z.string(), z.unknown()).nullable().optional(),
  error: z.unknown().optional(), total_tokens: z.unknown().optional(),
}).strip().transform(({ error, total_tokens, ...execution }) => ({ ...execution,
  ...(execution.status === "failed" && error === "Booklet complete input exceeds its verified token limit." && total_tokens === 0
    ? { legacyCountFailure: { code: "legacy_input_count_guard" as const, totalTokens: 0 as const } } : {}),
}));
export type RuntimeExecution = z.infer<typeof execution>;
export type RuntimeResult = { kind: "accepted"; execution: RuntimeExecution } | { kind: "execution"; execution: RuntimeExecution } | { kind: "conflict" } | { kind: "unknown" } | { kind: "rejected" };
export type RuntimeInput = {
  runId: string;
  operationId: string;
  parentWorkflowRunId: string | null;
  mode: "simulated" | "balanced";
  referenceFileIds?: string[];
};
export type WorkflowStartOptions = {
  // Persist the provider run identity before the caller treats a POST as
  // accepted. This callback is intentionally awaited.
  onStarted?: (execution: RuntimeExecution) => Promise<void> | void;
  // The transport owns the stream reader after `start` returns. It reports a
  // terminal event, or a lost stream, without replaying the provider request.
  onTerminal?: (result: RuntimeResult) => Promise<void> | void;
  // The caller can pass the original operation deadline. It bounds the
  // detached reader; the first acknowledgement is always limited to 30s.
  deadlineAtMs?: number;
  signal?: AbortSignal;
};
export type WorkflowRequestOptions = Pick<WorkflowStartOptions, "deadlineAtMs" | "signal">;
export type WorkflowStopResult = { kind: "acknowledged" | "unknown" | "rejected" };
export type WorkflowStopInput = { runId: string; taskId: string };
export type WorkflowRuntime = {
  start(binding: BookletBinding, input: RuntimeInput, options?: WorkflowStartOptions): Promise<RuntimeResult>;
  retrieve(binding: BookletBinding, workflowRunId: string, options?: WorkflowRequestOptions): Promise<RuntimeResult>;
  // Optional while existing fixtures and unsupported providers do not expose
  // Dify task cancellation. Callers must treat its absence as unsupported.
  stop?: (binding: BookletBinding, input: WorkflowStopInput, options?: WorkflowRequestOptions) => Promise<WorkflowStopResult>;
};

const runtimeInputSchema = z.object({
  runId: opaqueIdSchema,
  operationId: opaqueIdSchema,
  parentWorkflowRunId: opaqueIdSchema.nullable(),
  mode: z.enum(["simulated", "balanced"]),
  referenceFileIds: z.array(opaqueIdSchema).min(1).max(15)
    .refine((ids) => new Set(ids).size === ids.length, "Reference file IDs must be unique")
    .optional(),
}).strict();

function runtimeBody(input: z.infer<typeof runtimeInputSchema>): string {
  // Keep the established four-input body byte-for-byte shape when no selected
  // files are supplied. Dify custom workflow inputs use descriptors, not
  // top-level `files`; the caller owns upload and reference identity checks.
  const inputs = input.referenceFileIds === undefined
    ? { run_id: input.runId, operation_id: input.operationId, parent_workflow_run_id: input.parentWorkflowRunId ?? "", mode: input.mode }
    : {
      run_id: input.runId,
      operation_id: input.operationId,
      parent_workflow_run_id: input.parentWorkflowRunId ?? "",
      mode: input.mode,
      reference_files: input.referenceFileIds.map((upload_file_id) => ({ type: "image", transfer_method: "local_file", upload_file_id })),
    };
  return JSON.stringify({ inputs, response_mode: "streaming", user: `booklet-${input.runId}` });
}

// Do not return provider bodies, URLs or credentials to logs or browser clients.
async function readResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new Error("Missing runtime response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await readUntilAbort(reader, signal);
      if (done) {
        if (signal.aborted) throw new Error("Runtime response aborted");
        break;
      }
      size += value.byteLength;
      if (size > 2_500_000) { await reader.cancel(); throw new Error("Runtime response limit"); }
      chunks.push(value);
    }
  } finally {
    if (signal.aborted) {
      try { await reader.cancel(); } catch { /* The response was already closed. */ }
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

const START_ACKNOWLEDGEMENT_MS = 30_000;
const DEFAULT_STREAM_DEADLINE_MS = 5 * 60_000;
const DEFAULT_REQUEST_DEADLINE_MS = 30_000;
const MAX_SSE_EVENT_CHARS = 1_000_000;

type ServerSentEvent = { event: string | null; data: string };

class BoundedSseParser {
  private buffer = "";
  private eventName: string | null = null;
  private dataLines: string[] = [];
  private dataLength = 0;

  push(chunk: string): ServerSentEvent[] {
    this.buffer += chunk;
    if (this.buffer.length > MAX_SSE_EVENT_CHARS) throw new Error("Runtime SSE line limit");
    const events: ServerSentEvent[] = [];
    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline === -1) break;
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      const event = this.acceptLine(line);
      if (event) events.push(event);
    }
    return events;
  }

  finish(): ServerSentEvent[] {
    const events: ServerSentEvent[] = [];
    if (this.buffer.length > 0) {
      const event = this.acceptLine(this.buffer.replace(/\r$/, ""));
      if (event) events.push(event);
      this.buffer = "";
    }
    const event = this.flush();
    if (event) events.push(event);
    return events;
  }

  private acceptLine(line: string): ServerSentEvent | null {
    if (line === "") return this.flush();
    if (line.startsWith(":")) return null;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const rawValue = separator === -1 ? "" : line.slice(separator + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "event") this.eventName = value;
    if (field === "data") {
      this.dataLength += value.length;
      if (this.dataLength > MAX_SSE_EVENT_CHARS) throw new Error("Runtime SSE event limit");
      this.dataLines.push(value);
    }
    return null;
  }

  private flush(): ServerSentEvent | null {
    if (this.dataLines.length === 0) {
      this.eventName = null;
      this.dataLength = 0;
      return null;
    }
    const event = { event: this.eventName, data: this.dataLines.join("\n") };
    this.eventName = null;
    this.dataLines = [];
    this.dataLength = 0;
    return event;
  }
}

function eventName(event: ServerSentEvent, payload: unknown): string | null {
  if (event.event) return event.event;
  const parsed = z.object({ event: z.string().optional() }).passthrough().safeParse(payload);
  return parsed.success ? parsed.data.event ?? null : null;
}

type StreamIdentity = { kind: "execution"; execution: RuntimeExecution } | { kind: "conflict" } | { kind: "unknown" };

function taskIdFrom(payload: { task_id?: string; data?: { task_id?: string } }): string | null | "conflict" {
  const outer = payload.task_id;
  const inner = payload.data?.task_id;
  if (outer && inner && outer !== inner) return "conflict";
  return outer ?? inner ?? null;
}

function startedIdentity(payload: unknown, publishedWorkflowId: string): StreamIdentity {
  const parsed = z.object({
    workflow_run_id: opaqueIdSchema.optional(),
    workflow_id: opaqueIdSchema.optional(),
    task_id: opaqueIdSchema.optional(),
    data: z.object({ id: opaqueIdSchema.optional(), workflow_id: opaqueIdSchema.optional(), task_id: opaqueIdSchema.optional() }).passthrough().optional(),
  }).passthrough().safeParse(payload);
  if (!parsed.success) return { kind: "unknown" };
  const id = parsed.data.workflow_run_id ?? parsed.data.data?.id;
  const workflowId = parsed.data.data?.workflow_id ?? parsed.data.workflow_id;
  const taskId = taskIdFrom(parsed.data);
  if (!id || !workflowId || taskId === "conflict") return taskId === "conflict" ? { kind: "conflict" } : { kind: "unknown" };
  if (workflowId !== publishedWorkflowId ||
      parsed.data.workflow_run_id && parsed.data.data?.id && parsed.data.workflow_run_id !== parsed.data.data.id ||
      parsed.data.workflow_id && parsed.data.data?.workflow_id && parsed.data.workflow_id !== parsed.data.data.workflow_id) return { kind: "conflict" };
  return { kind: "execution", execution: { id, workflow_id: workflowId, status: "running", ...(taskId ? { task_id: taskId } : {}) } };
}

function terminalIdentity(payload: unknown, publishedWorkflowId: string, started: RuntimeExecution | null): StreamIdentity {
  const outer = z.object({ data: z.unknown().optional() }).passthrough().safeParse(payload);
  const candidate = outer.success && outer.data.data !== undefined ? outer.data.data : payload;
  const parsed = execution.safeParse(candidate);
  if (!parsed.success || parsed.data.status === "running") return { kind: "unknown" };
  if (parsed.data.workflow_id !== publishedWorkflowId || !started || parsed.data.id !== started.id) return { kind: "conflict" };
  if (started.task_id && parsed.data.task_id && started.task_id !== parsed.data.task_id) return { kind: "conflict" };
  return { kind: "execution", execution: {
    ...parsed.data,
    ...(parsed.data.task_id === undefined && started.task_id ? { task_id: started.task_id } : {}),
  } };
}

type AbortScope = { signal: AbortSignal; timeoutMs: number; abort: () => void; dispose: () => void };

function requestAbortScope(options: WorkflowRequestOptions, defaultTimeoutMs: number): AbortScope {
  const requestedRemaining = options.deadlineAtMs === undefined ? defaultTimeoutMs : options.deadlineAtMs - Date.now();
  const timeoutMs = Number.isFinite(requestedRemaining) ? Math.max(0, requestedRemaining) : defaultTimeoutMs;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    timeoutMs,
    abort: () => controller.abort(),
    dispose: () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

async function notify(options: WorkflowStartOptions, result: RuntimeResult): Promise<void> {
  try { await options.onTerminal?.(result); } catch { /* A notification must not restart or leak the stream. */ }
}

async function readUntilAbort(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) return { done: true, value: undefined };
  let removeAbortListener: (() => void) | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => {
        const onAbort = () => resolve({ done: true, value: undefined });
        signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener("abort", onAbort);
        if (signal.aborted) onAbort();
      }),
    ]);
  } finally { removeAbortListener?.(); }
}

async function readWorkflowStream(
  response: Response,
  binding: BookletBinding,
  options: WorkflowStartOptions,
  signal: AbortSignal,
  acknowledge: (result: RuntimeResult) => void,
): Promise<void> {
  if (!response.body) {
    acknowledge({ kind: "unknown" });
    await notify(options, { kind: "unknown" });
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parser = new BoundedSseParser();
  let accepted = false;
  let startedSeen = false;
  let started: RuntimeExecution | null = null;
  let notified = false;
  const terminal = async (result: RuntimeResult) => {
    if (notified) return;
    notified = true;
    await notify(options, result);
  };
  const stopWith = async (result: Extract<RuntimeResult, { kind: "conflict" } | { kind: "unknown" }>): Promise<boolean> => {
    if (!accepted) acknowledge(result);
    await terminal(result);
    return true;
  };
  const process = async (event: ServerSentEvent): Promise<boolean> => {
    let payload: unknown;
    try { payload = JSON.parse(event.data) as unknown; } catch { return stopWith({ kind: "unknown" }); }
    const name = eventName(event, payload);
    if (name === "workflow_started") {
      const candidate = startedIdentity(payload, binding.publishedWorkflowId);
      if (candidate.kind !== "execution") return stopWith(candidate);
      if (startedSeen) {
        if (!started || candidate.execution.id !== started.id || candidate.execution.workflow_id !== started.workflow_id ||
          started.task_id && candidate.execution.task_id && started.task_id !== candidate.execution.task_id) return stopWith({ kind: "conflict" });
        return false;
      }
      startedSeen = true;
      started = candidate.execution;
      try {
        await options.onStarted?.(candidate.execution);
      } catch {
        acknowledge({ kind: "unknown" });
        return false;
      }
      if (signal.aborted) {
        acknowledge({ kind: "unknown" });
        return true;
      }
      accepted = true;
      acknowledge({ kind: "accepted", execution: candidate.execution });
      return false;
    }
    if (["workflow_finished", "workflow_failed", "workflow_stopped"].includes(name ?? "")) {
      const completed = terminalIdentity(payload, binding.publishedWorkflowId, started);
      if (completed.kind !== "execution") return stopWith(completed);
      await terminal(completed);
      return true;
    } else if (name === "error") {
      await terminal({ kind: "unknown" });
      return true;
    }
    return false;
  };
  try {
    let stop = false;
    for (;;) {
      const { done, value } = await readUntilAbort(reader, signal);
      if (done) break;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        if (await process(event)) { stop = true; break; }
      }
      if (stop) break;
    }
    if (!stop) {
      for (const event of parser.push(decoder.decode())) {
        if (await process(event)) { stop = true; break; }
      }
    }
    if (!stop) for (const event of parser.finish()) {
      if (await process(event)) break;
    }
  } catch { /* A stream loss is evidence to reconcile, never permission to replay. */ }
  if (!accepted) acknowledge({ kind: "unknown" });
  if (!notified) await terminal({ kind: "unknown" });
  try { await reader.cancel(); } catch { /* The stream is already closed or aborted. */ }
}

export function createWorkflowRuntime(config: BookletRunnerConfig, fetcher: typeof fetch = fetch): WorkflowRuntime {
  async function retrieveRequest(binding: BookletBinding, path: string, options: WorkflowRequestOptions): Promise<RuntimeResult> {
    const scope = requestAbortScope(options, DEFAULT_REQUEST_DEADLINE_MS);
    if (scope.timeoutMs === 0 || scope.signal.aborted) {
      scope.dispose();
      return { kind: "unknown" };
    }
    try {
      const response = await fetcher(`${config.baseUrl}/v1${path}`, {
        method: "GET", redirect: "error", cache: "no-store",
        headers: { Authorization: `Bearer ${binding.apiKey}` },
        signal: scope.signal,
      });
      if (!response.ok) {
        return { kind: "unknown" };
      }
      const raw = await readResponse(response, scope.signal);
      const parsed = execution.safeParse(raw);
      return parsed.success ? { kind: "execution", execution: parsed.data } : { kind: "unknown" };
    } catch { return { kind: "unknown" }; } finally { scope.dispose(); }
  }

  async function startRequest(binding: BookletBinding, input: z.infer<typeof runtimeInputSchema>, options: WorkflowStartOptions): Promise<RuntimeResult> {
    const streamController = new AbortController();
    const release = registerOwnedController(input.runId, streamController);
    const scope = requestAbortScope({ ...options, signal: options.signal ? AbortSignal.any([options.signal, streamController.signal]) : streamController.signal }, DEFAULT_STREAM_DEADLINE_MS);
    const dispose = () => { scope.dispose(); release(); };
    if (scope.timeoutMs === 0 || scope.signal.aborted) {
      dispose();
      return { kind: "unknown" };
    }
    let readerStarted = false;
    let resolveAcknowledgement: (result: RuntimeResult) => void = () => undefined;
    let acknowledged = false;
    const acknowledgement = new Promise<RuntimeResult>((resolve) => { resolveAcknowledgement = resolve; });
    const acknowledge = (result: RuntimeResult) => {
      if (acknowledged) return;
      acknowledged = true;
      resolveAcknowledgement(result);
    };
    const acknowledgementTimer = setTimeout(() => {
      scope.abort();
      acknowledge({ kind: "unknown" });
    }, Math.min(START_ACKNOWLEDGEMENT_MS, scope.timeoutMs));
    const abortAcknowledgement = () => acknowledge({ kind: "unknown" });
    scope.signal.addEventListener("abort", abortAcknowledgement, { once: true });
    try {
      const response = await fetcher(`${config.baseUrl}/v1/workflows/run`, {
        method: "POST", redirect: "error", cache: "no-store",
        headers: { Authorization: `Bearer ${binding.apiKey}`, "Content-Type": "application/json" },
        body: runtimeBody(input), signal: scope.signal,
      });
      if (!response.ok) {
        const result: RuntimeResult = [400, 401, 403, 404, 422].includes(response.status) ? { kind: "rejected" } : { kind: "unknown" };
        acknowledge(result);
        return result;
      }
      // Keep consuming to the supplied operation deadline. Do not abort a
      // successfully acknowledged provider execution just because its ID is known.
      readerStarted = true;
      void readWorkflowStream(response, binding, options, scope.signal, acknowledge)
        .finally(dispose);
      const result = await acknowledgement;
      clearTimeout(acknowledgementTimer);
      return result;
    } catch {
      acknowledge({ kind: "unknown" });
      return { kind: "unknown" };
    } finally {
      if (acknowledged) clearTimeout(acknowledgementTimer);
      if (!readerStarted) dispose();
      scope.signal.removeEventListener("abort", abortAcknowledgement);
    }
  }

  return {
    start(binding, input, options = {}) {
      const checked = runtimeInputSchema.safeParse(input);
      // Reject malformed reference selections before any POST. A caller must
      // inspect persisted state before deciding whether an unknown POST ran.
      return checked.success ? startRequest(binding, checked.data, options) : Promise.resolve({ kind: "rejected" });
    },
    async retrieve(binding, workflowRunId, options = {}) {
      const checked = opaqueIdSchema.parse(workflowRunId);
      // The dispatcher owns recovery. A transport read is one observation, not
      // an implicit retry loop that obscures the operation's evidence.
      return retrieveRequest(binding, `/workflows/run/${checked}`, options);
    },
    async stop(binding, input, options = {}) {
      const taskId = opaqueIdSchema.safeParse(input.taskId);
      const runId = opaqueIdSchema.safeParse(input.runId);
      if (!taskId.success || !runId.success) return { kind: "rejected" };
      const scope = requestAbortScope(options, DEFAULT_REQUEST_DEADLINE_MS);
      if (scope.timeoutMs === 0 || scope.signal.aborted) {
        scope.dispose();
        return { kind: "unknown" };
      }
      try {
        const response = await fetcher(`${config.baseUrl}/v1/workflows/tasks/${taskId.data}/stop`, {
          method: "POST", redirect: "error", cache: "no-store",
          headers: { Authorization: `Bearer ${binding.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ user: `booklet-${runId.data}` }), signal: scope.signal,
        });
        void response.body?.cancel().catch(() => undefined);
        if (response.ok) return { kind: "acknowledged" };
        return [400, 401, 403, 404, 422].includes(response.status) ? { kind: "rejected" } : { kind: "unknown" };
      } catch { return { kind: "unknown" }; } finally { scope.dispose(); }
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
