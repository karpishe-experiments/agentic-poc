import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import { getChatService, isTypedWorkflowRecovery } from "@/lib/application/chat-service";
import type { BookletUIMessage } from "@/lib/contracts/messages";
import { toErrorEnvelope } from "@/lib/http/errors";
import { runTrackedMutation } from "@/lib/application/deployment-control";

export const runtime = "nodejs";
const requestSchema = z.object({ message: z.unknown() });
type RouteProperties = { params: Promise<{ bookletId: string }> };

function writeAssistantMessage(writer: UIMessageStreamWriter<BookletUIMessage>, assistantMessage: BookletUIMessage) {
  const narrationPartId = `text-${assistantMessage.id}`;
  const card = assistantMessage.parts.find((part) => part.type === "data-card");
  const narration = assistantMessage.parts.find((part) => part.type === "text");
  if (!card || card.type !== "data-card" || !narration || narration.type !== "text") throw new Error("The conversation did not create a complete response.");
  writer.write({ type: "start", messageId: assistantMessage.id });
  writer.write({ type: "text-start", id: narrationPartId });
  writer.write({ type: "text-delta", id: narrationPartId, delta: narration.text });
  writer.write({ type: "text-end", id: narrationPartId });
  writer.write({ type: "data-card", id: card.id, data: card.data });
}

export async function POST(request: Request, { params }: RouteProperties) {
  try {
    const { bookletId } = await params;
    const { message } = requestSchema.parse(await request.json());
    const stream = createUIMessageStream<BookletUIMessage>({
      execute: async ({ writer }) => {
        const heartbeat = () => writer.write({ type: "data-workingStatus", data: { operation: "guided_step", label: "Preparing your next decision" }, transient: true });
        heartbeat();
        const timer = setInterval(heartbeat, 10_000);
        try {
          const turn = await runTrackedMutation(() => getChatService().createTurn(bookletId, message));
          writeAssistantMessage(writer, turn.assistantMessage);
        } catch (error) {
          if (isTypedWorkflowRecovery(error)) writeAssistantMessage(writer, await getChatService().createRecoveryTurn(bookletId, error));
          else throw error;
        } finally { clearInterval(timer); }
      },
      onError: (error) => {
        console.error("Kids Booklet chat turn failed", error);
        return JSON.stringify(toErrorEnvelope(error).body);
      },
    });
    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    const response = toErrorEnvelope(error);
    return Response.json(response.body, { status: response.status });
  }
}
