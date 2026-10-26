import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { createObjectStoreClient } from "@/lib/assets/create-object-store-client";
import { normalizeAssetUri } from "@/lib/assets/asset-uri";
import { getDatabase } from "@/db/client";
import { getServerEnv } from "@/lib/config/env";
import { backupIdSchema, digest, parseManifest, RecoveryStorage } from "./recovery-storage";
import { operationSignal, remainingOperationMs, withOperationBudget } from "@/lib/operations/budget";

import { RecoveryDiagnostics } from "./recovery-diagnostics";

const diagnostics = new RecoveryDiagnostics();
const execute = promisify(execFile);
async function executeMongo(tool: "mongodump" | "mongorestore", args: string[]) {
  try { await execute(tool, args, { timeout: remainingOperationMs(tool === "mongodump" ? 1_800_000 : 3_600_000), signal: operationSignal(), killSignal: "SIGKILL", maxBuffer: 1024 * 1024 }); }
  catch { throw new Error(`${tool} failed; keep maintenance enabled and check database permissions, connectivity and archive validity. Tool output is suppressed because it can contain credentials.`); }
}
// Capability discovery performs no environment, database or storage access.
if (process.argv[2] === "capabilities") {
  console.log(JSON.stringify({ contract: "booklet-backup-helper-v1", manifestVersion: "1", dataContractVersion: "booklet-data-v1", initializationRequired: false, migrationRequired: false }));
  process.exit(0);
}
const env = getServerEnv();
if (env.RUNNER_ENABLED !== "false") throw new Error("Recovery requires RUNNER_ENABLED=false.");
if (!env.RECOVERY_BUCKET || !env.ASSETS_BUCKET || env.DEPLOYMENT_ENV === "local") throw new Error("Recovery requires deployed environment and asset/recovery buckets.");
const assetsBucket = env.ASSETS_BUCKET;
const operation = process.argv[2];
if (operation !== "backup" && operation !== "restore" && operation !== "verify" && operation !== "inspect") throw new Error("Usage: recovery.ts backup|restore|verify|inspect|capabilities");
if (operation === "restore" && (!process.env.BACKUP_ID || process.env.CONFIRM_DATABASE !== env.MONGODB_DATABASE)) throw new Error("Restore requires BACKUP_ID and exact CONFIRM_DATABASE.");
if ((operation === "verify" || operation === "inspect") && (!process.env.BACKUP_ID || !process.env.RELEASE_IMAGE_DIGEST)) throw new Error("Verification requires exact BACKUP_ID and selected RELEASE_IMAGE_DIGEST.");
const backupId = backupIdSchema.parse(process.env.BACKUP_ID || `${env.DEPLOYMENT_ENV}-${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID()}`);
const key = `database/${backupId}.archive.gz`;
const s3 = createObjectStoreClient(env);
const storage = new RecoveryStorage(s3, env.RECOVERY_BUCKET, diagnostics);
if (operation === "verify" || operation === "inspect") {
  // Verify the retained snapshot without opening MongoDB, writing temporary
  // files, reserving a snapshot, restoring data, or changing admission.
  try {
    const manifest = await withOperationBudget(Date.now() + 1_800_000, () => operation === "inspect" ? storage.inspectCompletedBackup(
      backupId, env.MONGODB_DATABASE, env.DEPLOYMENT_ENV, process.env.RELEASE_IMAGE_DIGEST!,
    ) : storage.verifiedCompletedBackup(
      backupId, env.MONGODB_DATABASE, env.DEPLOYMENT_ENV, process.env.RELEASE_IMAGE_DIGEST!,
    ));
    console.log(JSON.stringify(manifest ? { verified: true, backupId, database: manifest.database,
      environment: manifest.environment, imageDigest: manifest.imageDigest, assetCount: manifest.assets.length } : { complete: false, backupId }));
  } finally { s3.destroy(); }
} else {
const database = getDatabase();
const workspace = await mkdtemp(join(tmpdir(), "booklet-recovery-"));
const archive = join(workspace, "database.archive.gz");
const configFile = join(workspace, "mongodb.json");
try {
  await withOperationBudget(Date.now() + (operation === "backup" ? 1_800_000 : 3_600_000), async () => {
  await chmod(workspace, 0o700);
  await writeFile(configFile, JSON.stringify({ uri: env.MONGODB_URI }), { mode: 0o600, flag: "wx" });
  await writeFile(archive, "", { mode: 0o600, flag: "wx" });
  if (operation === "backup") {
    await storage.reserve(backupId);
    await diagnostics.measure({ phase: "database_dump", action: "phase", category: "archive" }, () => executeMongo("mongodump", [`--config=${configFile}`, `--db=${env.MONGODB_DATABASE}`, `--archive=${archive}`, "--gzip"]));
    const bytes = await readFile(archive);
    const sha256 = digest(bytes);
    const { inventory, documents } = await diagnostics.measure({ phase: "inventory", action: "phase" }, async () => {
      const collections = await database.database.listCollections({}, { nameOnly: true }).toArray();
      const inventory = Object.fromEntries(await Promise.all(collections.map(async ({ name }) => [name, await database.database.collection(name).countDocuments()] as const)));
      const documents = await database.collections.assets.find({}, { projection: { uri: 1 } }).toArray();
      return { inventory, documents };
    });
    const assetKeys = new Set(documents.map(({ uri }) => normalizeAssetUri(uri)));
    if (process.env.BACKUP_ALL_ASSETS === "true") {
      if (env.DEPLOYMENT_ENV !== "_staging" || env.ASSETS_BUCKET !== "kids-booklet-staging-assets") throw new Error("Full-bucket backup is limited to the approved staging target.");
      let token: string | undefined;
      do {
        const page = await s3.send(new ListObjectsV2Command({ Bucket: env.ASSETS_BUCKET, ContinuationToken: token }), { abortSignal: operationSignal() });
        for (const { Key } of page.Contents ?? []) if (Key) assetKeys.add(normalizeAssetUri(Key));
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    }
    const assets = [];
    for (const uri of assetKeys) assets.push(await storage.snapshot(backupId, uri, assetsBucket, assets.length + 1));
    const manifest = { schemaVersion: "1", backupId, database: env.MONGODB_DATABASE, environment: env.DEPLOYMENT_ENV, imageDigest: process.env.RELEASE_IMAGE_DIGEST ?? null, sha256, collections: inventory, assets };
    parseManifest(manifest, backupId, env.MONGODB_DATABASE, env.DEPLOYMENT_ENV);
    const manifestBytes = JSON.stringify(manifest);
    await storage.writeVerified(key, bytes, "application/gzip", { phase: "archive_upload", category: "archive" });
    await storage.writeVerified(`database/${backupId}.manifest.json`, manifestBytes, "application/json", { phase: "manifest", category: "manifest" });
    await storage.writeVerified(`database/${backupId}.complete`, digest(manifestBytes), "text/plain", { phase: "completion_marker", category: "completion_marker" });
    console.log(JSON.stringify({ backupId, key, bytes: bytes.length, sha256, database: env.MONGODB_DATABASE, collections: inventory, assetCount: assets.length }));
  } else {
    const rawManifest = (await storage.read(`database/${backupId}.manifest.json`)).bytes;
    const complete = (await storage.read(`database/${backupId}.complete`)).bytes;
    if (Buffer.from(complete).toString() !== digest(rawManifest)) throw new Error("Backup completion marker does not match manifest.");
    const manifest = parseManifest(JSON.parse(Buffer.from(rawManifest).toString()), backupId, env.MONGODB_DATABASE, env.DEPLOYMENT_ENV);
    const bytes = (await storage.read(key)).bytes;
    if (digest(bytes) !== manifest.sha256) throw new Error("Backup archive checksum verification failed.");
    await writeFile(archive, bytes, { mode: 0o600 });
    // Verify every object before touching the destination. Local filenames never contain object keys.
    for (const [index, asset] of manifest.assets.entries()) await writeFile(join(workspace, `asset-${index}`), await storage.verifiedAsset(asset), { mode: 0o600, flag: "wx" });
    await executeMongo("mongorestore", [`--config=${configFile}`, `--nsInclude=${env.MONGODB_DATABASE}.*`, `--archive=${archive}`, "--gzip", "--dryRun"]);
    for (const [index, asset] of manifest.assets.entries()) {
      const body = await readFile(join(workspace, `asset-${index}`));
      await s3.send(new PutObjectCommand({ Bucket: env.ASSETS_BUCKET, Key: asset.uri, Body: body, ContentType: asset.contentType }), { abortSignal: operationSignal() });
      if (digest((await storage.read(asset.uri, env.ASSETS_BUCKET)).bytes) !== asset.sha256) throw new Error("Restored asset checksum verification failed; keep maintenance enabled.");
    }
    // --drop removes only collections present in the archive. Drop the selected
    // database first so collections created after this backup cannot survive.
    await database.database.dropDatabase();
    await executeMongo("mongorestore", [`--config=${configFile}`, `--nsInclude=${env.MONGODB_DATABASE}.*`, `--archive=${archive}`, "--gzip", "--stopOnError"]);
    const restoredCollections = (await database.database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name).sort();
    if (JSON.stringify(restoredCollections) !== JSON.stringify(Object.keys(manifest.collections).sort())) throw new Error("Restored collection inventory mismatch; keep maintenance enabled.");
    for (const [name, count] of Object.entries(manifest.collections)) {
      if (await database.database.collection(name).countDocuments() !== count) throw new Error("Restored collection inventory mismatch; keep maintenance enabled.");
    }
    console.log(JSON.stringify({ restored: true, backupId, database: env.MONGODB_DATABASE, sha256: manifest.sha256 }));
  }
  });
} finally {
  try { await rm(workspace, { recursive: true, force: true }); }
  finally { await database.close(); s3.destroy(); }
}
}
