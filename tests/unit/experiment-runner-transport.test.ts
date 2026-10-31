import { describe, expect, it, vi } from "vitest";
import { cancelOwnedControllers } from "@/lib/operations/controllers";
import { createWorkflowRuntime, runtimeCompletion, runtimeImageCompletion, type RuntimeResult } from "@/lib/experiment-runner/transport";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";

const id = "00000000-0000-4000-8000-000000000001";
const workflow = "00000000-0000-4000-8000-000000000002";
const task = "00000000-0000-4000-8000-000000000003";
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

function openJsonResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let cancelled = false;
  return {
    response: new Response(new ReadableStream<Uint8Array>({
      start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); },
      cancel() { cancelled = true; },
    }), { headers: { "Content-Type": "application/json" } }),
    wasCancelled: () => cancelled,
  };
}

describe("model-free runtime transport", () => {
  it("exposes only the exact zero-token eight-step report guard diagnostic", async () => {
    const original = { id, workflow_id: workflow, status: "failed", outputs: {},
      error: "Booklet Real report model parameters differ.", total_tokens: 0, total_steps: 8 };
    for (const change of [{}, { total_tokens: 1 }, { total_tokens: "0" }, { total_steps: 9 },
      { total_steps: "8" }, { status: "running" }, { error: "arbitrary private error" }]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...original, ...change,
        reportParameterFailure: { code: "real_report_parameter_guard", totalTokens: 0, totalSteps: 8 } })));
      const result = await createWorkflowRuntime(config, fetcher).retrieve(binding, id);
      expect(result.kind).toBe("execution"); if (result.kind !== "execution") throw Error("Expected GET");
      expect(result.execution.reportParameterFailure).toEqual(Object.keys(change).length === 0
        ? { code: "real_report_parameter_guard", totalTokens: 0, totalSteps: 8 } : undefined);
      expect(result.execution).not.toHaveProperty("error");
      expect(result.execution).not.toHaveProperty("total_tokens");
      expect(result.execution).not.toHaveProperty("total_steps");
    }
  });
  it("extracts only the exact legacy count guard and zero-token diagnostic from authenticated GET", async () => {
    const exact = "Booklet complete input exceeds its verified token limit.";
    for (const [error, total_tokens, status, admitted] of [[exact, 0, "failed", true], [exact, 1, "failed", false],
      [exact, null, "failed", false], [exact, "0", "failed", false], ["private arbitrary body", 0, "failed", false], [exact, 0, "succeeded", false]] as const) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id, workflow_id: workflow, status,
        outputs: null, error, total_tokens, legacyCountFailure: { code: "legacy_input_count_guard", totalTokens: 0 } }),
      { headers: { "Content-Type": "application/json" } }));
      const result = await createWorkflowRuntime(config, fetcher).retrieve(binding, id);
      expect(result.kind).toBe("execution");
      if (result.kind !== "execution") throw new Error("Expected GET execution");
      expect(result.execution.legacyCountFailure).toEqual(admitted ? { code: "legacy_input_count_guard", totalTokens: 0 } : undefined);
      expect(result.execution).not.toHaveProperty("error"); expect(result.execution).not.toHaveProperty("total_tokens");
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("propagates paid modes without changing the Simulated wire shape", async () => {
    const bodies: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
      bodies.push(options!.body as string);
      return new Response(null, { status: 422 });
    });
    const runtime = createWorkflowRuntime(config, fetcher);
    await runtime.start(binding, input);
    await runtime.start(binding, { ...input, mode: "balanced" });
    expect(bodies[0]).toBe(JSON.stringify({ inputs: { run_id: id, operation_id: workflow, parent_workflow_run_id: "", mode: "simulated" }, response_mode: "streaming", user: `booklet-${id}` }));
    expect(bodies[1]).toBe(bodies[0].replace('"mode":"simulated"', '"mode":"balanced"'));
    expect(await runtime.start(binding, { ...input, mode: "real" } as unknown as typeof input)).toEqual({ kind: "rejected" });
    expect(bodies[2]).toBe(bodies[0].replace('"mode":"simulated"', '"mode":"real"'));
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
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
  it("captures the Dify task identity and rejects a conflicting terminal task", async () => {
    let resolveTerminal: (result: RuntimeResult) => void = () => undefined;
    const terminal = new Promise<RuntimeResult>((resolve) => { resolveTerminal = resolve; });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sseResponse([
      `data: {"event":"workflow_started","workflow_run_id":"${id}","task_id":"${task}","data":{"id":"${id}","workflow_id":"${workflow}","task_id":"${task}"}}\n\n`,
      `data: {"event":"workflow_finished","data":{"id":"${id}","workflow_id":"${workflow}","task_id":"00000000-0000-4000-8000-000000000004","status":"succeeded","outputs":{}}}\n\n`,
    ]));
    const runtime = createWorkflowRuntime(config, fetcher);
    expect(await runtime.start(binding, input, { onTerminal: async (outcome) => resolveTerminal(outcome) })).toEqual({
      kind: "accepted", execution: { id, workflow_id: workflow, task_id: task, status: "running" },
    });
    expect(await terminal).toEqual({ kind: "conflict" });
  });
  it("sends one Dify task-stop POST without treating the acknowledgement as terminal", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const runtime = createWorkflowRuntime(config, fetcher);
    expect(await runtime.stop?.(binding, { runId: id, taskId: task })).toEqual({ kind: "acknowledged" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(`https://dify.test/v1/workflows/tasks/${task}/stop`);
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options?.body as string)).toEqual({ user: `booklet-${id}` });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
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
  it("cancels a hanging result body through the caller signal without another request", async () => {
    const source = openJsonResponse([JSON.stringify({ id, workflow_id: workflow, status: "succeeded", outputs: {} })]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(source.response);
    const controller = new AbortController();
    const pending = createWorkflowRuntime(config, fetcher).retrieve(binding, id, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    expect(await pending).toEqual({ kind: "unknown" });
    expect(source.wasCancelled()).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
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
  it("cancels the retained reader after the start call returned accepted", async () => {
    const source = openSseResponse([
      `data: {"event":"workflow_started","workflow_run_id":"${id}","data":{"id":"${id}","workflow_id":"${workflow}"}}\n\n`,
    ]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(source.response);
    let finish!: (result: RuntimeResult) => void;
    const terminal = new Promise<RuntimeResult>((resolve) => { finish = resolve; });
    expect((await createWorkflowRuntime(config, fetcher).start(binding, input, {
      onTerminal: async (result) => finish(result),
    })).kind).toBe("accepted");
    cancelOwnedControllers(input.runId);
    expect(await terminal).toEqual({ kind: "unknown" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(source.wasCancelled()).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
