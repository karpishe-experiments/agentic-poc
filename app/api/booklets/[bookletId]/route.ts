import { NextResponse } from "next/server";
import { getBookletService } from "@/lib/application/booklet-service";
import { toErrorEnvelope } from "@/lib/http/errors";

export const runtime = "nodejs";

type RouteProperties = { params: Promise<{ bookletId: string }> };

export async function GET(_: Request, { params }: RouteProperties) {
  try {
    const { bookletId } = await params;
    const snapshot = await getBookletService().getWorkspaceSnapshot(bookletId);
    return NextResponse.json({ data: snapshot });
  } catch (error) {
    const response = toErrorEnvelope(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
