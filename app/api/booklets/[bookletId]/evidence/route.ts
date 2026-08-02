import { NextResponse } from "next/server";
import { EvidenceService } from "@/lib/application/evidence-service";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ bookletId: string }> }) {
  const { bookletId } = await params;
  return NextResponse.json({ data: await new EvidenceService().buildSummary(bookletId) });
}

export async function POST(_request: Request, { params }: { params: Promise<{ bookletId: string }> }) {
  const { bookletId } = await params;
  return NextResponse.json({ data: await new EvidenceService().writeSummary(bookletId) }, { status: 201 });
}
