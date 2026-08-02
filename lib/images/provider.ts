import type { ImageProviderCapabilities, ImageRequest, ImageResult } from "@/lib/contracts/images";

export interface ImageProvider {
  readonly runtime: "fake" | "real";
  readonly capabilities: ImageProviderCapabilities;
  execute(request: ImageRequest, inputAssets?: Array<{ assetId: string; bytes: Buffer }>): Promise<ImageResult>;
}
