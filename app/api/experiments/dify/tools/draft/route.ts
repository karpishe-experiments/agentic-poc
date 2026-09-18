import { z } from "zod";
import { runTrackedMutation } from "@/lib/application/deployment-control";
import { getDifyExperimentService } from "@/lib/dify-experiment/get-service";
import { assertDifyToolKey, assertDifyToolProjectId, difyExperimentErrorResponse, difyToolContext } from "@/lib/dify-experiment/http";
import { difyExperimentStorySchema } from "@/lib/contracts/dify-experiment";

export const runtime = "nodejs";
const bodySchema = z.object({ project_id: z.string(), run_id: z.string().uuid(), expected_revision: z.number().int().min(0), story: difyExperimentStorySchema }).strict();

export async function POST(request: Request) {
  try { assertDifyToolKey(request.headers.get("x-booklet-tool-key")); const body = bodySchema.parse(await request.json()); assertDifyToolProjectId(body.project_id); return Response.json(difyToolContext(await runTrackedMutation(() => getDifyExperimentService().saveStoryDraft({ projectId: body.project_id, runId: body.run_id, expectedRevision: body.expected_revision, story: body.story })))); }
  catch (error) { return difyExperimentErrorResponse(error); }
}
