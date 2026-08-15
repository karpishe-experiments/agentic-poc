import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { getServerEnv } from "@/lib/config/env";
import { imageRequestSchema, imageResultSchema, type ImageRequest, type ImageResult } from "@/lib/contracts/images";
import type { ImageProvider } from "@/lib/images/provider";

const sizeByGeometry = {
  square_1_1: "1024x1024",
  landscape_5_4: "1536x1024",
  portrait_4_5: "1024x1536",
} as const;

function supportsInputFidelity(model: string): boolean {
  return ["gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"].some((supported) => model === supported || model.startsWith(`${supported}-`));
}

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
      const qualityOptions = request.quality === "disabled" ? {} : { quality: request.quality };
      const fidelityOptions = request.quality !== "disabled" && supportsInputFidelity(request.model)
        ? { input_fidelity: request.quality }
        : {};
      const response = request.operation === "edit"
        ? await this.client.images.edit({ model: request.model, prompt: request.prompt, image: await Promise.all(inputAssets.map((asset) => toFile(asset.bytes, `${asset.assetId}.png`, { type: "image/png" }))), size, ...qualityOptions, ...fidelityOptions })
        : await this.client.images.generate({ model: request.model, prompt: request.prompt, size, ...qualityOptions });
      const data = "data" in response && response.data ? response.data[0] : undefined;
      const bytesBase64 = data?.b64_json ?? null;
      if (!bytesBase64) throw new Error("The image provider did not return image bytes.");
      const outputBytes = Buffer.from(bytesBase64, "base64");
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
