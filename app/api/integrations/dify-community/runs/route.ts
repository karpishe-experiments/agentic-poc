import { probeAvailable, startProbe } from "@/lib/dify-community/probe";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!probeAvailable()) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const result = await startProbe();
    return Response.json(result, { status: result.status === "succeeded" ? 200 : 202, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "probe_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
