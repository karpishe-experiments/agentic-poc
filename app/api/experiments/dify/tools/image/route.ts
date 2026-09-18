import { after } from "next/server";
import { z } from "zod";
import { runTrackedMutation } from "@/lib/application/deployment-control";
import { getDifyExperimentService, getOpenAIExperimentImageAdapter } from "@/lib/dify-experiment/get-service";
import { assertDifyToolKey, assertDifyToolProjectId, difyExperimentErrorResponse, difyToolContext } from "@/lib/dify-experiment/http";

export const runtime = "nodejs";
const bodySchema = z.object({ project_id: z.string(), run_id: z.string().uuid(), expected_revision: z.number().int().min(1), panel_number: z.literal(1) }).strict();

export async function POST(request: Request) {
  try {
    assertDifyToolKey(request.headers.get("x-booklet-tool-key")); const body = bodySchema.parse(await request.json()); assertDifyToolProjectId(body.project_id); const service = getDifyExperimentService();
    const { context, started } = await runTrackedMutation(() => service.claimPanelImage({ projectId: body.project_id, runId: body.run_id, expectedRevision: body.expected_revision, panelNumber: body.panel_number }));
    if (started) after(() => runTrackedMutation(async () => {
      if (service.isFakeMode()) return service.completeCurrentFakeImage();
      const image = await service.currentGeneratingImage(); if (!image) return;
      try { await service.completeImage(image.id, await getOpenAIExperimentImageAdapter().generate(image.prompt)); }
      catch (caught) { await service.failImage(image.id, caught instanceof DOMException && caught.name === "AbortError" ? "unknown" : "failed", caught instanceof Error ? caught.message : "The image request failed."); }
    }).catch(() => undefined));
    return Response.json(difyToolContext(context));
  } catch (error) { return difyExperimentErrorResponse(error); }
}
