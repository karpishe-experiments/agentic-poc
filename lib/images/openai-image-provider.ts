import OpenAI, { toFile } from "openai";
import { getServerEnv } from "@/lib/config/env";
import { imageRequestSchema, imageResultSchema, type ImageRequest, type ImageResult } from "@/lib/contracts/images";
import type { ImageProvider } from "@/lib/images/provider";

const sizeByGeometry = {
  square_1_1: "1024x1024",
  landscape_5_4: "1536x1024",
  portrait_4_5: "1024x1536",
} as const;

function errorKind(error: unknown): "transient" | "user_correctable" | "blocked" | "unavailable" {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429 || (error.status !== undefined && error.status >= 500)) return "transient";
    if (error.status === 401 || error.status === 403) return "unavailable";
    if (error.status === 400 || error.status === 422) return "user_correctable";
  }
  return "unavailable";
}

export class OpenAIImageProvider implements ImageProvider {
  public readonly runtime = "real" as const;
  public readonly capabilities = { provider: "openai" as const, supportsEdit: true, maxReferenceImages: 8, supportedSizes: ["1024x1024", "1536x1024", "1024x1536"] as ["1024x1024", "1536x1024", "1024x1536"] };
  private readonly client: OpenAI;

  public constructor(client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey: getServerEnv().OPENAI_API_KEY });
  }

  public async execute(input: ImageRequest, inputAssets: Array<{ assetId: string; bytes: Buffer }> = []): Promise<ImageResult> {
    const request = imageRequestSchema.parse(input);
    if (inputAssets.length > this.capabilities.maxReferenceImages) {
      return imageResultSchema.parse({ status: "failed", provider: "openai", model: request.model, providerRequestId: null, mimeType: null, bytesBase64: null, width: null, height: null, usage: null, error: { kind: "user_correctable", message: "This provider request includes too many reference images." } });
    }
    try {
      const size = sizeByGeometry[request.geometry];
      const response = request.operation === "edit"
        ? await this.client.images.edit({ model: request.model, prompt: request.prompt, image: await Promise.all(inputAssets.map((asset) => toFile(asset.bytes, `${asset.assetId}.png`, { type: "image/png" }))), size, quality: request.quality === "balanced" ? "medium" : request.quality })
        : await this.client.images.generate({ model: request.model, prompt: request.prompt, size, quality: request.quality === "balanced" ? "medium" : request.quality });
      const data = "data" in response && response.data ? response.data[0] : undefined;
      const bytesBase64 = data?.b64_json ?? null;
      if (!bytesBase64) throw new Error("The image provider did not return PNG image bytes.");
      const usage = "usage" in response && response.usage ? response.usage : null;
      return imageResultSchema.parse({
        status: "succeeded", provider: "openai", model: request.model, providerRequestId: response._request_id ?? null, mimeType: "image/png", bytesBase64, width: size.startsWith("1536") ? 1536 : 1024, height: size.endsWith("1536") ? 1536 : 1024,
        usage: usage ? { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 } : null, error: null,
      });
    } catch (error) {
      return imageResultSchema.parse({ status: "failed", provider: "openai", model: request.model, providerRequestId: null, mimeType: null, bytesBase64: null, width: null, height: null, usage: null, error: { kind: errorKind(error), message: error instanceof Error ? error.message : "Image generation failed." } });
    }
  }
}
