import { z } from "zod";
import { getArtifactService } from "@/lib/application/artifact-service";
import { artifactTypeSchema } from "@/lib/contracts/domain";
import { toErrorEnvelope } from "@/lib/http/errors";
import { streamOperation } from "@/lib/http/stream-operation";

export const runtime = "nodejs";

const bodySchema = z.object({ artifactVersionId: z.string().uuid() });
type RouteProperties = { params: Promise<{ bookletId: string; artifactType: string }> };

export async function POST(request: Request, { params }: RouteProperties) {
  try {
    const { bookletId, artifactType } = await params;
    const { artifactVersionId } = bodySchema.parse(await request.json());
    const type = artifactTypeSchema.parse(artifactType);
    return streamOperation(() => getArtifactService().approve(bookletId, type, artifactVersionId));
  } catch (error) {
    const response = toErrorEnvelope(error);
    return Response.json(response.body, { status: response.status });
  }
}
