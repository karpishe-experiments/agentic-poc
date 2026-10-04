import { bookletRunnerHttp } from "@/lib/experiment-runner/http";
export const GET = (request: Request) => bookletRunnerHttp.list(request);
export const POST = (request: Request) => bookletRunnerHttp.create(request);
