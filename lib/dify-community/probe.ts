import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Collection } from "mongodb";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { getServerEnv } from "@/lib/config/env";

export const PROBE_MARKER = "issue69-deterministic-v1";
const idSchema = z.string().uuid();
const callbackSchema = z.strictObject({
  correlation_id: idSchema,
  marker: z.literal(PROBE_MARKER),
  workflow_run_id: idSchema,
});

type ProbeRow = {
  _id: string;
  marker: string;
  status: "started" | "callback" | "succeeded" | "failed" | "unknown";
  workflowRunId: string | null;
  workflowId: string | null;
  errorCategory: "authentication" | "invalid_request" | "remote_failure" | null;
  callbackAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
};

function collection(): Collection<ProbeRow> {
  return getDatabase().database.collection<ProbeRow>("dify_community_probes");
}

export function probeAvailable(source: NodeJS.ProcessEnv = process.env): boolean {
  return source.DEPLOYMENT_ENV === "_staging" && source.DIFY_COMMUNITY_PROBE_ENABLED === "true";
}

export function matchesCallbackKey(received: string | null, expected: string): boolean {
  if (!received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function parseCallback(value: unknown) {
  return callbackSchema.safeParse(value);
}

function runtimeConfig() {
  const env = getServerEnv();
  if (!env.DIFY_COMMUNITY_PROBE_ENABLED || env.DEPLOYMENT_ENV !== "_staging" || !env.DIFY_COMMUNITY_BASE_URL || !env.DIFY_COMMUNITY_WORKFLOW_API_KEY || !env.DIFY_COMMUNITY_CALLBACK_KEY) {
    throw new Error("Community probe is unavailable");
  }
  return { baseUrl: env.DIFY_COMMUNITY_BASE_URL.replace(/\/$/, ""), apiKey: env.DIFY_COMMUNITY_WORKFLOW_API_KEY, callbackKey: env.DIFY_COMMUNITY_CALLBACK_KEY };
}

async function difyRequest(path: string, init: RequestInit): Promise<Response> {
  const config = runtimeConfig();
  return fetch(`${config.baseUrl}/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
}

export async function acknowledgeProbe(value: unknown, receivedKey: string | null) {
  if (!probeAvailable()) return { status: 404 as const, body: { error: "not_found" } };
  const config = runtimeConfig();
  if (!matchesCallbackKey(receivedKey, config.callbackKey)) return { status: 401 as const, body: { error: "unauthorized" } };
  const parsed = parseCallback(value);
  if (!parsed.success) return { status: 400 as const, body: { error: "invalid_callback" } };
  const input = parsed.data;
  const now = Date.now();
  const row = await collection().findOne({ _id: input.correlation_id });
  if (!row) return { status: 404 as const, body: { error: "unknown_correlation" } };
  if (row.marker !== input.marker || (row.workflowRunId && row.workflowRunId !== input.workflow_run_id)) return { status: 409 as const, body: { error: "conflicting_callback" } };
  if (!row.workflowRunId) {
    const updated = await collection().updateOne(
      { _id: input.correlation_id, workflowRunId: null },
      { $set: { workflowRunId: input.workflow_run_id, status: "callback", callbackAtMs: now, updatedAtMs: now } },
    );
    if (!updated.matchedCount) {
      const current = await collection().findOne({ _id: input.correlation_id });
      if (current?.workflowRunId !== input.workflow_run_id) return { status: 409 as const, body: { error: "conflicting_callback" } };
    }
  }
  return { status: 200 as const, body: { acknowledged: true, correlation_id: input.correlation_id, marker: input.marker, workflow_run_id: input.workflow_run_id } };
}

export async function startProbe(options: { discardStartResponse?: boolean } = {}) {
  runtimeConfig();
  const correlationId = randomUUID();
  const now = Date.now();
  await collection().insertOne({ _id: correlationId, marker: PROBE_MARKER, status: "started", workflowRunId: null, workflowId: null, errorCategory: null, callbackAtMs: null, createdAtMs: now, updatedAtMs: now });
  let responseDiscarded = false;
  try {
    const response = await difyRequest("/workflows/run", { method: "POST", body: JSON.stringify({ inputs: { correlation_id: correlationId, marker: PROBE_MARKER }, response_mode: "blocking", user: `booklet-issue69-${correlationId}` }) });
    if (!response.ok) {
      if ([400, 401, 403].includes(response.status)) {
        const callbackRow = await collection().findOne({ _id: correlationId });
        if (callbackRow?.workflowRunId) throw new Error("A run ID was already stored by the callback");
        const errorCategory = response.status === 400 ? "invalid_request" as const : "authentication" as const;
        await collection().updateOne({ _id: correlationId }, { $set: { status: "failed", errorCategory, updatedAtMs: Date.now() } });
        return { correlation_id: correlationId, status: "failed" as const, error_category: errorCategory };
      }
      throw new Error(`Dify returned HTTP ${response.status}`);
    }
    // Staging diagnostic only: retain callback state, but lose the start result
    // before parsing or saving any identity from the response. Never replay.
    if (options.discardStartResponse) {
      responseDiscarded = true;
      await response.body?.cancel();
      throw new Error("Probe start response deliberately discarded");
    }
    const payload = await response.json() as { workflow_run_id?: unknown; data?: { id?: unknown; workflow_id?: unknown; status?: unknown; outputs?: Record<string, unknown> } };
    const runId = idSchema.safeParse(payload.workflow_run_id ?? payload.data?.id);
    if (!runId.success) throw new Error("Dify did not return a workflow run ID");
    const row = await collection().findOne({ _id: correlationId });
    if (row?.workflowRunId && row.workflowRunId !== runId.data) {
      await collection().updateOne({ _id: correlationId }, { $set: { status: "failed", errorCategory: "remote_failure", updatedAtMs: Date.now() } });
      return { correlation_id: correlationId, workflow_run_id: row.workflowRunId, status: "failed" as const };
    }
    const matched = row?.workflowRunId === runId.data && payload.data?.status === "succeeded" && payload.data.outputs?.correlation_id === correlationId && payload.data.outputs?.marker === PROBE_MARKER && payload.data.outputs?.workflow_run_id === runId.data && payload.data.outputs?.acknowledged === true;
    await collection().updateOne({ _id: correlationId }, { $set: { workflowRunId: runId.data, workflowId: typeof payload.data?.workflow_id === "string" ? payload.data.workflow_id : null, status: matched ? "succeeded" : "failed", errorCategory: matched ? null : "remote_failure", updatedAtMs: Date.now() } });
    return { correlation_id: correlationId, workflow_run_id: runId.data, status: matched ? "succeeded" as const : "failed" as const };
  } catch {
    await collection().updateOne({ _id: correlationId, status: { $ne: "succeeded" } }, { $set: { status: "unknown", updatedAtMs: Date.now() } });
    return { correlation_id: correlationId, status: "unknown" as const, ...(responseDiscarded ? { response_discarded: true } : {}) };
  }
}

export async function readProbe(correlationId: string) {
  const id = idSchema.safeParse(correlationId);
  if (!id.success) return { status: 400 as const, body: { error: "invalid_correlation" } };
  const row = await collection().findOne({ _id: id.data });
  if (!row) return { status: 404 as const, body: { error: "not_found" } };
  if (!row.workflowRunId) return { status: 200 as const, body: { correlation_id: id.data, status: row.status === "failed" ? "failed" : "unknown", error_category: row.errorCategory, callback_received: Boolean(row.callbackAtMs), workflow_run_id: null } };
  if (row.status === "failed" && row.errorCategory === "remote_failure") return { status: 200 as const, body: { correlation_id: id.data, status: "failed", error_category: row.errorCategory, callback_received: Boolean(row.callbackAtMs), workflow_run_id: row.workflowRunId } };
  try {
    const response = await difyRequest(`/workflows/run/${row.workflowRunId}`, { method: "GET" });
    if (!response.ok) throw new Error(`Dify returned HTTP ${response.status}`);
    const result = await response.json() as { id?: unknown; workflow_id?: unknown; status?: unknown; outputs?: Record<string, unknown> };
    const matched = result.id === row.workflowRunId && result.status === "succeeded" && result.outputs?.correlation_id === id.data && result.outputs?.marker === PROBE_MARKER && result.outputs?.acknowledged === true && result.outputs?.workflow_run_id === row.workflowRunId && Boolean(row.callbackAtMs);
    const status = matched ? "succeeded" : result.status === "running" ? "running" : "failed";
    await collection().updateOne({ _id: id.data }, { $set: { status: status === "running" ? "callback" : status, workflowId: typeof result.workflow_id === "string" ? result.workflow_id : row.workflowId, updatedAtMs: Date.now() } });
    return { status: 200 as const, body: { correlation_id: id.data, status, callback_received: Boolean(row.callbackAtMs), workflow_run_id: row.workflowRunId, workflow_id: typeof result.workflow_id === "string" ? result.workflow_id : row.workflowId, created_at_ms: row.createdAtMs, callback_at_ms: row.callbackAtMs } };
  } catch {
    return { status: 502 as const, body: { correlation_id: id.data, status: "unknown", error_category: "remote_failure", callback_received: Boolean(row.callbackAtMs), workflow_run_id: row.workflowRunId } };
  }
}
