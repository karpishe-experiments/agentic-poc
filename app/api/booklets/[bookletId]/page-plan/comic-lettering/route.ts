import { NextResponse } from "next/server";
import { RevisionService } from "@/lib/application/revision-service";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ bookletId: string }> }) {
  try {
    const { bookletId } = await params;
    return NextResponse.json({ data: await new RevisionService().upgradePagePlanLettering(bookletId) });
  } catch (error) {
    return NextResponse.json({ error: { message: error instanceof Error ? error.message : "The Page Plan could not be upgraded." } }, { status: 400 });
  }
}
