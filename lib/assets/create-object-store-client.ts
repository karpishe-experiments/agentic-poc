import { S3Client } from "@aws-sdk/client-s3";
import type { ServerEnv } from "@/lib/config/env";

/** Creates the single S3-compatible client used by AWS S3 locally and R2 in deployments. */
export function createObjectStoreClient(env: Pick<ServerEnv, "AWS_REGION" | "OBJECT_STORE_ENDPOINT">): S3Client {
  return new S3Client({
    region: env.AWS_REGION,
    endpoint: env.OBJECT_STORE_ENDPOINT,
    forcePathStyle: Boolean(env.OBJECT_STORE_ENDPOINT),
  });
}
