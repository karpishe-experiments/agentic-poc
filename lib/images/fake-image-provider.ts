import sharp from "sharp";
import { imageRequestSchema, imageResultSchema, type ImageRequest, type ImageResult } from "@/lib/contracts/images";
import type { ImageProvider } from "@/lib/images/provider";

const dimensionsByGeometry = {
  square_1_1: { width: 1024, height: 1024 },
  landscape_5_4: { width: 1536, height: 1024 },
  portrait_4_5: { width: 1024, height: 1536 },
} as const;

export class FakeImageProvider implements ImageProvider {
  public readonly runtime = "fake" as const;
  public readonly capabilities = { provider: "openai" as const, supportsEdit: true, maxReferenceImages: 8, supportedSizes: ["1024x1024", "1536x1024", "1024x1536"] as ["1024x1024", "1536x1024", "1024x1536"] };

  public async execute(input: ImageRequest): Promise<ImageResult> {
    const request = imageRequestSchema.parse(input);
    const { width, height } = dimensionsByGeometry[request.geometry];
    const accent = request.operation === "edit" ? "#b8dce8" : "#f3d39b";
    const bytes = await sharp({ create: { width, height, channels: 4, background: accent } }).png().toBuffer();
    return imageResultSchema.parse({
      status: "succeeded", provider: "openai", model: request.model, providerRequestId: `fake-${request.operation}`, mimeType: "image/png", bytesBase64: bytes.toString("base64"), width, height,
      usage: { inputTokens: 0, outputTokens: 0 }, error: null,
    });
  }
}
