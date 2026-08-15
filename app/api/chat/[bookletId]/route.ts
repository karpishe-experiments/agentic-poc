import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { z } from "zod";
import { getChatService, isTypedWorkflowRecovery } from "@/lib/application/chat-service";
import { BookletNotFoundError } from "@/lib/application/booklet-service";
import type { BookletUIMessage } from "@/lib/contracts/messages";
import { toErrorEnvelope } from "@/lib/http/errors";

export const runtime = "nodejs";

const requestSchema = z.object({ message: z.unknown() });
type RouteProperties = { params: Promise<{ bookletId: string }> };

function streamAssistantMessage(assistantMessage: BookletUIMessage) {
  const narrationPartId = `text-${assistantMessage.id}`;
  const card = assistantMessage.parts.find((part) => part.type === "data-card");
  if (!card || card.type !== "data-card") throw new Error("The conversation did not create a card.");
  const narration = assistantMessage.parts.find((part) => part.type === "text");
  if (!narration || narration.type !== "text") throw new Error("The conversation did not create narration.");
  const stream = createUIMessageStream<BookletUIMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "data-workingStatus", data: { operation: "guided_step", label: "Preparing your next decision" }, transient: true });
      writer.write({ type: "start", messageId: assistantMessage.id });
      writer.write({ type: "text-start", id: narrationPartId });
      writer.write({ type: "text-delta", id: narrationPartId, delta: narration.text });
      writer.write({ type: "text-end", id: narrationPartId });
      writer.write({ type: "data-card", id: card.id, data: card.data });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export async function POST(request: Request, { params }: RouteProperties) {
  let bookletId: string | null = null;
  try {
    ({ bookletId } = await params);
    const { message } = requestSchema.parse(await request.json());
    const turn = await getChatService().createFakeTurn(bookletId, message);
    return streamAssistantMessage(turn.assistantMessage);
  } catch (error) {
    console.error("Kids Booklet chat turn failed", error);
    if (error instanceof BookletNotFoundError) {
      const response = toErrorEnvelope(error);
      return Response.json(response.body, { status: response.status });
    }
    // Only turn errors that safely replace the current decision into a recovery
    // card. Errors such as `active_card_required` must leave the original card
    // available instead of superseding it with a retry prompt.
    if (isTypedWorkflowRecovery(error) && bookletId) {
      const recovery = await getChatService().createRecoveryTurn(bookletId, error);
      return streamAssistantMessage(recovery);
    }
    const response = toErrorEnvelope(error);
    return Response.json(response.body, { status: response.status });
  }
}
