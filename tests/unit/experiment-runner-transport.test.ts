import { describe, expect, it, vi } from "vitest";
import { createWorkflowRuntime, runtimeCompletion } from "@/lib/experiment-runner/transport";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";

const id = "00000000-0000-4000-8000-000000000001";
const workflow = "00000000-0000-4000-8000-000000000002";
const binding = { role: "manager" as const, taskId: null, persona: null, appId: id, publishedWorkflowId: workflow, toolProviderId: null, apiKey: "private-runtime-key" };
const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.test", publicOrigin: "https://booklet.test", callbackKey: "private-callback-key", bindings: [binding] };
const input = { runId: id, operationId: workflow, parentWorkflowRunId: null, mode: "simulated" as const };

describe("model-free runtime transport", () => {
  it("sends one blocking POST with explicit simulation and no callback credential", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: { id, workflow_id: workflow, status: "succeeded", outputs: {} } }));
    const result = await createWorkflowRuntime(config, fetcher).start(binding, input);
    expect(result.kind).toBe("execution");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://dify.test/v1/workflows/run");
    expect(JSON.parse(options!.body as string)).toMatchObject({ inputs: { mode: "simulated", run_id: id, parent_workflow_run_id: "" } });
    expect(options?.redirect).toBe("error");
    expect(options?.body).not.toContain(config.callbackKey);
  });
  it("does not retry lost POST or leak the thrown error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(binding.apiKey));
    expect(await createWorkflowRuntime(config, fetcher).start(binding, input)).toEqual({ kind: "unknown" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("uses GET only and bounds read retries", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("bad", { status: 502 }));
    expect(await createWorkflowRuntime(config, fetcher).retrieve(binding, id)).toEqual({ kind: "unknown" });
    expect(fetcher).toHaveBeenCalledTimes(3);
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
});
