import { hasValidBasicAuthorization } from "@/lib/http/basic-auth";
import { recentDiagnostics } from "@/lib/experiment-runner/diagnostics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (process.env.DEPLOYMENT_ENV !== "_staging") return new Response(null, { status: 404, headers });
  if (!hasValidBasicAuthorization(request.headers.get("authorization"))) return new Response(null, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  if (params.get("probe") === "admission-read") {
    if ([...params.keys()].some(key => !["probe", "persona", "part"].includes(key)) ||
        [...params.keys()].some(key => params.getAll(key).length !== 1) ||
        !["playful_kid", "enthusiast_parent"].includes(params.get("persona") ?? "") ||
        !["proofs", "plan"].includes(params.get("part") ?? "")) {
      return Response.json({ error: "invalid_request" }, { status: 400, headers });
    }
    return admissionRead(params.get("persona") as "playful_kid" | "enthusiast_parent", params.get("part") as "proofs" | "plan");
  }
  const runId = params.get("runId") ?? undefined;
  const rawLimit = params.get("limit") ?? "200";
  if ((runId !== undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(runId)) ||
      !/^\d{1,3}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 500 ||
      [...params.keys()].some(key => key !== "runId" && key !== "limit")) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers });
  }
  return Response.json({ data: recentDiagnostics(runId, Number(rawLimit)) }, { headers });
}

async function admissionRead(persona: "playful_kid" | "enthusiast_parent", part: "proofs" | "plan") {
  const headers = { "Cache-Control": "no-store" };
  const { readM4RunnerConfig } = await import("@/lib/experiment-runner/m4-config");
  const configuration = readM4RunnerConfig();
  const authority = configuration.enabled && configuration.config.m4?.state === "granted" ? configuration.config.m4.authority : undefined;
  if (!authority) return Response.json({ error: "unavailable" }, { status: 409, headers });
  const { withOperationBudget } = await import("@/lib/operations/budget");
  const { diagnoseAdmissionRead } = await import("@/db/experiment-admission-diagnostics");
  const { getDatabase } = await import("@/db/client");
  const { safeFailure } = await import("@/lib/operations/completion-failure");
  try {
    // A slow read can outlive browser navigation observation. Finish only this
    // read within its original budget and retain its sanitized in-memory result.
    const data = await withOperationBudget(Date.now() + 30_000,
      () => diagnoseAdmissionRead(getDatabase(), authority, persona, part));
    return Response.json({ data }, { headers });
  } catch (error) {
    return Response.json({ error: "diagnostic_unavailable", failure: safeFailure(error) }, { status: 409, headers });
  }
}
