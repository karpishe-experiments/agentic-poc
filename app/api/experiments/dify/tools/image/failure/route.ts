import { z } from "zod";
import { runTrackedMutation } from "@/lib/application/deployment-control";
import { getDifyExperimentService } from "@/lib/dify-experiment/get-service";
import { assertDifyToolKey, difyExperimentErrorResponse, difyToolContext } from "@/lib/dify-experiment/http";

export const runtime = "nodejs";
const bodySchema = z.object({ project_id: z.string(), expected_revision: z.number().int().min(1), attempt_id: z.string().uuid(), category: z.enum(["generation_failed", "generation_unknown", "upload_failed"]) }).strict();

export async function POST(request: Request) {
  try {
    assertDifyToolKey(request.headers.get("x-booklet-tool-key")); const body = bodySchema.parse(await request.json());
    const context = await runTrackedMutation(() => getDifyExperimentService().reportImageFailure({ projectId: body.project_id, expectedRevision: body.expected_revision, attemptId: body.attempt_id, category: body.category }));
    return Response.json({ data: difyToolContext(context) });
  } catch (error) { return difyExperimentErrorResponse(error); }
}
