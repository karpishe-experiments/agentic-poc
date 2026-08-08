import { createDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { GenerationService } from "@/lib/application/generation-service";
import { toErrorEnvelope } from "@/lib/http/errors";

export const runtime = "nodejs";

type RouteProperties = { params: Promise<{ jobId: string }> };

export async function POST(_request: Request, { params }: RouteProperties) {
  try {
    const { jobId } = await params;
    const database = createDatabase();
    const repositories = createRepositories(database);
    const job = await repositories.jobs.getStatus(jobId);
    if (!job) return Response.json({ error: { code: "job_not_found", message: "This generation job was not found." } }, { status: 404 });
    if (job.items.some((item) => item.status === "failed")) return Response.json({ error: { code: "retry_required", message: "Retry the failed item before continuing generation." } }, { status: 409 });
    if (job.items.some((item) => item.status === "running")) return Response.json({ error: { code: "job_already_running", message: "Generation is already running." } }, { status: 409 });
    if (!job.items.some((item) => item.status === "pending")) return Response.json({ error: { code: "nothing_to_continue", message: "This job has no pending items." } }, { status: 409 });

    await repositories.jobs.continueJob(job.id);
    const generation = new GenerationService({ database, repositories });
    if (job.jobType === "references") generation.startReferenceJob(job.bookletId, job.id);
    else if (job.jobType === "pages") generation.startPageJob(job.bookletId, job.id);
    else return Response.json({ error: { code: "continue_not_available", message: "This job type cannot be continued here." } }, { status: 409 });

    return Response.json({ data: await repositories.jobs.getStatus(job.id) });
  } catch (error) {
    const response = toErrorEnvelope(error);
    return Response.json(response.body, { status: response.status });
  }
}
