import { describe, expect, it, vi } from "vitest";
import { createWorkflowRuntime, runtimeCompletion, runtimeImageCompletion, type RuntimeResult } from "@/lib/experiment-runner/transport";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";

const id = "00000000-0000-4000-8000-000000000001";
const workflow = "00000000-0000-4000-8000-000000000002";
const binding = { role: "manager" as const, taskId: null, persona: null, appId: id, publishedWorkflowId: workflow, toolProviderId: null, apiKey: "private-runtime-key" };
const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.test", publicOrigin: "https://booklet.test", callbackKey: "private-callback-key", bindings: [binding] };
const input = { runId: id, operationId: workflow, parentWorkflowRunId: null, mode: "simulated" as const };

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } });
}

function openSseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let cancelled = false;
  return {
    response: new Response(new ReadableStream<Uint8Array>({
      start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); },
      cancel() { cancelled = true; },
    }), { headers: { "Content-Type": "text/event-stream" } }),
    wasCancelled: () => cancelled,
  };
}

describe("model-free runtime transport", () => {
  it("parses a strict image acknowledgement without treating it as a narrative result", () => {
    const result = { runId: id, operationId: workflow, workflowRunId: id, parentWorkflowRunId: null,
      inputFingerprint: "a".repeat(64), assetId: workflow, sha256: "b".repeat(64) };
    const execution = { id, workflow_id: workflow, status: "succeeded" as const, outputs: { image_result: JSON.stringify(result) } };
    expect(runtimeImageCompletion(execution)).toEqual(result);
    expect(runtimeCompletion(execution)).toBeNull();
    expect(runtimeImageCompletion({ ...execution, status: "running" })).toBeNull();
    for (const bad of [{ ...result, sha256: "bad" }, { ...result, secret: "extra" }]) {
      expect(runtimeImageCompletion({ ...execution, outputs: { image_result: JSON.stringify(bad) } })).toBeNull();
    }
  });
  it("sends one streaming POST with explicit simulation and no callback credential", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sseResponse([
      `event: workflow_started\ndata: {"workflow_run_id":"${id}","data":{"id":"${id}","workflow_id":"${workflow}"}}\n\n`,
    ]));
    const result = await createWorkflowRuntime(config, fetcher).start(binding, input);
    expect(result).toEqual({ kind: "accepted", execution: { id, workflow_id: workflow, status: "running" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://dify.test/v1/workflows/run");
    expect(JSON.parse(options!.body as string)).toEqual({
      inputs: { run_id: id, operation_id: workflow, parent_workflow_run_id: "", mode: "simulated" },
      response_mode: "streaming", user: `booklet-${id}`,
    });
    expect(options?.redirect).toBe("error");
    expect(options?.body).not.toContain(config.callbackKey);
  });
  it("serializes ordered local image descriptors in the custom reference_files input", async () => {
    const secondFile = "00000000-0000-4000-8000-000000000003";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sseResponse([
      `data: {"event":"workflow_started","workflow_run_id":"${id}","data":{"id":"${id}","workflow_id":"${workflow}"}}\n\n`,
    ]));
    await createWorkflowRuntime(config, fetcher).start(binding, { ...input, referenceFileIds: [secondFile, id] });
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.user).toBe(`booklet-${id}`);
    expect(body.inputs.reference_files).toEqual([
      { type: "image", transfer_method: "local_file", upload_file_id: secondFile },
      { type: "image", transfer_method: "local_file", upload_file_id: id },
    ]);
    expect(body.files).toBeUndefined();
  });
  it("rejects invalid reference selections before any POST", async () => {
    const invalid: unknown[] = [
      [], [id, id], Array.from({ length: 16 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
      ["https://example.test/file.png"], ["not-a-uuid"], null, "not-an-array", [42],
    ];
    for (const referenceFileIds of invalid) {
      const fetcher = vi.fn<typeof fetch>();
      expect(await createWorkflowRuntime(config, fetcher).start(binding, { ...input, referenceFileIds } as unknown as typeof input)).toEqual({ kind: "rejected" });
      expect(fetcher).not.toHaveBeenCalled();
    }
  });
  it("accepts the ordered 15-file boundary", async () => {
    const referenceFileIds = Array.from({ length: 15 }, (_, index) =>
      `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sseResponse([
      `data: {"event":"workflow_started","workflow_run_id":"${id}","data":{"id":"${id}","workflow_id":"${workflow}"}}\n\n`,
    ]));
    expect((await createWorkflowRuntime(config, fetcher).start(binding, { ...input, referenceFileIds })).kind).toBe("accepted");
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).inputs.reference_files.map((item: { upload_file_id: string }) => item.upload_file_id))
      .toEqual(referenceFileIds);
  });
  it("does not retry lost POST or leak the thrown error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(binding.apiKey));
    expect(await createWorkflowRuntime(config, fetcher).start(binding, { ...input, referenceFileIds: [id] })).toEqual({ kind: "unknown" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("uses one GET observation without an implicit retry loop", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("bad", { status: 502 }));
    expect(await createWorkflowRuntime(config, fetcher).retrieve(binding, id)).toEqual({ kind: "unknown" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
  });
  it("rejects malformed, oversized and redirect responses without retrying POST", async () => {
    for (const response of [Response.json({ data: { id: "bad" } }), new Response("x".repeat(2_500_001)), new Response(null, { status: 302 })]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      expect(await createWorkflowRuntime(config, fetcher).start(binding, input)).toEqual({ kind: "unknown" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("parses only a strict saved result envelope, not arbitrary output", () => {
    const envelope = { runId: id, operationId: workflow, workflowRunId: id, parentWorkflowRunId: null, inputFingerprint: "a".repeat(64), result: { kind: "delegate", payload: { taskId: "J01", subjectKind: "book", subjectId: id } } };
    expect(runtimeCompletion({ id, workflow_id: workflow, status: "succeeded", outputs: { booklet_result: JSON.stringify(envelope) } })).toEqual(envelope);
    expect(runtimeCompletion({ id, workflow_id: workflow, status: "succeeded", outputs: { booklet_result: JSON.stringify({ ...envelope, secret: "not accepted" }) } })).toBeNull();
  });

  it("parses partial CRLF SSE events, ignores comments, and keeps reading through a terminal event", async () => {
    let resolveTerminal: (result: RuntimeResult) => void = () => undefined;
    const terminal = new Promise<RuntimeResult>((resolve) => { resolveTerminal = resolve; });
    const started = vi.fn(async () => undefined);
    const startedData = `{"workflow_run_id":"${id}","data":{"id":"${id}","workflow_id":"${workflow}"}}`;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sseResponse([
      ": keep-alive\r\n\r\n",
      "event: workflow_sta",
      `rted\r\ndata: ${startedData.slice(0, 41)}`,
      `${startedData.slice(41)}\r\n\r\n`,
      "event: workflow_finished\r\n",
      `data: {\"data\":{\"id\":\"${id}\",\"workflow_id\":\"${workflow}\",\"status\":\"succeeded\",\"outputs\":{}}}\r\n\r\n`,
    ]));
    const result = await createWorkflowRuntime(config, fetcher).start(binding, input, {
      deadlineAtMs: Date.now() + 10_000,
      onStarted: started,
      onTerminal: async (outcome) => resolveTerminal(outcome),
    });
    expect(result).toEqual({ kind: "accepted", execution: { id, workflow_id: workflow, status: "running" } });
    expect(started).toHaveBeenCalledWith({ id, workflow_id: workflow, status: "running" });
    expect(await terminal).toEqual({ kind: "execution", execution: { id, workflow_id: workflow, status: "succeeded", outputs: {} } });
  });

  it("reports an early started event from a different publication as a conflict", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sseResponse([
      `data: {"event":"workflow_started","workflow_run_id":"${id}","data":{"id":"${id}","workflow_id":"00000000-0000-4000-8000-000000000099"}}\n\n`,
    ]));
    const onStarted = vi.fn();
    let resolveTerminal: (result: RuntimeResult) => void = () => undefined;
    const terminal = new Promise<RuntimeResult>((resolve) => { resolveTerminal = resolve; });
    expect(await createWorkflowRuntime(config, fetcher).start(binding, input, { onStarted, onTerminal: async (outcome) => resolveTerminal(outcome) })).toEqual({ kind: "conflict" });
    expect(onStarted).not.toHaveBeenCalled();
    expect(await terminal).toEqual({ kind: "conflict" });
  });

  it("treats malformed SSE acknowledgement data as an unknown outcome", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sseResponse(["event: workflow_started\ndata: not-json\n\n"]));
    expect(await createWorkflowRuntime(config, fetcher).start(binding, input)).toEqual({ kind: "unknown" });
  });

  it("reports an identity conflict in a later event without replacing the accepted outcome", async () => {
    let resolveTerminal: (result: RuntimeResult) => void = () => undefined;
    const terminal = new Promise<RuntimeResult>((resolve) => { resolveTerminal = resolve; });
    const otherId = "00000000-0000-4000-8000-000000000004";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sseResponse([
      `data: {"event":"workflow_started","workflow_run_id":"${id}","data":{"id":"${id}","workflow_id":"${workflow}"}}\n\n`,
      `data: {"event":"workflow_started","workflow_run_id":"${otherId}","data":{"id":"${otherId}","workflow_id":"${workflow}"}}\n\n`,
    ]));
    expect((await createWorkflowRuntime(config, fetcher).start(binding, input, { onTerminal: async (outcome) => resolveTerminal(outcome) })).kind).toBe("accepted");
    expect(await terminal).toEqual({ kind: "conflict" });
  });

  it("reports a terminal workflow run that differs from the started identity as a conflict", async () => {
    let resolveTerminal: (result: RuntimeResult) => void = () => undefined;
    const terminal = new Promise<RuntimeResult>((resolve) => { resolveTerminal = resolve; });
    const otherId = "00000000-0000-4000-8000-000000000004";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sseResponse([
      `data: {"event":"workflow_started","workflow_run_id":"${id}","data":{"id":"${id}","workflow_id":"${workflow}"}}\n\n`,
      `data: {"event":"workflow_finished","data":{"id":"${otherId}","workflow_id":"${workflow}","status":"succeeded","outputs":{}}}\n\n`,
    ]));
    expect((await createWorkflowRuntime(config, fetcher).start(binding, input, { onTerminal: async (outcome) => resolveTerminal(outcome) })).kind).toBe("accepted");
    expect(await terminal).toEqual({ kind: "conflict" });
  });

  it("does not return accepted when durable identity persistence rejects the start", async () => {
    let resolveTerminal: (result: RuntimeResult) => void = () => undefined;
    const terminal = new Promise<RuntimeResult>((resolve) => { resolveTerminal = resolve; });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sseResponse([
      `data: {"event":"workflow_started","workflow_run_id":"${id}","data":{"id":"${id}","workflow_id":"${workflow}"}}\n\n`,
      `data: {"event":"workflow_finished","data":{"id":"${id}","workflow_id":"${workflow}","status":"failed","outputs":{}}}\n\n`,
    ]));
    expect(await createWorkflowRuntime(config, fetcher).start(binding, input, {
      onStarted: async () => { throw new Error("identity persistence unavailable"); },
      onTerminal: async (outcome) => resolveTerminal(outcome),
    })).toEqual({ kind: "unknown" });
    expect(await terminal).toEqual({ kind: "execution", execution: { id, workflow_id: workflow, status: "failed", outputs: {} } });
  });

  it("bounds an open reader at the supplied deadline without sending another POST", async () => {
    const source = openSseResponse([
      `data: {"event":"workflow_started","workflow_run_id":"${id}","data":{"id":"${id}","workflow_id":"${workflow}"}}\n\n`,
    ]);
    let resolveTerminal: (result: RuntimeResult) => void = () => undefined;
    const terminal = new Promise<RuntimeResult>((resolve) => { resolveTerminal = resolve; });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(source.response);
    expect((await createWorkflowRuntime(config, fetcher).start(binding, input, {
      deadlineAtMs: Date.now() + 50,
      onTerminal: async (outcome) => resolveTerminal(outcome),
    })).kind).toBe("accepted");
    expect(await terminal).toEqual({ kind: "unknown" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(source.wasCancelled()).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
