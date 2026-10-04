import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createObjectStoreClient } from "@/lib/assets/create-object-store-client";
import { getDatabase } from "@/db/client";
import { initializeMongoData } from "@/db/initialize";
import { createAssetStore } from "@/lib/assets/create-asset-store";
import { getServerEnv } from "@/lib/config/env";
import { digest, parseManifest, RecoveryStorage } from "./recovery-storage";

const env = getServerEnv();
if (process.env.RUNNER_ENABLED !== "false") throw new Error("Reset requires RUNNER_ENABLED=false.");
if (env.DEPLOYMENT_ENV !== "_staging" || env.MONGODB_DATABASE !== "kids_booklet") throw new Error("Production reset is prohibited.");
if (process.env.CONFIRM_DATABASE !== "kids_booklet") throw new Error("Set CONFIRM_DATABASE=kids_booklet to confirm staging reset.");
if (env.ASSETS_BUCKET !== "kids-booklet-staging-assets" || !env.RECOVERY_BUCKET || !process.env.BACKUP_ID) throw new Error("Reset requires the exact staging asset bucket and completed backup ID.");
const database = getDatabase();
const s3 = createObjectStoreClient(env);
try {
  const storage = new RecoveryStorage(s3, env.RECOVERY_BUCKET);
  const raw = (await storage.read(`database/${process.env.BACKUP_ID}.manifest.json`)).bytes;
  const complete = (await storage.read(`database/${process.env.BACKUP_ID}.complete`)).bytes;
  if (Buffer.from(complete).toString() !== digest(raw)) throw new Error("Reset backup completion marker is invalid.");
  const manifest = parseManifest(JSON.parse(Buffer.from(raw).toString()), process.env.BACKUP_ID, env.MONGODB_DATABASE, env.DEPLOYMENT_ENV);
  const savedKeys = new Set(manifest.assets.map(({ uri }) => uri));
  let checkToken: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: env.ASSETS_BUCKET, ContinuationToken: checkToken }));
    for (const { Key } of page.Contents ?? []) if (Key && !savedKeys.has(Key)) throw new Error("An asset is absent from the reset backup; no deletion started.");
    checkToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (checkToken);
  await database.database.dropDatabase();
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: env.ASSETS_BUCKET, ContinuationToken: token }));
    const keys = (page.Contents ?? []).flatMap(({ Key }) => Key ? [{ Key }] : []);
    if (keys.length) {
      const result = await s3.send(new DeleteObjectsCommand({ Bucket: env.ASSETS_BUCKET, Delete: { Objects: keys, Quiet: true } }));
      if (result.Errors?.length) throw new Error("Staging asset deletion failed; keep maintenance enabled and restore the retained backup.");
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  const remaining = await s3.send(new ListObjectsV2Command({ Bucket: env.ASSETS_BUCKET, MaxKeys: 1 }));
  if (remaining.Contents?.length) throw new Error("Staging asset bucket is not empty; initialization was not started.");
  await initializeMongoData(database, createAssetStore(env));
  console.log(JSON.stringify({ reset: true, environment: env.DEPLOYMENT_ENV, database: env.MONGODB_DATABASE }));
} finally { await database.close(); }
