import { getServerEnv, resolveDataRoot, type ServerEnv } from "@/lib/config/env";
import { createObjectStoreClient } from "@/lib/assets/create-object-store-client";
import { FilesystemAssetStore } from "@/lib/assets/filesystem-asset-store";
import { S3AssetStore } from "@/lib/assets/s3-asset-store";
import type { AssetStore } from "@/lib/assets/asset-store";

export function createAssetStore(env: ServerEnv = getServerEnv()): AssetStore {
  if (env.ASSET_STORAGE === "s3") {
    if (!env.ASSETS_BUCKET) throw new Error("ASSETS_BUCKET is required.");
    return new S3AssetStore(env.ASSETS_BUCKET, createObjectStoreClient(env));
  }
  return new FilesystemAssetStore(resolveDataRoot(env));
}
