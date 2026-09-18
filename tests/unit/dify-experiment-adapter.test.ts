import { describe, expect, it, vi } from "vitest";
import { DifyExperimentAdapter } from "@/lib/dify-experiment/dify-adapter";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder(); let index = 0;
  return new Response(new ReadableStream({ pull(controller) { if (index === chunks.length) controller.close(); else controller.enqueue(encoder.encode(chunks[index++]!)); } }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("Dify experiment adapter", () => {
  it("parses split SSE frames without retaining agent thoughts", async () => {
    const adapter = new DifyExperimentAdapter({ baseUrl: "https://dify.example/v1", apiKey: "test-key", fetch: async (_url, request) => {
      expect(JSON.parse(String(request?.body)).query).toContain("Run ID: run-1");
      return sseResponse([
      'data: {"event":"agent_thought","tool":"get_project_context","task_id":"task-1"}\n\n',
      'data: {"event":"agent_message","answer":"Saved ',
      'the draft.","conversation_id":"conversation-1","message_id":"message-1"}\n\n',
      'data: {"event":"message","answer":"Saved the draft.","metadata":{"usage":{"prompt_tokens":12,"completion_tokens":4}}}\n\n',
      'data: {"event":"message_end"}',
    ]);
    } });
    await expect(adapter.run("create", "run-1")).resolves.toEqual({ message: "Saved the draft.", taskId: "task-1", conversationId: "conversation-1", messageId: "message-1", toolCalls: ["get_project_context"], usage: { inputTokens: 12, outputTokens: 4 } });
  });

  it("rejects a provider error event", async () => {
    const adapter = new DifyExperimentAdapter({ baseUrl: "https://dify.example/v1", apiKey: "test-key", fetch: async () => sseResponse(['data: {"event":"error","message":"Model failed."}\n\n']) });
    await expect(adapter.run("create", "run-1")).rejects.toThrow("Model failed.");
  });

  it("rejects a stream that ends before message_end", async () => {
    const adapter = new DifyExperimentAdapter({ baseUrl: "https://dify.example/v1", apiKey: "test-key", fetch: async () => sseResponse(['data: {"event":"agent_message","answer":"Partial"}\n\n']) });
    await expect(adapter.run("create", "run-1")).rejects.toThrow("before message_end");
  });

  it("finishes at message_end even when the connection stays open", async () => {
    const encoder = new TextEncoder();
    const adapter = new DifyExperimentAdapter({ baseUrl: "https://dify.example/v1", apiKey: "test-key", fetch: async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('data: {"event":"message_end"}\n\n')); } }), { headers: { "Content-Type": "text/event-stream" } }) });
    await expect(adapter.run("resume", "run-1")).resolves.toMatchObject({ message: null });
  });

  it("bounds the best-effort stop request", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    try {
      const adapter = new DifyExperimentAdapter({ baseUrl: "https://dify.example/v1", apiKey: "test-key", fetch: async (_url, request) => {
        expect(request?.signal).toBe(controller.signal);
        return new Response(null, { status: 200 });
      } });
      await (adapter as unknown as { stop(taskId: string): Promise<void> }).stop("task-1");
      expect(timeout).toHaveBeenCalledWith(5_000);
    } finally { timeout.mockRestore(); }
  });
});
