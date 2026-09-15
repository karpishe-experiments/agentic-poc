import type { ChatTransport, UIMessageChunk } from "ai";
import type {
  ClarificationCard,
  ManagementUIMessage,
  WorkingStatusCard,
} from "./types";

export type SimulatedTransportResponse = {
  text: string;
  clarification?: ClarificationCard;
  proposalId?: string;
  errorDetails?: unknown;
};

export type LocalChatTransportOptions = {
  respond(message: ManagementUIMessage): SimulatedTransportResponse;
  delayMs?: number;
};

const stages: WorkingStatusCard["label"][] = [
  "Reading selected section",
  "Preparing response",
  "Creating proposal",
];

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new DOMException("The simulated response was stopped.", "AbortError"));
      },
      { once: true },
    );
  });

/**
 * A local AI SDK transport for the mockup. It never invokes fetch, a model, or
 * a route handler; callers provide deterministic response content.
 */
export class ManagementLocalChatTransport
  implements ChatTransport<ManagementUIMessage>
{
  private readonly delayMs: number;

  constructor(private readonly options: LocalChatTransportOptions) {
    this.delayMs = options.delayMs ?? 80;
  }

  async sendMessages({
    messages,
    abortSignal,
    body,
  }: Parameters<ChatTransport<ManagementUIMessage>["sendMessages"]>[0]) {
    const message = messages.at(-1);
    if (!message) throw new Error("A simulated response requires a message.");
    const supplied = (body as { simulatedResponse?: SimulatedTransportResponse } | undefined)
      ?.simulatedResponse;
    const response = supplied ?? this.options.respond(message);
    const textId = `simulated-text-${message.id}`;
    const responseId = `simulated-response-${message.id}`;
    const delayMs = this.delayMs;
    return new ReadableStream<UIMessageChunk>({
      async start(controller) {
        const send = (chunk: UIMessageChunk) => controller.enqueue(chunk);
        try {
          send({ type: "start", messageId: responseId });
          for (const label of stages) {
            if (abortSignal?.aborted) throw new DOMException("Stopped", "AbortError");
            send({ type: "data-working-status", data: { label } });
            await wait(delayMs, abortSignal);
          }
          send({ type: "text-start", id: textId });
          for (const part of response.text.split(/(?<=\s)/)) {
            send({ type: "text-delta", id: textId, delta: part });
            await wait(delayMs, abortSignal);
          }
          send({ type: "text-end", id: textId });
          if (response.clarification)
            send({ type: "data-clarification", data: response.clarification });
          if (response.proposalId)
            send({ type: "data-proposal", data: { proposalId: response.proposalId } });
          if (response.errorDetails)
            send({ type: "data-error-details", data: response.errorDetails });
          send({ type: "finish", finishReason: "stop" });
          controller.close();
        } catch (error) {
          if (abortSignal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
            controller.enqueue({ type: "abort", reason: "The simulated response was stopped." });
            controller.close();
            return;
          }
          controller.error(error);
        }
      },
    });
  }

  async reconnectToStream() {
    return null;
  }
}
