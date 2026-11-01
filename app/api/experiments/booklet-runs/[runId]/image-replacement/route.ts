import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  return createBookletRunnerHttp().imageReplacementPreview(request, (await context.params).runId);
}
