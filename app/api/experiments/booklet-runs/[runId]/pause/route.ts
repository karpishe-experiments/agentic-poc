import { bookletRunnerHttp } from "@/lib/experiment-runner/http";
export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  return bookletRunnerHttp.control(request, (await params).runId, "pause");
}
