import { runTrackedMutation } from "@/lib/application/deployment-control";
import { getDifyExperimentService } from "@/lib/dify-experiment/get-service";
import { assertSameOriginJsonRequest, difyExperimentErrorResponse } from "@/lib/dify-experiment/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try { assertSameOriginJsonRequest(request); return Response.json({ data: await runTrackedMutation(() => getDifyExperimentService().initialize()) }, { status: 201 }); }
  catch (error) { return difyExperimentErrorResponse(error); }
}
