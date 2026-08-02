import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { z } from "zod";
import { getChatService } from "@/lib/application/chat-service";
import { BookletNotFoundError } from "@/lib/application/booklet-service";
import type { BookletUIMessage } from "@/lib/contracts/messages";
import { toErrorEnvelope } from "@/lib/http/errors";

export const runtime = "nodejs";

const requestSchema = z.object({ message: z.unknown() });
type RouteProperties = { params: Promise<{ bookletId: string }> };

export async function POST(request: Request, { params }: RouteProperties) {
  try {
    const { bookletId } = await params;
    const { message } = requestSchema.parse(await request.json());
    const turn = await getChatService().createFakeTurn(bookletId, message);
    const narrationPartId = `text-${turn.assistantMessage.id}`;
    const card = turn.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!card || card.type !== "data-card") throw new Error("The fake conversation did not create a card.");
    const narration = turn.assistantMessage.parts.find((part) => part.type === "text");
    if (!narration || narration.type !== "text") throw new Error("The fake conversation did not create narration.");

    const stream = createUIMessageStream<BookletUIMessage>({
      execute: ({ writer }) => {
        writer.write({ type: "data-workingStatus", data: { operation: "fake_intake", label: "Preparing your next decision" }, transient: true });
        writer.write({ type: "start", messageId: turn.assistantMessage.id });
        writer.write({ type: "text-start", id: narrationPartId });
        writer.write({ type: "text-delta", id: narrationPartId, delta: narration.text });
        writer.write({ type: "text-end", id: narrationPartId });
        writer.write({ type: "data-card", id: card.id, data: card.data });
      },
    });
    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error("Kids Booklet chat turn failed", error);
    if (error instanceof BookletNotFoundError) {
      const response = toErrorEnvelope(error);
      return Response.json(response.body, { status: response.status });
    }
    const response = toErrorEnvelope(error);
    return Response.json(response.body, { status: response.status });
  }
}
