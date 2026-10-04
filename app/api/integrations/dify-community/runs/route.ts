import { probeAvailable, startProbe } from "@/lib/dify-community/probe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!probeAvailable()) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const fault = request.headers.get("X-Booklet-Probe-Fault");
  if (fault !== null && fault !== "discard-start-response") return Response.json({ error: "invalid_probe_fault" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const result = await startProbe({ discardStartResponse: fault === "discard-start-response" });
    return Response.json(result, { status: result.status === "succeeded" ? 200 : 202, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "probe_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
