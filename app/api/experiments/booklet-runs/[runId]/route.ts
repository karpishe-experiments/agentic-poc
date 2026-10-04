import { bookletRunnerHttp } from "@/lib/experiment-runner/http";
export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  return bookletRunnerHttp.detail(request, (await params).runId);
}
