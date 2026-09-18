import { after } from "next/server";
import { z } from "zod";
import { runTrackedMutation } from "@/lib/application/deployment-control";
import { getDifyExperimentAdapter, getDifyExperimentService } from "@/lib/dify-experiment/get-service";
import { assertSameOriginJsonRequest, difyExperimentErrorResponse } from "@/lib/dify-experiment/http";

export const runtime = "nodejs";
const bodySchema = z.object({ action: z.enum(["create", "resume", "revise"]), expected_revision: z.number().int().min(1).optional(), feedback: z.string().optional() }).strict();

export async function POST(request: Request) {
  try {
    assertSameOriginJsonRequest(request); const body = bodySchema.parse(await request.json()); const service = getDifyExperimentService();
    const started = await runTrackedMutation(() => service.startTurn({ action: body.action, expectedRevision: body.expected_revision, feedback: body.feedback }));
    after(() => runTrackedMutation(async () => {
      if (service.isFakeMode()) return service.runFakeTurn(started.run.id);
      try {
        const result = await getDifyExperimentAdapter().run(body.action, started.run.id);
        await service.completeRun(started.run.id, { status: "completed", toolCalls: result.toolCalls, message: result.message, providerTaskId: result.taskId, providerConversationId: result.conversationId, providerMessageId: result.messageId, usage: result.usage });
      } catch (caught) { await service.completeRun(started.run.id, { status: "failed", toolCalls: [], message: null, error: caught instanceof Error ? caught.message : "The Dify agent run failed." }); }
    }).catch(() => undefined));
    return Response.json({ data: { run_id: started.run.id, context: started.context } }, { status: 202 });
  } catch (error) { return difyExperimentErrorResponse(error); }
}
