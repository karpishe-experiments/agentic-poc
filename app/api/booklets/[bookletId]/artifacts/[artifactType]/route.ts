import { z } from "zod";
import { getArtifactService } from "@/lib/application/artifact-service";
import { artifactTypeSchema } from "@/lib/contracts/domain";
import { materializePagePlan, materializeStoryPlan } from "@/lib/application/entity-materialization";
import { pagePlanDraftSchema, persistentPagePlanToDraft, persistentStoryPlanToDraft, storyPlanDraftSchema } from "@/lib/contracts/drafts";
import { pagePlanSchema, storyPlanSchema } from "@/lib/contracts/artifacts";
import { toErrorEnvelope } from "@/lib/http/errors";

export const runtime = "nodejs";

const bodySchema = z.object({ content: z.unknown() });
type RouteProperties = { params: Promise<{ bookletId: string; artifactType: string }> };

export async function GET(_request: Request, { params }: RouteProperties) {
  try {
    const { bookletId, artifactType } = await params;
    return Response.json({ data: await getArtifactService().get(bookletId, artifactTypeSchema.parse(artifactType)) });
  } catch (error) {
    const response = toErrorEnvelope(error);
    return Response.json(response.body, { status: response.status });
  }
}

export async function PATCH(request: Request, { params }: RouteProperties) {
  try {
    const { bookletId, artifactType } = await params;
    const { content } = bodySchema.parse(await request.json());
    const type = artifactTypeSchema.parse(artifactType);
    const service = getArtifactService();
    if (type === "story_plan") {
      const current = await service.get(bookletId, type);
      const previous = current.currentVersion ? storyPlanSchema.parse(current.currentVersion.content) : null;
      const draft = storyPlanDraftSchema.safeParse(content).data ?? persistentStoryPlanToDraft(content, previous);
      if (!draft) throw new Error("Use existing entity IDs only, or submit new Story Plan entities with kind 'new' and a clientKey.");
      return Response.json({ data: await service.revise(bookletId, type, materializeStoryPlan(draft, previous)) });
    }
    if (type === "page_plan") {
      const current = await service.get(bookletId, type);
      const previous = current.currentVersion ? pagePlanSchema.parse(current.currentVersion.content) : null;
      const draft = pagePlanDraftSchema.safeParse(content).data ?? persistentPagePlanToDraft(content, previous);
      if (!draft) throw new Error("Use the existing Page Plan IDs when editing an existing plan.");
      return Response.json({ data: await service.revise(bookletId, type, materializePagePlan(draft, previous)) });
    }
    return Response.json({ data: await service.revise(bookletId, type, content) });
  } catch (error) {
    const response = toErrorEnvelope(error);
    return Response.json(response.body, { status: response.status });
  }
}
