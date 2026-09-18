import { getDifyExperimentService } from "@/lib/dify-experiment/get-service";
import { difyExperimentErrorResponse } from "@/lib/dify-experiment/http";

export const runtime = "nodejs";

export async function GET() {
  try { return Response.json({ data: await getDifyExperimentService().getProjectView() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return difyExperimentErrorResponse(error); }
}
