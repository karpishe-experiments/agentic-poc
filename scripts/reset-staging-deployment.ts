import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createObjectStoreClient } from "@/lib/assets/create-object-store-client";
import { getDatabase } from "@/db/client";
import { initializeMongoData } from "@/db/initialize";
import { createAssetStore } from "@/lib/assets/create-asset-store";
import { getServerEnv } from "@/lib/config/env";

const env = getServerEnv();
if (process.env.RUNNER_ENABLED !== "false") throw new Error("Reset requires RUNNER_ENABLED=false.");
if (env.DEPLOYMENT_ENV !== "_staging" || env.MONGODB_DATABASE !== "kids_booklet") throw new Error("Production reset is prohibited.");
if (process.env.CONFIRM_DATABASE !== "kids_booklet") throw new Error("Set CONFIRM_DATABASE=kids_booklet to confirm staging reset.");
if (!env.ASSETS_BUCKET) throw new Error("ASSETS_BUCKET is required.");
const database = getDatabase();
const s3 = createObjectStoreClient(env);
try {
  await database.database.dropDatabase();
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: env.ASSETS_BUCKET, ContinuationToken: token }));
    const keys = (page.Contents ?? []).flatMap(({ Key }) => Key ? [{ Key }] : []);
    if (keys.length) await s3.send(new DeleteObjectsCommand({ Bucket: env.ASSETS_BUCKET, Delete: { Objects: keys, Quiet: true } }));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  await initializeMongoData(database, createAssetStore(env));
  console.log(JSON.stringify({ reset: true, environment: env.DEPLOYMENT_ENV, database: env.MONGODB_DATABASE }));
} finally { await database.close(); }
