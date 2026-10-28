import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  return createBookletRunnerHttp().approval(request, (await context.params).runId);
}
