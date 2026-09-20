import { z } from "zod";
import { runTrackedMutation } from "@/lib/application/deployment-control";
import { getDifyExperimentService } from "@/lib/dify-experiment/get-service";
import { assertDifyToolKey, difyExperimentErrorResponse, difyToolContext, readLimitedRequestBody, uniqueSearchParams } from "@/lib/dify-experiment/http";

export const runtime = "nodejs";
const querySchema = z.object({ project_id: z.string(), expected_revision: z.coerce.number().int().min(1), attempt_id: z.string().uuid() }).strict();

export async function POST(request: Request) {
  try {
    assertDifyToolKey(request.headers.get("x-booklet-tool-key"));
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "image/png") return Response.json({ error: { code: "invalid_image", message: "A PNG request body is required." } }, { status: 422 });
    const query = querySchema.parse(uniqueSearchParams(request)); const bytes = await readLimitedRequestBody(request, 20 * 1024 * 1024);
    const context = await runTrackedMutation(() => getDifyExperimentService().completeImage({ projectId: query.project_id, expectedRevision: query.expected_revision, attemptId: query.attempt_id, bytes }));
    return Response.json({ data: difyToolContext(context) });
  } catch (error) { return difyExperimentErrorResponse(error); }
}
