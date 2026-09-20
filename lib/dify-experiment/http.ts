import { ZodError } from "zod";
import { DifyExperimentError } from "@/lib/dify-experiment/service";
import { MaintenanceModeError } from "@/lib/application/deployment-control";
import type { DifyExperimentContext } from "@/lib/contracts/dify-experiment";
import { DIFY_EXPERIMENT_PROJECT_ID } from "@/lib/contracts/dify-experiment";

export function difyToolContext(context: DifyExperimentContext): Omit<DifyExperimentContext, "active_run_id"> {
  const { active_run_id: activeRunId, ...visible } = context;
  void activeRunId;
  return visible;
}

export function difyExperimentErrorResponse(error: unknown): Response {
  if (error instanceof DifyExperimentError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  if (error instanceof MaintenanceModeError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  if (error instanceof ZodError) return Response.json({ error: { code: "invalid_request", message: "The request is invalid." } }, { status: 422 });
  if (error instanceof Error && /DIFY_API_KEY/.test(error.message)) return Response.json({ error: { code: "provider_not_configured", message: "The selected provider is not configured." } }, { status: 503 });
  return Response.json({ error: { code: "internal_error", message: "The experiment could not complete that operation." } }, { status: 500 });
}

export function assertDifyToolKey(value: string | null): void {
  const expected = process.env.DIFY_TOOL_KEY;
  if (!expected || value !== expected) throw new DifyExperimentError({ code: "tool_unauthorized", message: "A valid Booklet tool key is required.", status: 401 });
}

export function assertDifyToolProjectId(projectId: string): void {
  if (projectId !== DIFY_EXPERIMENT_PROJECT_ID) throw new DifyExperimentError({ code: "project_not_found", message: "The experiment project was not found.", status: 404 });
}

export function assertSameOriginJsonRequest(request: Request): void {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new DifyExperimentError({ code: "invalid_request", message: "A JSON request is required.", status: 422 });
  assertSameOriginRequest(request);
}

export function assertSameOriginRequest(request: Request): void {
  const origin = request.headers.get("origin");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  let expectedOrigin: string | null = new URL(request.url).origin;

  if (forwardedHost !== null || forwardedProto !== null) {
    expectedOrigin = null;
    if (forwardedHost && forwardedProto && !forwardedHost.includes(",") && !forwardedProto.includes(",") && /^(https?|HTTPS?)$/.test(forwardedProto)) {
      try {
        const forwardedUrl = new URL(`${forwardedProto.toLowerCase()}://${forwardedHost}`);
        if (!forwardedUrl.username && !forwardedUrl.password && forwardedUrl.pathname === "/" && !forwardedUrl.search && !forwardedUrl.hash) expectedOrigin = forwardedUrl.origin;
      } catch {
        // Reject malformed proxy metadata as an origin mismatch.
      }
    }
  }

  if (!origin || origin !== expectedOrigin) throw new DifyExperimentError({ code: "invalid_origin", message: "The request origin is not permitted.", status: 403 });
}

export async function readLimitedRequestBody(request: Request, maximumBytes: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) { await reader.cancel(); throw new DifyExperimentError({ code: "image_too_large", message: "The image exceeds the 20 MiB limit.", status: 413 }); }
    chunks.push(value);
  }
  const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export function uniqueSearchParams(request: Request): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(result, name)) throw new DifyExperimentError({ code: "invalid_request", message: "Query parameters must not be repeated.", status: 422 });
    result[name] = value;
  }
  return result;
}
