import { assertDifyToolKey, difyExperimentErrorResponse } from "@/lib/dify-experiment/http";
import { getDifyExperimentService } from "@/lib/dify-experiment/get-service";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertDifyToolKey(request.headers.get("x-booklet-tool-key"));
    getDifyExperimentService().assertAvailable();
    return Response.json({ error: { code: "operation_retired", message: "Use the illustrate_panel workflow. The previous image operation cannot generate images." } }, { status: 410 });
  } catch (error) { return difyExperimentErrorResponse(error); }
}
