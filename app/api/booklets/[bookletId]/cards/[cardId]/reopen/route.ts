import { getCardService } from "@/lib/application/card-service";
import { toErrorEnvelope } from "@/lib/http/errors";

export const runtime = "nodejs";

type RouteProperties = { params: Promise<{ bookletId: string; cardId: string }> };

export async function POST(_request: Request, { params }: RouteProperties) {
  try {
    const { bookletId, cardId } = await params;
    const card = await getCardService().reopen(bookletId, cardId);
    return Response.json({ data: { card } });
  } catch (error) {
    const response = toErrorEnvelope(error);
    return Response.json(response.body, { status: response.status });
  }
}
