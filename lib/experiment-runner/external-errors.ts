import { randomUUID } from "node:crypto";
import { getDatabase, type Database } from "@/db/client";
import { readStreamChunk } from "@/lib/operations/read-stream";

export type ExternalError = { schemaVersion: "booklet_external_error_v1"; id: string; timestamp: string;
  service: string; stage: string; elapsedMs: number | null; timeoutMs: number | null;
  method: string | null; destination: string | null; status: number | null; requestId: string | null;
  dispatchStarted: boolean | null; attemptNumber: number | null; details: unknown; redacted: boolean; truncated: boolean };
const hidden = /authorization|cookie|password|secret|api.?key|tool.?key|access.?token|refresh.?token|credential|signature|^sig$|^sign$|nonce/i;

/** Redact before persistence and again at the HTTP boundary. Error text is never HTML. */
export function redactExternalError(value: unknown, secrets: string[] = []) {
  // Use values already present in this server process only, never a credential
  // lookup. This also removes a secret repeated inside an unstructured stack.
  secrets = [...secrets, ...Object.entries(process.env).flatMap(([key, value]) =>
    /(?:KEY|PASSWORD|TOKEN|SECRET|CREDENTIAL|MONGODB_URI)/i.test(key) && value ? [value] : [])];
  let redacted = false, truncated = false;
  const seen = new WeakSet<object>();
  const text = (input: string) => {
    let output = input;
    for (const secret of secrets.filter(s => s.length >= 8)) output = output.split(secret).join("[REDACTED]");
    output = output.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_\-.]+/gi, "[REDACTED]")
      .replace(/((?:set-cookie|cookie|authorization)["']?\s*:\s*)(?:"(?:[^"\\]|\\.)*"|'[^']*'|[^\r\n}]*)/gi, "$1[REDACTED]")
      .replace(/\bsk-[A-Za-z0-9_-]+/g, "[REDACTED]")
      .replace(/((?:password|secret|api[_-]?key|token|signature|sign|nonce)["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi, "$1[REDACTED]")
      .replace(/(mongodb(?:\+srv)?:\/\/)[^/@\s]+@/gi, "$1[REDACTED]@")
      .replace(/https?:\/\/[^\s"'<>]+/g, url => {
        try { const u = new URL(url); if (u.username || u.password) { u.username = ""; u.password = ""; }
          for (const k of [...u.searchParams.keys()]) if (hidden.test(k) || /timestamp|X-Amz-/i.test(k)) u.searchParams.set(k, "[REDACTED]");
          return u.toString(); } catch { return "[INVALID URL]"; }
      });
    redacted ||= output !== input;
    if (output.length > 65_536) { truncated = true; output = output.slice(0, 65_536) + "\n[TRUNCATED]"; }
    return output;
  };
  const visit = (input: unknown, depth: number): unknown => {
    if (typeof input === "string") return text(input);
    if (input == null || typeof input === "boolean" || typeof input === "number") return input;
    if (typeof input !== "object") return String(input);
    if (depth > 6 || seen.has(input)) { truncated = true; return "[TRUNCATED OR CIRCULAR]"; }
    seen.add(input);
    if (Array.isArray(input)) { truncated ||= input.length > 30; return input.slice(0, 30).map(v => visit(v, depth + 1)); }
    const keys = input instanceof Error ? [...new Set(["name", "message", "stack", "cause", ...Object.getOwnPropertyNames(input)])] : Object.keys(input);
    truncated ||= keys.length > 50;
    return Object.fromEntries(keys.slice(0, 50).map(key => {
      if (hidden.test(key)) { redacted = true; return [key, "[REDACTED]"]; }
      let value: unknown;
      try { value = (input as Record<string, unknown>)[key]; } catch { value = "[UNREADABLE PROPERTY]"; }
      return [key, visit(value, depth + 1)];
    }));
  };
  try { return { value: visit(value, 0), redacted, get truncated() { return truncated; } }; }
  catch { return { value: "[UNREADABLE ERROR DETAILS]", redacted: true, truncated: true }; }
}

export function externalError(input: { service: string; stage: string; error: unknown; elapsedMs?: number;
  timeoutMs?: number; method?: string; destination?: string; status?: number; requestId?: string;
  dispatchStarted?: boolean; attemptNumber?: number; secrets?: string[] }): ExternalError {
  const safe = redactExternalError({ error: input.error, destination: input.destination }, input.secrets);
  const details = safe.value as { error: unknown; destination?: string };
  const serialized = JSON.stringify(details.error);
  const tooLarge = serialized != null && serialized.length > 262_144;
  return { schemaVersion: "booklet_external_error_v1", id: randomUUID(), timestamp: new Date().toISOString(),
    service: input.service, stage: input.stage, elapsedMs: input.elapsedMs ?? null, timeoutMs: input.timeoutMs ?? null,
    method: input.method ?? null, destination: details.destination ?? null, status: input.status ?? null,
    requestId: input.requestId ? String(redactExternalError(input.requestId, input.secrets).value).slice(0, 200) : null,
    dispatchStarted: input.dispatchStarted ?? null,
    attemptNumber: input.attemptNumber ?? null,
    details: tooLarge ? serialized.slice(0, 262_144) + "\n[TRUNCATED]" : details.error,
    redacted: safe.redacted, truncated: safe.truncated || tooLarge };
}

export async function retainExternalError(identity: { runId?: string; operationId?: string; workflowRunId?: string },
  diagnostic: ExternalError, database?: Database) {
  try {
    const db = database ?? getDatabase();
    if (!identity.operationId && !identity.workflowRunId && identity.runId) {
      const row = await db.collections.experiment_runs.findOne({ _id: identity.runId }, { projection: { activeOperationId: 1 }, timeoutMS: 1000 });
      if (row?.activeOperationId) identity = { ...identity, operationId: row.activeOperationId };
      else {
        await db.collections.experiment_runs.updateOne({ _id: identity.runId },
          { $push: { externalErrors: { $each: [diagnostic], $slice: -20 } } }, { timeoutMS: 1000 });
        return;
      }
    }
    if (!identity.operationId && !identity.workflowRunId) return;
    const filter = { ...(identity.runId ? { runId: identity.runId } : {}),
      ...(identity.operationId ? { _id: identity.operationId } : { workflowRunId: identity.workflowRunId }) };
    const operation = await db.collections.experiment_operations.findOne(filter, { projection: { attempt: 1 }, timeoutMS: 1000 });
    await db.collections.experiment_operations.updateOne(filter,
      { $push: { externalErrors: { $each: [{ ...diagnostic, attemptNumber: operation?.attempt ?? diagnostic.attemptNumber }], $slice: -20 } } }, { timeoutMS: 1000 });
  } catch { /* Diagnostics cannot change a provider outcome or its accounting. */ }
}

export async function externalErrorBody(response: Response, parent?: AbortSignal | null) {
  const reader = response.clone().body?.getReader();
  if (!reader) return { body: null, truncated: false };
  const signal = AbortSignal.any([AbortSignal.timeout(2000), ...(parent ? [parent] : [])]);
  let body = "", size = 0;
  try {
    for (;;) {
      const chunk = await readStreamChunk(reader, signal);
      if (chunk.done) return { body, truncated: false };
      const available = Math.max(0, 65_536 - size);
      body += new TextDecoder().decode(chunk.value.slice(0, available)); size += chunk.value.byteLength;
      if (size >= 65_536) return { body, truncated: true };
    }
  } catch (error) { return { body, truncated: true, readError: error instanceof Error ? error.name : "unknown" }; }
  finally { void reader.cancel().catch(() => undefined); }
}
