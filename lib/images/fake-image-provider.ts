import sharp from "sharp";
import { imageRequestSchema, imageResultSchema, type ImageRequest, type ImageResult } from "@/lib/contracts/images";
import type { ImageProvider } from "@/lib/images/provider";

const dimensionsByGeometry = {
  square_1_1: { width: 1024, height: 1024 },
  landscape_5_4: { width: 1536, height: 1024 },
  portrait_4_5: { width: 1024, height: 1536 },
} as const;

async function placeholderImage(input: { width: number; height: number; edited: boolean }): Promise<Buffer> {
  const sky = input.edited ? "#b8dce8" : "#f3d39b";
  const hill = input.edited ? "#6d9f9b" : "#c9794e";
  const sun = input.edited ? "#f7d67a" : "#f4b860";
  const makeBlock = (width: number, height: number, background: string) => sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
  return sharp({ create: { width: input.width, height: input.height, channels: 4, background: sky } })
    .composite([
      { input: await makeBlock(Math.round(input.width * 0.17), Math.round(input.height * 0.17), sun), left: Math.round(input.width * 0.71), top: Math.round(input.height * 0.11) },
      { input: await makeBlock(input.width, Math.round(input.height * 0.33), hill), left: 0, top: Math.round(input.height * 0.67) },
      { input: await makeBlock(Math.round(input.width * 0.56), Math.round(input.height * 0.15), "#fffdf9"), left: Math.round(input.width * 0.08), top: Math.round(input.height * 0.1) },
    ])
    .png()
    .toBuffer();
}

export class FakeImageProvider implements ImageProvider {
  public readonly runtime = "fake" as const;
  public readonly capabilities = { provider: "openai" as const, supportsEdit: true, maxReferenceImages: 8, supportedSizes: ["1024x1024", "1536x1024", "1024x1536"] as ["1024x1024", "1536x1024", "1024x1536"] };

  public async execute(input: ImageRequest): Promise<ImageResult> {
    const request = imageRequestSchema.parse(input);
    const { width, height } = dimensionsByGeometry[request.geometry];
    const bytes = await placeholderImage({
      width,
      height,
      edited: request.operation === "edit",
    });
    return imageResultSchema.parse({
      status: "succeeded", provider: "openai", model: request.model, providerRequestId: `fake-${request.operation}`, mimeType: "image/png", bytesBase64: bytes.toString("base64"), width, height,
      usage: { inputTokens: 0, outputTokens: 0 }, error: null,
    });
  }
}
