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
  if (error instanceof Error && /DIFY_API_KEY|DIFY_IMAGE_OPENAI_API_KEY/.test(error.message)) return Response.json({ error: { code: "provider_not_configured", message: "The selected provider is not configured." } }, { status: 503 });
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
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new DifyExperimentError({ code: "invalid_origin", message: "The request origin is not permitted.", status: 403 });
}
