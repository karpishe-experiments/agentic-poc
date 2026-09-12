import { NextResponse, type NextRequest } from "next/server";
import { hasValidBasicAuthorization } from "@/lib/http/basic-auth";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/health/live") return NextResponse.next();
  if (hasValidBasicAuthorization(request.headers.get("authorization"))) return NextResponse.next();
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Kids Booklet", charset="UTF-8"', "Cache-Control": "no-store" } });
}

export const config = { matcher: ["/:path*"] };
