import { createDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { GenerationService } from "@/lib/application/generation-service";
import { toErrorEnvelope } from "@/lib/http/errors";

export const runtime = "nodejs";

type RouteProperties = { params: Promise<{ jobId: string; itemId: string }> };

export async function POST(_request: Request, { params }: RouteProperties) {
  try {
    const { jobId, itemId } = await params;
    const database = createDatabase();
    const repositories = createRepositories(database);
    const job = await repositories.jobs.getStatus(jobId);
    if (!job) return Response.json({ error: { code: "job_not_found", message: "This generation job was not found." } }, { status: 404 });
    if (!job.items.some((item) => item.id === itemId && item.status === "failed")) return Response.json({ error: { code: "retry_not_available", message: "Only a failed generation item can be retried." } }, { status: 409 });
    const generation = new GenerationService({ database, repositories });
    if (job.jobType === "references") await generation.retryReferenceItem(job.bookletId, job.id, itemId);
    else if (job.jobType === "pages") await generation.retryPageItem(job.bookletId, job.id, itemId);
    else return Response.json({ error: { code: "retry_not_available", message: "This job type has no item retry." } }, { status: 409 });
    return Response.json({ data: await repositories.jobs.getStatus(job.id) });
  } catch (error) {
    const response = toErrorEnvelope(error);
    return Response.json(response.body, { status: response.status });
  }
}
