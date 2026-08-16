import { getDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { toErrorEnvelope } from "@/lib/http/errors";

export const runtime = "nodejs";

type RouteProperties = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: RouteProperties) {
  try {
    const { jobId } = await params;
    const status = await createRepositories(getDatabase()).jobs.getStatus(jobId);
    if (!status) return Response.json({ error: { code: "job_not_found", message: "This generation job was not found." } }, { status: 404 });
    return Response.json({ data: status });
  } catch (error) {
    const response = toErrorEnvelope(error);
    return Response.json(response.body, { status: response.status });
  }
}
