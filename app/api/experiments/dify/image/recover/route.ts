import { z } from "zod";
import { runTrackedMutation } from "@/lib/application/deployment-control";
import { getDifyExperimentService } from "@/lib/dify-experiment/get-service";
import { assertSameOriginRequest, difyExperimentErrorResponse, readLimitedRequestBody, uniqueSearchParams } from "@/lib/dify-experiment/http";

export const runtime = "nodejs";
const querySchema = z.object({ expected_revision: z.coerce.number().int().min(1), attempt_id: z.string().uuid() }).strict();

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const query = querySchema.parse(uniqueSearchParams(request)); const bytes = await readLimitedRequestBody(request, 20 * 1024 * 1024);
    return Response.json({ data: await runTrackedMutation(() => getDifyExperimentService().completeImage({ projectId: "booklet-dify-trial", expectedRevision: query.expected_revision, attemptId: query.attempt_id, bytes })) });
  } catch (error) { return difyExperimentErrorResponse(error); }
}
