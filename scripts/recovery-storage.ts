import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import { normalizeAssetUri } from "@/lib/assets/asset-uri";

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
export const backupIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const manifestSchema = z.object({
  schemaVersion: z.literal("1"), backupId: backupIdSchema,
  database: z.string().min(1), environment: z.enum(["_staging", "_prod"]),
  imageDigest: z.string().nullable(), sha256: checksum,
  collections: z.record(z.string().min(1), z.number().int().nonnegative()),
  assets: z.array(z.object({ uri: z.string(), recoveryKey: z.string(), bytes: z.number().int().nonnegative(), sha256: checksum, contentType: z.string() }).strict()),
}).strict();
export type RecoveryManifest = z.infer<typeof manifestSchema>;
export const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

export function parseManifest(value: unknown, backupId: string, database: string, environment: string): RecoveryManifest {
  if (!value || typeof value !== "object" || !("schemaVersion" in value) || value.schemaVersion !== "1") throw new Error("Invalid backup manifest schema.");
  const manifest = manifestSchema.parse(value);
  if (manifest.backupId !== backupId || manifest.database !== database || manifest.environment !== environment) throw new Error("Backup manifest does not match this target.");
  const seen = new Set<string>();
  for (const asset of manifest.assets) {
    const uri = normalizeAssetUri(asset.uri);
    if (uri !== asset.uri || seen.has(uri) || asset.recoveryKey !== `assets/${backupId}/${uri}`) throw new Error("Backup contains duplicate, noncanonical or out-of-scope asset keys.");
    seen.add(uri);
  }
  return manifest;
}

export class RecoveryStorage {
  constructor(private readonly s3: S3Client, private readonly bucket: string) {}
  async read(key: string, bucket = this.bucket) {
    const result = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) throw new Error("Recovery object body is missing.");
    return { bytes: await result.Body.transformToByteArray(), contentType: result.ContentType ?? "application/octet-stream" };
  }
  async reserve(backupId: string) {
    backupIdSchema.parse(backupId);
    // Failed reservations persist. Retrying requires a new ID and cannot overwrite a snapshot.
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: `database/${backupId}.reserved`, Body: backupId, IfNoneMatch: "*" }));
  }
  async writeVerified(key: string, bytes: Uint8Array | string, contentType: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: contentType, IfNoneMatch: "*" }));
    if (digest((await this.read(key)).bytes) !== digest(bytes)) throw new Error("Uploaded recovery object failed checksum verification.");
  }
  async snapshot(backupId: string, uri: string, sourceBucket: string) {
    const key = normalizeAssetUri(uri);
    const source = await this.read(key, sourceBucket);
    const recoveryKey = `assets/${backupId}/${key}`;
    await this.writeVerified(recoveryKey, source.bytes, source.contentType);
    return { uri: key, recoveryKey, bytes: source.bytes.length, sha256: digest(source.bytes), contentType: source.contentType };
  }
  async verifiedAsset(asset: RecoveryManifest["assets"][number]) {
    const object = await this.read(asset.recoveryKey);
    if (object.bytes.length !== asset.bytes || digest(object.bytes) !== asset.sha256) throw new Error("Backup asset checksum verification failed.");
    return object.bytes;
  }
}
