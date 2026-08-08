import { NextResponse } from "next/server";
import { regenerationRequestSchema } from "@/lib/contracts/regeneration";
import { RevisionService } from "@/lib/application/revision-service";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ bookletId: string }> }) {
  try {
    const { bookletId } = await params;
    const body = regenerationRequestSchema.parse(await request.json());
    return NextResponse.json({ data: await new RevisionService().regenerateImage(bookletId, body) });
  } catch (error) {
    return NextResponse.json({ error: { message: error instanceof Error ? error.message : "The selected image could not be regenerated." } }, { status: 400 });
  }
}
