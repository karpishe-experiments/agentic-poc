import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";

export const runtime = "nodejs";
export async function GET(request: Request) { return createBookletRunnerHttp().campaigns(request); }
export async function POST(request: Request) { return createBookletRunnerHttp().campaign(request); }
