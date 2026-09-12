import { createHash } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { HeadObjectCommand, PutObjectCommand, S3Client, type HeadObjectCommandOutput } from "@aws-sdk/client-s3";
import { createMongoDatabase } from "@/db/client";
import { normalizeAssetUri } from "@/lib/assets/asset-uri";

const mode = process.argv[2];
if (!(["inventory", "copy", "verify"] as const).includes(mode as never)) throw new Error("Usage: migrate-assets-to-s3.ts inventory|copy|verify");
if (process.env.DEPLOYMENT_ENV !== "_staging" || process.env.MONGODB_DATABASE !== "kids_booklet") throw new Error("Asset migration is restricted to the staging kids_booklet database.");
const assetsBucket = process.env.ASSETS_BUCKET;
const recoveryBucket = process.env.RECOVERY_BUCKET;
const mongoUri = process.env.MONGODB_URI;
if (!assetsBucket || !recoveryBucket || !mongoUri) throw new Error("MONGODB_URI, ASSETS_BUCKET, and RECOVERY_BUCKET are required.");
const client = new S3Client({ region: process.env.AWS_REGION ?? "eu-west-1" });
const database = createMongoDatabase({ uri: mongoUri, databaseName: "kids_booklet" });
const sourceRoot = path.resolve(process.cwd(), process.env.DATA_ROOT ?? "./data/assets");
const manifest: Array<{ uri: string; bytes: number; sha256: string; status: string }> = [];

try {
  const records = await database.collections.assets.find({}, { projection: { uri: 1 } }).sort({ uri: 1 }).toArray();
  const uris = new Set(records.map(({ uri }) => normalizeAssetUri(uri)));
  uris.add("_seed/fonts/nunito/OFL.txt");
  for (const uri of [...uris].sort()) {
    const bytes = await readFile(path.join(sourceRoot, ...uri.split("/")));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    let remote: HeadObjectCommandOutput | undefined;
    try { remote = await client.send(new HeadObjectCommand({ Bucket: assetsBucket, Key: uri })); }
    catch (error) {
      if (!error || typeof error !== "object" || !("$metadata" in error) || (error.$metadata as { httpStatusCode?: number }).httpStatusCode !== 404) throw error;
    }
    const matches = remote?.Metadata?.sha256 === sha256 && remote.ContentLength === bytes.byteLength;
    if (remote && !matches) throw new Error(`Destination object conflicts with ${uri}.`);
    if (mode === "copy" && !remote) await client.send(new PutObjectCommand({ Bucket: assetsBucket, Key: uri, Body: bytes, Metadata: { sha256 }, IfNoneMatch: "*" }));
    if (mode === "verify" && !matches) throw new Error(`Destination object is missing or unverified: ${uri}.`);
    manifest.push({ uri, bytes: bytes.byteLength, sha256, status: remote ? "verified" : mode === "copy" ? "copied" : "pending" });
  }
  const result = { schemaVersion: "1", mode, bucket: assetsBucket, database: "kids_booklet", verifiedAt: mode === "verify" ? new Date().toISOString() : null, assets: manifest };
  if (mode === "verify") {
    await client.send(new PutObjectCommand({ Bucket: recoveryBucket, Key: "migration/verified.json", Body: JSON.stringify(result), ContentType: "application/json" }));
  }
  console.log(JSON.stringify(result, null, 2));
} finally { await database.close(); }
