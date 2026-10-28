import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";

export const runtime = "nodejs";
export async function POST(request: Request) { return createBookletRunnerHttp().campaign(request); }
