import { acknowledgeProbe, probeAvailable } from "@/lib/dify-community/probe";

export const dynamic = "force-dynamic";

async function readSmallJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw new Error("body too large");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function POST(request: Request) {
  if (!probeAvailable()) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  let value: unknown;
  try {
    if (Number(request.headers.get("content-length") ?? "0") > 4096) throw new Error("too large");
    value = await readSmallJson(request);
  } catch {
    return Response.json({ error: "invalid_callback" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await acknowledgeProbe(value, request.headers.get("x-booklet-dify-probe-key"));
    return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "callback_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
