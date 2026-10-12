import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import { normalizeAssetUri } from "@/lib/assets/asset-uri";
import { operationSignal, remainingOperationMs, withOperationBudget } from "@/lib/operations/budget";

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
  // Maintenance verifies the retained pre-change snapshot without reserving or
  // writing another backup. Callers separately enforce admission and target scope.
  async verifiedCompletedBackup(backupId: string, database: string, environment: string, imageDigest: string): Promise<RecoveryManifest> {
    backupIdSchema.parse(backupId);
    if (!/^(?:ghcr\.io\/[a-z0-9._/-]+@)?sha256:[a-f0-9]{64}$/.test(imageDigest)) throw new Error("Backup verification requires the selected immutable image digest.");
    const raw = (await this.read(`database/${backupId}.manifest.json`)).bytes;
    const complete = (await this.read(`database/${backupId}.complete`)).bytes;
    if (Buffer.from(complete).toString() !== digest(raw)) throw new Error("Backup completion marker does not match manifest.");
    const manifest = parseManifest(JSON.parse(Buffer.from(raw).toString()), backupId, database, environment);
    if (manifest.imageDigest !== imageDigest) throw new Error("Backup image does not match the selected release.");
    const archive = (await this.read(`database/${backupId}.archive.gz`)).bytes;
    if (digest(archive) !== manifest.sha256) throw new Error("Backup archive checksum verification failed.");
    for (const asset of manifest.assets) await this.verifiedAsset(asset);
    return manifest;
  }
  async read(key: string, bucket = this.bucket) {
    return withOperationBudget(Date.now() + remainingOperationMs(), async () => {
      const signal = operationSignal()!;
      const result = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
      const body = result.Body;
      if (!body) throw new Error("Recovery object body is missing.");
      const abort = () => { if ("destroy" in body) body.destroy(); };
      signal.addEventListener("abort", abort, { once: true });
      try { signal.throwIfAborted(); return { bytes: await body.transformToByteArray(), contentType: result.ContentType ?? "application/octet-stream" }; }
      finally { signal.removeEventListener("abort", abort); }
    });
  }
  async reserve(backupId: string) {
    backupIdSchema.parse(backupId);
    // Failed reservations persist. Retrying requires a new ID and cannot overwrite a snapshot.
    await withOperationBudget(Date.now() + remainingOperationMs(), () => this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: `database/${backupId}.reserved`, Body: backupId, IfNoneMatch: "*" }), { abortSignal: operationSignal() }));
  }
  async writeVerified(key: string, bytes: Uint8Array | string, contentType: string) {
    await withOperationBudget(Date.now() + remainingOperationMs(), () => this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: contentType, IfNoneMatch: "*" }), { abortSignal: operationSignal() }));
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
