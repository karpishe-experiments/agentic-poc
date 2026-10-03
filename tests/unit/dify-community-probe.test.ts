import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>() }));
vi.mock("@/db/client", () => ({ getDatabase: () => ({ database: { collection: () => ({
  findOne: async (filter: { _id: string }) => state.rows.get(filter._id) ?? null,
  insertOne: async (row: Record<string, unknown>) => { state.rows.set(row._id as string, { ...row }); },
  updateOne: async (filter: { _id: string; workflowRunId?: string | null; status?: { $ne: string } }, update: { $set: Record<string, unknown> }) => {
    const row = state.rows.get(filter._id);
    if (!row || ("workflowRunId" in filter && row.workflowRunId !== filter.workflowRunId) || (filter.status?.$ne && row.status === filter.status.$ne)) return { matchedCount: 0 };
    state.rows.set(filter._id, { ...row, ...update.$set });
    return { matchedCount: 1 };
  },
}) } }) }));
vi.mock("@/lib/config/env", () => ({ getServerEnv: () => ({
  DEPLOYMENT_ENV: process.env.DEPLOYMENT_ENV,
  DIFY_COMMUNITY_PROBE_ENABLED: process.env.DIFY_COMMUNITY_PROBE_ENABLED === "true",
  DIFY_COMMUNITY_BASE_URL: "https://dify.uniwares.co.uk",
  DIFY_COMMUNITY_WORKFLOW_API_KEY: "runtime-only-key",
  DIFY_COMMUNITY_CALLBACK_KEY: "a".repeat(32),
}) }));

import { acknowledgeProbe, parseCallback, PROBE_MARKER, readProbe, startProbe } from "@/lib/dify-community/probe";
import { POST as callbackRoute } from "@/app/api/integrations/dify-community/callback/route";

const runId = "123e4567-e89b-42d3-a456-426614174000";
const originalFetch = globalThis.fetch;

beforeEach(() => {
  state.rows.clear();
  process.env.DEPLOYMENT_ENV = "_staging";
  process.env.DIFY_COMMUNITY_PROBE_ENABLED = "true";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.DEPLOYMENT_ENV;
  delete process.env.DIFY_COMMUNITY_PROBE_ENABLED;
});

describe("Dify Community staging probe", () => {
  it("rejects disabled, unauthorized, and malformed callbacks", async () => {
    process.env.DIFY_COMMUNITY_PROBE_ENABLED = "false";
    expect((await acknowledgeProbe({}, null)).status).toBe(404);
    process.env.DIFY_COMMUNITY_PROBE_ENABLED = "true";
    expect((await acknowledgeProbe({}, "wrong")).status).toBe(401);
    expect(parseCallback({ correlation_id: runId, marker: "other", workflow_run_id: runId }).success).toBe(false);
    expect((await acknowledgeProbe({}, "a".repeat(32))).status).toBe(400);
  });

  it("keeps the callback closed in production and bounds the request body", async () => {
    process.env.DEPLOYMENT_ENV = "_prod";
    expect((await callbackRoute(new Request("https://booklet.example/api/integrations/dify-community/callback", { method: "POST", body: "{}" }))).status).toBe(404);
    process.env.DEPLOYMENT_ENV = "_staging";
    expect((await callbackRoute(new Request("https://booklet.example/api/integrations/dify-community/callback", { method: "POST", body: "x".repeat(4097), headers: { "x-booklet-dify-probe-key": "a".repeat(32) } }))).status).toBe(400);
  });

  it("acknowledges once and rejects conflicting run IDs", async () => {
    state.rows.set(runId, { _id: runId, marker: PROBE_MARKER, workflowRunId: null, status: "started", callbackAtMs: null });
    const input = { correlation_id: runId, marker: PROBE_MARKER, workflow_run_id: runId };
    expect((await acknowledgeProbe(input, "a".repeat(32))).status).toBe(200);
    expect((await acknowledgeProbe(input, "a".repeat(32))).status).toBe(200);
    expect((await acknowledgeProbe({ ...input, workflow_run_id: "123e4567-e89b-42d3-a456-426614174001" }, "a".repeat(32))).status).toBe(409);
  });

  it("completes the callback round trip without a provider node", async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { inputs: { correlation_id: string; marker: string } };
      expect(init?.method).toBe("POST");
      expect(body.inputs.marker).toBe(PROBE_MARKER);
      await acknowledgeProbe({ correlation_id: body.inputs.correlation_id, marker: PROBE_MARKER, workflow_run_id: runId }, "a".repeat(32));
      return Response.json({ workflow_run_id: runId, data: { status: "succeeded", workflow_id: runId, outputs: { correlation_id: body.inputs.correlation_id, marker: PROBE_MARKER, workflow_run_id: runId, acknowledged: true } } });
    }) as typeof fetch;
    const result = await startProbe();
    expect(result.status).toBe("succeeded");
    expect(state.rows.get(result.correlation_id)?.workflowRunId).toBe(runId);
  });

  it("recovers a lost start response through the runtime run-detail API", async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { inputs: { correlation_id: string } };
        await acknowledgeProbe({ correlation_id: body.inputs.correlation_id, marker: PROBE_MARKER, workflow_run_id: runId }, "a".repeat(32));
        throw new Error("response lost after callback");
      }
      const correlationId = [...state.rows.keys()][0];
      return Response.json({ id: runId, workflow_id: runId, status: "succeeded", outputs: { correlation_id: correlationId, marker: PROBE_MARKER, workflow_run_id: runId, acknowledged: true } });
    }) as typeof fetch;
    const started = await startProbe();
    expect(started.status).toBe("unknown");
    const recovered = await readProbe(started.correlation_id);
    expect(recovered.status).toBe(200);
    expect(recovered.body).toMatchObject({ status: "succeeded", callback_received: true, workflow_run_id: runId });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("retains the callback run ID when the start response names a different run", async () => {
    const otherRunId = "123e4567-e89b-42d3-a456-426614174001";
    globalThis.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { inputs: { correlation_id: string } };
      await acknowledgeProbe({ correlation_id: body.inputs.correlation_id, marker: PROBE_MARKER, workflow_run_id: runId }, "a".repeat(32));
      return Response.json({ workflow_run_id: otherRunId, data: { status: "succeeded", outputs: { correlation_id: body.inputs.correlation_id, marker: PROBE_MARKER, workflow_run_id: otherRunId, acknowledged: true } } });
    }) as typeof fetch;
    const started = await startProbe();
    expect(started).toMatchObject({ status: "failed", workflow_run_id: runId });
    expect(state.rows.get(started.correlation_id)?.workflowRunId).toBe(runId);
    expect((await readProbe(started.correlation_id)).body).toMatchObject({ status: "failed", error_category: "remote_failure" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("reports a rejected runtime key without replaying the run", async () => {
    globalThis.fetch = vi.fn(async () => Response.json({ error: "unauthorized" }, { status: 401 })) as typeof fetch;
    const started = await startProbe();
    expect(started).toMatchObject({ status: "failed", error_category: "authentication" });
    const saved = await readProbe(started.correlation_id);
    expect(saved.body).toMatchObject({ status: "failed", error_category: "authentication", workflow_run_id: null });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
