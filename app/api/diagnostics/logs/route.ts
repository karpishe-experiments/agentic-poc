import { hasValidBasicAuthorization } from "@/lib/http/basic-auth";
import { recentDiagnostics } from "@/lib/experiment-runner/diagnostics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (process.env.DEPLOYMENT_ENV !== "_staging") return new Response(null, { status: 404, headers });
  if (!hasValidBasicAuthorization(request.headers.get("authorization"))) return new Response(null, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const runId = params.get("runId") ?? undefined;
  const rawLimit = params.get("limit") ?? "200";
  if ((runId !== undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(runId)) ||
      !/^\d{1,3}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 500 ||
      [...params.keys()].some(key => key !== "runId" && key !== "limit")) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers });
  }
  return Response.json({ data: recentDiagnostics(runId, Number(rawLimit)) }, { headers });
}
