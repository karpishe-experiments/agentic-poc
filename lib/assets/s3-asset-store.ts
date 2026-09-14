import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { AssetStore, StoredAsset } from "@/lib/assets/asset-store";
import { normalizeAssetUri } from "@/lib/assets/asset-uri";

export class S3AssetStore implements AssetStore {
  public constructor(private readonly bucket: string, private readonly client: S3Client) {}

  public async put(uri: string, content: Uint8Array, mimeType: string): Promise<StoredAsset> {
    const key = normalizeAssetUri(uri);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: content, ContentType: mimeType, IfNoneMatch: "*" }));
    return { uri: key, mimeType, byteLength: content.byteLength };
  }

  public async get(uri: string): Promise<Uint8Array> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: normalizeAssetUri(uri) }));
    if (!result.Body) throw new Error("S3 returned an empty response body.");
    return result.Body.transformToByteArray();
  }

  public async exists(uri: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: normalizeAssetUri(uri) }));
      return true;
    } catch (error) {
      if (error && typeof error === "object" && "$metadata" in error && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404) return false;
      throw error;
    }
  }
}
