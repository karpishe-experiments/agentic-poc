import { probeAvailable, readProbe } from "@/lib/dify-community/probe";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ correlationId: string }> }) {
  if (!probeAvailable()) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const { correlationId } = await context.params;
    const result = await readProbe(correlationId);
    return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "lookup_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
