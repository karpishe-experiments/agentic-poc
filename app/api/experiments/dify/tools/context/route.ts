import { z } from "zod";
import { getDifyExperimentService } from "@/lib/dify-experiment/get-service";
import { assertDifyToolKey, assertDifyToolProjectId, difyExperimentErrorResponse, difyToolContext } from "@/lib/dify-experiment/http";

export const runtime = "nodejs";
const bodySchema = z.object({ project_id: z.string() }).strict();

export async function POST(request: Request) {
  try { assertDifyToolKey(request.headers.get("x-booklet-tool-key")); const body = bodySchema.parse(await request.json()); assertDifyToolProjectId(body.project_id); return Response.json(difyToolContext(await getDifyExperimentService().getContext())); }
  catch (error) { return difyExperimentErrorResponse(error); }
}
