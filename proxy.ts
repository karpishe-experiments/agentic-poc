import { NextResponse, type NextRequest } from "next/server";
import { hasValidBasicAuthorization } from "@/lib/http/basic-auth";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/health/live") return NextResponse.next();
  const toolPaths = new Set(["/api/experiments/dify/tools/context", "/api/experiments/dify/tools/draft", "/api/experiments/dify/tools/review", "/api/experiments/dify/tools/image"]);
  if (process.env.DEPLOYMENT_ENV === "_staging" && toolPaths.has(request.nextUrl.pathname)) return NextResponse.next();
  if (hasValidBasicAuthorization(request.headers.get("authorization"))) return NextResponse.next();
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Kids Booklet", charset="UTF-8"', "Cache-Control": "no-store" } });
}

export const config = { matcher: ["/:path*"] };
