export type DifyTurnResult = {
  message: string | null;
  taskId: string | null;
  conversationId: string | null;
  messageId: string | null;
  toolCalls: string[];
  usage: { inputTokens: number; outputTokens: number } | null;
};

function safeProviderMessage(value: unknown): string {
  return value instanceof Error && value.message ? value.message.slice(0, 1_000) : "The Dify agent request failed.";
}

export class DifyExperimentAdapter {
  public constructor(private readonly input: { baseUrl: string; apiKey: string; fetch?: typeof fetch }) {}
  private get fetcher() { return this.input.fetch ?? fetch; }
  private url(path: string) { return new URL(path, this.input.baseUrl.endsWith("/") ? this.input.baseUrl : `${this.input.baseUrl}/`).toString(); }

  public async run(action: string, runId: string): Promise<DifyTurnResult> {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 300_000);
    let taskId: string | null = null; let conversationId: string | null = null; let messageId: string | null = null; let message = ""; const toolCalls = new Set<string>(); let usage: DifyTurnResult["usage"] = null;
    try {
      const response = await this.fetcher(this.url("chat-messages"), {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${this.input.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: {}, response_mode: "streaming", user: "booklet-trial-operator", auto_generate_name: false, query: `Booklet project booklet-dify-trial. Action: ${action}. Run ID: ${runId}. Pass this exact run ID to every mutating Booklet tool. Load context through the Booklet tool first.` }),
      });
      if (!response.ok || !response.body) throw new Error(`Dify returned HTTP ${response.status}.`);
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let remainder = "";
      let completed = false;
      const consumeFrame = (frame: string) => {
        const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
        if (!data || data === "[DONE]") return;
        let event: Record<string, unknown>; try { event = JSON.parse(data) as Record<string, unknown>; } catch { throw new Error("Dify sent an invalid streaming event."); }
        if (event.event === "error") throw new Error(typeof event.message === "string" ? event.message : "Dify reported a streaming error.");
        if (event.event === "message_end") completed = true;
        taskId = typeof event.task_id === "string" ? event.task_id : taskId; conversationId = typeof event.conversation_id === "string" ? event.conversation_id : conversationId; messageId = typeof event.message_id === "string" ? event.message_id : messageId;
        if (event.event === "agent_message" && typeof event.answer === "string") message += event.answer;
        if (event.event === "message" && typeof event.answer === "string") message = event.answer;
        if (event.event === "agent_thought" && typeof event.tool === "string") toolCalls.add(event.tool);
        const metadata = event.metadata; if (metadata && typeof metadata === "object" && "usage" in metadata && metadata.usage && typeof metadata.usage === "object") {
          const raw = metadata.usage as Record<string, unknown>; const inputTokens = raw.prompt_tokens; const outputTokens = raw.completion_tokens;
          if (typeof inputTokens === "number" && typeof outputTokens === "number") usage = { inputTokens, outputTokens };
        }
      };
      while (!completed) {
        const { done, value } = await reader.read(); if (done) break;
        remainder += decoder.decode(value, { stream: true }); const frames = remainder.split(/\r?\n\r?\n/); remainder = frames.pop() ?? "";
        for (const frame of frames) { consumeFrame(frame); if (completed) break; }
      }
      if (!completed && remainder.trim()) consumeFrame(remainder);
      if (!completed) throw new Error("Dify's response ended before message_end.");
      return { message: message || null, taskId, conversationId, messageId, toolCalls: [...toolCalls], usage };
    } catch (caught) {
      if (controller.signal.aborted && taskId) await this.stop(taskId).catch(() => undefined);
      throw new Error(safeProviderMessage(caught));
    } finally { clearTimeout(timeout); }
  }

  private async stop(taskId: string): Promise<void> {
    await this.fetcher(this.url(`chat-messages/${encodeURIComponent(taskId)}/stop`), { method: "POST", signal: AbortSignal.timeout(5_000), headers: { Authorization: `Bearer ${this.input.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ user: "booklet-trial-operator" }) });
  }
}
