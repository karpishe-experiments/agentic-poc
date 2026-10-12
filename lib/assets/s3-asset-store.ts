import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { AssetStore, StoredAsset } from "@/lib/assets/asset-store";
import { normalizeAssetUri } from "@/lib/assets/asset-uri";
import { operationSignal, remainingOperationMs, withOperationBudget } from "@/lib/operations/budget";

export class S3AssetStore implements AssetStore {
  public constructor(private readonly bucket: string, private readonly client: S3Client) {}

  public async put(uri: string, content: Uint8Array, mimeType: string): Promise<StoredAsset> {
    const key = normalizeAssetUri(uri);
    await withOperationBudget(Date.now() + remainingOperationMs(), () =>
      this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: content, ContentType: mimeType, IfNoneMatch: "*" }), { abortSignal: operationSignal() }));
    return { uri: key, mimeType, byteLength: content.byteLength };
  }

  public async get(uri: string): Promise<Uint8Array> {
    return withOperationBudget(Date.now() + remainingOperationMs(), async () => {
      const signal = operationSignal()!;
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: normalizeAssetUri(uri) }), { abortSignal: signal });
      const body = result.Body;
      if (!body) throw new Error("S3 returned an empty response body.");
      // The SDK request can finish before its Node response stream. Abort that
      // stream as well; abandoning transformToByteArray would leave I/O alive.
      const abort = () => { if ("destroy" in body) body.destroy(); };
      signal.addEventListener("abort", abort, { once: true });
      try { signal.throwIfAborted(); return await body.transformToByteArray(); }
      finally { signal.removeEventListener("abort", abort); }
    });
  }

  public async exists(uri: string): Promise<boolean> {
    try {
      await withOperationBudget(Date.now() + remainingOperationMs(), () =>
        this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: normalizeAssetUri(uri) }), { abortSignal: operationSignal() }));
      return true;
    } catch (error) {
      if (error && typeof error === "object" && "$metadata" in error && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404) return false;
      throw error;
    }
  }
}
