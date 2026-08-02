import { z } from "zod";
import { getArtifactService } from "@/lib/application/artifact-service";
import { artifactTypeSchema } from "@/lib/contracts/domain";
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
    return Response.json({ data: await getArtifactService().revise(bookletId, artifactTypeSchema.parse(artifactType), content) });
  } catch (error) {
    const response = toErrorEnvelope(error);
    return Response.json(response.body, { status: response.status });
  }
}
