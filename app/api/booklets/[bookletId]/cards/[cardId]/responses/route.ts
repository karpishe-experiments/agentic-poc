import { z } from "zod";
import { getCardService } from "@/lib/application/card-service";
import { toErrorEnvelope } from "@/lib/http/errors";
import { streamOperation } from "@/lib/http/stream-operation";

export const runtime = "nodejs";

const bodySchema = z.object({ responseId: z.string().uuid(), action: z.string(), value: z.unknown().optional(), revisionInstruction: z.string().optional() });
type RouteProperties = { params: Promise<{ bookletId: string; cardId: string }> };

export async function POST(request: Request, { params }: RouteProperties) {
  try {
    const { bookletId, cardId } = await params;
    const body = bodySchema.parse(await request.json());
    return streamOperation(() => getCardService().submit(bookletId, { ...body, cardId }));
  } catch (error) {
    const response = toErrorEnvelope(error);
    return Response.json(response.body, { status: response.status });
  }
}
