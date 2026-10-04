import { bookletRunnerHttp } from "@/lib/experiment-runner/http";

export const POST = (request: Request) => bookletRunnerHttp.imageComplete(request);
