import { S3Client } from "@aws-sdk/client-s3";
import { getServerEnv, resolveDataRoot, type ServerEnv } from "@/lib/config/env";
import { FilesystemAssetStore } from "@/lib/assets/filesystem-asset-store";
import { S3AssetStore } from "@/lib/assets/s3-asset-store";
import type { AssetStore } from "@/lib/assets/asset-store";

export function createAssetStore(env: ServerEnv = getServerEnv()): AssetStore {
  if (env.ASSET_STORAGE === "s3") {
    if (!env.ASSETS_BUCKET) throw new Error("ASSETS_BUCKET is required.");
    return new S3AssetStore(env.ASSETS_BUCKET, new S3Client({ region: env.AWS_REGION }));
  }
  return new FilesystemAssetStore(resolveDataRoot(env));
}
