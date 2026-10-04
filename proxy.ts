import { NextResponse, type NextRequest } from "next/server";
import { hasValidBasicAuthorization } from "@/lib/http/basic-auth";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/health/live") return NextResponse.next();
  if (request.nextUrl.pathname === "/api/integrations/dify-community/callback" && process.env.DEPLOYMENT_ENV === "_staging" && process.env.DIFY_COMMUNITY_PROBE_ENABLED === "true") return NextResponse.next();
  if (["/api/experiments/booklet-tools/authorize", "/api/experiments/booklet-tools/context", "/api/experiments/booklet-tools/result", "/api/experiments/booklet-tools/failure"].includes(request.nextUrl.pathname) && process.env.DIFY_BOOKLET_RUNNER_ENABLED === "true" && (process.env.DEPLOYMENT_ENV === "local" || process.env.DEPLOYMENT_ENV === "_staging" || process.env.DEPLOYMENT_ENV === undefined)) return NextResponse.next();
  if (hasValidBasicAuthorization(request.headers.get("authorization"))) return NextResponse.next();
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Kids Booklet", charset="UTF-8"', "Cache-Control": "no-store" } });
}

export const config = { matcher: ["/:path*"] };
