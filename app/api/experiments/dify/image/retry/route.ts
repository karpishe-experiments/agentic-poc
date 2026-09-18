import { z } from "zod";
import { runTrackedMutation } from "@/lib/application/deployment-control";
import { getDifyExperimentService } from "@/lib/dify-experiment/get-service";
import { assertSameOriginJsonRequest, difyExperimentErrorResponse } from "@/lib/dify-experiment/http";

export const runtime = "nodejs";
const bodySchema = z.object({ expected_revision: z.number().int().min(1) }).strict();

export async function POST(request: Request) {
  try { assertSameOriginJsonRequest(request); const body = bodySchema.parse(await request.json()); return Response.json({ data: await runTrackedMutation(() => getDifyExperimentService().retryImage({ expectedRevision: body.expected_revision })) }); }
  catch (error) { return difyExperimentErrorResponse(error); }
}
