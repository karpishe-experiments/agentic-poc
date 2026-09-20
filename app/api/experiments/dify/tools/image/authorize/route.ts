import { z } from "zod";
import { runTrackedMutation } from "@/lib/application/deployment-control";
import { getDifyExperimentService } from "@/lib/dify-experiment/get-service";
import { assertDifyToolKey, difyExperimentErrorResponse } from "@/lib/dify-experiment/http";

export const runtime = "nodejs";
const bodySchema = z.object({ project_id: z.string(), run_id: z.string().uuid(), expected_revision: z.number().int().min(1), panel_number: z.literal(1), workflow_run_id: z.string().trim().min(1).max(200) }).strict();

export async function POST(request: Request) {
  try {
    assertDifyToolKey(request.headers.get("x-booklet-tool-key")); const body = bodySchema.parse(await request.json());
    const result = await runTrackedMutation(() => getDifyExperimentService().authorizeIllustration({ projectId: body.project_id, runId: body.run_id, expectedRevision: body.expected_revision, panelNumber: body.panel_number, workflowRunId: body.workflow_run_id }));
    return Response.json({ data: { started: result.started, attempt_id: result.attemptId, revision: result.context.current_revision, status: result.context.image?.status, ...(result.prompt ? { prompt: result.prompt } : {}) } });
  } catch (error) { return difyExperimentErrorResponse(error); }
}
