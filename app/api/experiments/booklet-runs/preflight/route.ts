import { bookletRunnerHttp } from "@/lib/experiment-runner/http";
export const GET = (request: Request) => bookletRunnerHttp.probePreflight(request);
