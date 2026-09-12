import { NextResponse } from "next/server";
import { getBookletService } from "@/lib/application/booklet-service";
import { toErrorEnvelope } from "@/lib/http/errors";
import { runTrackedMutation } from "@/lib/application/deployment-control";

export const runtime = "nodejs";

export async function GET() {
  try {
    const booklets = await getBookletService().list();
    return NextResponse.json({ data: booklets });
  } catch (error) {
    const response = toErrorEnvelope(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const booklet = await runTrackedMutation(() => getBookletService().create(body));
    return NextResponse.json({ data: booklet }, { status: 201 });
  } catch (error) {
    const response = toErrorEnvelope(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
