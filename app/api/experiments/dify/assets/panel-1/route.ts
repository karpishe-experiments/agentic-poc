import { getDifyExperimentService } from "@/lib/dify-experiment/get-service";
import { difyExperimentErrorResponse } from "@/lib/dify-experiment/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const asset = await getDifyExperimentService().getImageAsset();
    return new Response(Uint8Array.from(asset.bytes).buffer as ArrayBuffer, { headers: { "Content-Type": asset.mimeType, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return difyExperimentErrorResponse(error); }
}
