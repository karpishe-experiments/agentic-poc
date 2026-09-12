import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { getDatabase } from "@/db/client";
import { createAssetStore } from "@/lib/assets/create-asset-store";
import { getServerEnv } from "@/lib/config/env";
import { verifyMongoStructure } from "@/db/setup";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

if (process.env.RUNNER_ENABLED !== "false") throw new Error("Readiness probes require RUNNER_ENABLED=false.");
const env = getServerEnv();
const database = getDatabase();
const assets = createAssetStore(env);
const probe = `_deployment/probes/${randomUUID()}.txt`;
try {
  await verifyMongoStructure(database);
  const session = database.client.startSession();
  try {
    session.startTransaction();
    const id = `__readiness_${randomUUID()}`;
    await database.collections.deployment_control.insertOne({ _id: id, schemaVersion: "1", environment: id, maintenance: false, reason: null, activeMutations: 0, updatedAtMs: Date.now() }, { session });
    await session.abortTransaction();
  } finally { await session.endSession(); }
  await assets.put(probe, Buffer.from("ready"), "text/plain");
  if (!(await assets.exists(probe)) || Buffer.from(await assets.get(probe)).toString() !== "ready") throw new Error("S3 probe verification failed.");
  if (env.ASSET_STORAGE === "s3" && env.ASSETS_BUCKET) await new S3Client({ region: env.AWS_REGION }).send(new DeleteObjectCommand({ Bucket: env.ASSETS_BUCKET, Key: probe }));
  else await rm(`${env.DATA_ROOT}/${probe}`, { force: true });
  if (process.env.DEPLOYMENT_URL) {
    if (!env.ACCESS_GATE_PASSWORD) throw new Error("ACCESS_GATE_PASSWORD is required for deployed readiness.");
    const authorization = `Basic ${Buffer.from(`booklet:${env.ACCESS_GATE_PASSWORD}`).toString("base64")}`;
    let ready = false;
    for (let attempt = 0; attempt < 12 && !ready; attempt += 1) {
      const response = await fetch(`${process.env.DEPLOYMENT_URL}/api/health/ready`, { headers: { Authorization: authorization } });
      if (response.ok) {
        const body = await response.json() as { status?: string; checks?: { runner?: { started?: boolean; initialized?: boolean; fatalError?: string | null } } };
        ready = body.status === "ready" && Boolean(body.checks?.runner?.started && body.checks.runner.initialized && !body.checks.runner.fatalError);
      }
      if (!ready) await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    if (!ready) throw new Error("The application runner is not initialized and ready.");
  }
  console.log(JSON.stringify({ ready: true, environment: env.DEPLOYMENT_ENV, mongodb: true, s3: true, paidProviderCalls: 0 }));
} finally { await database.close(); }
