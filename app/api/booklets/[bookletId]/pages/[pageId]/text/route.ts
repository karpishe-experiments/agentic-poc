import { z } from "zod";
import { NextResponse } from "next/server";
import { RevisionService } from "@/lib/application/revision-service";

export const runtime = "nodejs";

const requestSchema = z.object({ readerText: z.string().trim().min(1).max(5_000) });

export async function PATCH(request: Request, { params }: { params: Promise<{ bookletId: string; pageId: string }> }) {
  try {
    const { bookletId, pageId } = await params;
    const body = requestSchema.parse(await request.json());
    return NextResponse.json({ data: await new RevisionService().recomposePageText(bookletId, pageId, body.readerText) });
  } catch (error) {
    return NextResponse.json({ error: { message: error instanceof Error ? error.message : "The page text could not be revised." } }, { status: 400 });
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ bookletId: string; pageId: string }> }) {
  try {
    const { bookletId, pageId } = await params;
    return NextResponse.json({ data: await new RevisionService().regeneratePageVisual(bookletId, pageId) });
  } catch (error) {
    return NextResponse.json({ error: { message: error instanceof Error ? error.message : "The page visual could not be regenerated." } }, { status: 400 });
  }
}
