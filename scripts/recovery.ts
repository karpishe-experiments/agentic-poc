import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getDatabase } from "@/db/client";
import { getServerEnv } from "@/lib/config/env";

const execute = promisify(execFile);
const env = getServerEnv();
if (process.env.RUNNER_ENABLED !== "false") throw new Error("Recovery requires RUNNER_ENABLED=false.");
if (!env.RECOVERY_BUCKET) throw new Error("RECOVERY_BUCKET is required.");
const operation = process.argv[2];
const backupId = process.env.BACKUP_ID || `${env.DEPLOYMENT_ENV}-${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID()}`;
const archive = `/tmp/${backupId}.archive.gz`;
const key = `database/${backupId}.archive.gz`;
const s3 = new S3Client({ region: env.AWS_REGION });
const database = getDatabase();
const configFile = `/tmp/${backupId}.mongodb.json`;
await writeFile(configFile, JSON.stringify({ uri: env.MONGODB_URI }), { mode: 0o600, flag: "wx" });

if (operation === "backup") {
  await execute("mongodump", [`--config=${configFile}`, `--db=${env.MONGODB_DATABASE}`, `--archive=${archive}`, "--gzip"]);
  const bytes = await readFile(archive);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const collections = await database.database.listCollections({}, { nameOnly: true }).toArray();
  const inventory = Object.fromEntries(await Promise.all(collections.map(async ({ name }) => [name, await database.database.collection(name).countDocuments()] as const)));
  const assetDocuments = await database.collections.assets.find({}, { projection: { uri: 1 } }).toArray();
  const assets = await Promise.all(assetDocuments.map(async ({ uri }) => {
    const object = await s3.send(new HeadObjectCommand({ Bucket: env.ASSETS_BUCKET, Key: uri }));
    return { uri, versionId: object.VersionId ?? null, bytes: object.ContentLength ?? null, etag: object.ETag ?? null };
  }));
  const manifest = { schemaVersion: "1", backupId, database: env.MONGODB_DATABASE, environment: env.DEPLOYMENT_ENV, imageDigest: process.env.RELEASE_IMAGE_DIGEST ?? null, sha256, collections: inventory, assets };
  await s3.send(new PutObjectCommand({ Bucket: env.RECOVERY_BUCKET, Key: key, Body: bytes, ContentType: "application/gzip", Metadata: { sha256, database: env.MONGODB_DATABASE, environment: env.DEPLOYMENT_ENV }, IfNoneMatch: "*" }));
  await s3.send(new PutObjectCommand({ Bucket: env.RECOVERY_BUCKET, Key: `database/${backupId}.manifest.json`, Body: JSON.stringify(manifest), ContentType: "application/json", IfNoneMatch: "*" }));
  console.log(JSON.stringify({ backupId, key, bytes: bytes.length, sha256, database: env.MONGODB_DATABASE, collections: inventory, assetCount: assets.length }));
} else if (operation === "restore") {
  if (!process.env.BACKUP_ID || process.env.CONFIRM_DATABASE !== env.MONGODB_DATABASE) throw new Error("Restore requires BACKUP_ID and exact CONFIRM_DATABASE.");
  const object = await s3.send(new GetObjectCommand({ Bucket: env.RECOVERY_BUCKET, Key: key }));
  if (object.Metadata?.database !== env.MONGODB_DATABASE || object.Metadata?.environment !== env.DEPLOYMENT_ENV || !object.Body) throw new Error("Backup metadata does not match this environment.");
  const bytes = await object.Body.transformToByteArray();
  const manifestObject = await s3.send(new GetObjectCommand({ Bucket: env.RECOVERY_BUCKET, Key: `database/${backupId}.manifest.json` }));
  if (!manifestObject.Body) throw new Error("Backup manifest is missing.");
  const manifest = JSON.parse(await manifestObject.Body.transformToString()) as { backupId: string; database: string; environment: string; sha256: string; assets: Array<{ uri: string; versionId: string | null }> };
  if (manifest.backupId !== backupId || manifest.database !== env.MONGODB_DATABASE || manifest.environment !== env.DEPLOYMENT_ENV) throw new Error("Backup manifest does not match this target.");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (object.Metadata.sha256 !== sha256 || manifest.sha256 !== sha256) throw new Error("Backup checksum verification failed.");
  await Promise.all(manifest.assets.map(({ uri, versionId }) => s3.send(new HeadObjectCommand({ Bucket: env.ASSETS_BUCKET, Key: uri, VersionId: versionId ?? undefined }))));
  await writeFile(archive, bytes, { flag: "wx" });
  await execute("mongorestore", [`--config=${configFile}`, `--nsInclude=${env.MONGODB_DATABASE}.*`, `--archive=${archive}`, "--gzip", "--drop"]);
  console.log(JSON.stringify({ restored: true, backupId, database: env.MONGODB_DATABASE, sha256 }));
} else throw new Error("Usage: recovery.ts backup|restore");
await database.close();
