import { NextResponse } from "next/server";
import { createAssetStore } from "@/lib/assets/create-asset-store";
import { getBookletService } from "@/lib/application/booklet-service";
import { toErrorEnvelope } from "@/lib/http/errors";

export const runtime = "nodejs";

type RouteProperties = { params: Promise<{ assetId: string }> };

export async function GET(_: Request, { params }: RouteProperties) {
  try {
    const { assetId } = await params;
    const asset = await getBookletService().getAsset(assetId);
    if (!asset) {
      return NextResponse.json({ error: { code: "asset_not_found", message: "This asset could not be found.", recoverable: true } }, { status: 404 });
    }

    const store = createAssetStore();
    const bytes = await store.get(asset.uri);
    const body = Uint8Array.from(bytes).buffer as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Content-Type": asset.mimeType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
      return NextResponse.json({ error: { code: "asset_not_found", message: "This asset could not be found.", recoverable: true } }, { status: 404 });
    }
    const response = toErrorEnvelope(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
