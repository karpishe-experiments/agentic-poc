import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getDatabase } from "@/db/client";
import { createObjectStoreClient } from "@/lib/assets/create-object-store-client";
import { getServerEnv } from "@/lib/config/env";

const env = getServerEnv();
if (process.env.RUNNER_ENABLED !== "false" || env.DEPLOYMENT_ENV !== "_staging" || env.MONGODB_DATABASE !== "kids_booklet" || env.ASSETS_BUCKET !== "kids-booklet-staging-assets") throw new Error("Reset inventory requires the exact staging target and disabled dispatch.");
const database = getDatabase();
const s3 = createObjectStoreClient(env);
try {
  const names = (await database.database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name);
  const collections = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await database.database.collection(name).countDocuments()] as const)));
  let token: string | undefined;
  let assetObjects = 0;
  let assetBytes = 0;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: env.ASSETS_BUCKET, ContinuationToken: token }));
    for (const object of page.Contents ?? []) { assetObjects += 1; assetBytes += object.Size ?? 0; }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  console.log(`result: ${JSON.stringify({ preview: true, database: env.MONGODB_DATABASE, assetBucket: env.ASSETS_BUCKET, collections, assetObjects, assetBytes, paidProviderCalls: 0 })}`);
} finally { await database.close(); s3.destroy(); }
