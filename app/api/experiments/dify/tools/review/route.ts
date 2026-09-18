import { z } from "zod";
import { runTrackedMutation } from "@/lib/application/deployment-control";
import { getDifyExperimentService } from "@/lib/dify-experiment/get-service";
import { assertDifyToolKey, assertDifyToolProjectId, difyExperimentErrorResponse, difyToolContext } from "@/lib/dify-experiment/http";

export const runtime = "nodejs";
const bodySchema = z.object({ project_id: z.string(), run_id: z.string().uuid(), expected_revision: z.number().int().min(1) }).strict();

export async function POST(request: Request) {
  try { assertDifyToolKey(request.headers.get("x-booklet-tool-key")); const body = bodySchema.parse(await request.json()); assertDifyToolProjectId(body.project_id); return Response.json(difyToolContext(await runTrackedMutation(() => getDifyExperimentService().requestReview({ projectId: body.project_id, runId: body.run_id, expectedRevision: body.expected_revision })))); }
  catch (error) { return difyExperimentErrorResponse(error); }
}
