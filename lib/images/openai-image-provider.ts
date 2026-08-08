import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { getServerEnv } from "@/lib/config/env";
import { imageRequestSchema, imageResultSchema, type ImageRequest, type ImageResult } from "@/lib/contracts/images";
import type { ImageProvider } from "@/lib/images/provider";

const sizeByGeometry = {
  square_1_1: "1536x1536",
  landscape_5_4: "1600x1280",
  portrait_4_5: "1280x1600",
} as const;

function errorKind(error: unknown): "transient" | "user_correctable" | "blocked" | "unavailable" {
  if (error instanceof OpenAI.APIError) {
    if (error.code === "credit_balance_exhausted" || error.code === "insufficient_quota" || error.type === "insufficient_quota") return "blocked";
    if (error.status === 429 || (error.status !== undefined && error.status >= 500)) return "transient";
    if (error.status === 401 || error.status === 403) return "unavailable";
    if (error.status === 400 || error.status === 422) return "user_correctable";
  }
  return "unavailable";
}

function providerErrorDetails(error: unknown): { status: number | null; code: string | null; type: string | null; requestId: string | null } {
  const source = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return {
    status: typeof source.status === "number" && Number.isFinite(source.status) ? source.status : null,
    code: typeof source.code === "string" ? source.code : null,
    type: typeof source.type === "string" ? source.type : null,
    requestId: typeof source.request_id === "string" ? source.request_id : typeof source.requestId === "string" ? source.requestId : null,
  };
}

export class OpenAIImageProvider implements ImageProvider {
  public readonly runtime = "real" as const;
  public readonly capabilities = { provider: "openai" as const, supportsEdit: true, maxReferenceImages: 8, supportedSizes: ["1536x1536", "1600x1280", "1280x1600"] as ["1536x1536", "1600x1280", "1280x1600"] };
  private readonly client: OpenAI;
  private readonly fastOutput: boolean;

  public constructor(client?: OpenAI, options: { fastOutput?: boolean } = {}) {
    this.client = client ?? new OpenAI({ apiKey: getServerEnv().OPENAI_API_KEY });
    this.fastOutput = options.fastOutput ?? false;
  }

  public async execute(input: ImageRequest, inputAssets: Array<{ assetId: string; bytes: Buffer }> = []): Promise<ImageResult> {
    const request = imageRequestSchema.parse(input);
    if (inputAssets.length > this.capabilities.maxReferenceImages) {
      return imageResultSchema.parse({ status: "failed", provider: "openai", model: request.model, providerRequestId: null, mimeType: null, bytesBase64: null, width: null, height: null, usage: null, error: { kind: "user_correctable", message: "This provider request includes too many reference images." } });
    }
    try {
      const size = sizeByGeometry[request.geometry];
      const fastOutputOptions = this.fastOutput
        ? { output_format: "jpeg" as const, output_compression: 60 }
        : {};
      const response = request.operation === "edit"
        ? await this.client.images.edit({ model: request.model, prompt: request.prompt, image: await Promise.all(inputAssets.map((asset) => toFile(asset.bytes, `${asset.assetId}.png`, { type: "image/png" }))), size, quality: request.quality === "balanced" ? "medium" : request.quality, ...fastOutputOptions })
        : await this.client.images.generate({ model: request.model, prompt: request.prompt, size, quality: request.quality === "balanced" ? "medium" : request.quality, ...fastOutputOptions });
      const data = "data" in response && response.data ? response.data[0] : undefined;
      const bytesBase64 = data?.b64_json ?? null;
      if (!bytesBase64) throw new Error("The image provider did not return image bytes.");
      const outputBytes = this.fastOutput
        ? await sharp(Buffer.from(bytesBase64, "base64")).png().toBuffer()
        : Buffer.from(bytesBase64, "base64");
      const metadata = await sharp(outputBytes).metadata();
      const usage = "usage" in response && response.usage ? response.usage : null;
      return imageResultSchema.parse({
        status: "succeeded", provider: "openai", model: request.model, providerRequestId: response._request_id ?? null, mimeType: "image/png", bytesBase64: outputBytes.toString("base64"), width: metadata.width ?? Number(size.split("x")[0]), height: metadata.height ?? Number(size.split("x")[1]),
        usage: usage ? { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 } : null, error: null,
      });
    } catch (error) {
      return imageResultSchema.parse({ status: "failed", provider: "openai", model: request.model, providerRequestId: null, mimeType: null, bytesBase64: null, width: null, height: null, usage: null, error: { kind: errorKind(error), message: error instanceof Error ? error.message : "Image generation failed.", providerError: providerErrorDetails(error) } });
    }
  }
}
