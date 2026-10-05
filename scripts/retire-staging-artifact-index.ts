import { getDatabase } from "@/db/client";
import { verifyExperimentMaintenanceIdle, verifyStoppedStagingMaintenance } from "@/db/experiment-maintenance";
import { inspectArtifactIndexRetirement, retireLegacyArtifactIndex } from "@/db/setup";
import { createObjectStoreClient } from "@/lib/assets/create-object-store-client";
import { getServerEnv } from "@/lib/config/env";
import { RecoveryStorage } from "./recovery-storage";

const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && !["--preview", "--apply", "--verify-backup"].includes(args[0]))) {
  throw new Error("Usage: retire-staging-artifact-index.ts [--preview|--apply|--verify-backup]");
}
const apply = args[0] === "--apply";
const verifyBackup = args[0] === "--verify-backup";
const env = getServerEnv();
if (process.env.RUNNER_ENABLED !== "false" || env.DEPLOYMENT_ENV !== "_staging"
  || env.MONGODB_DATABASE !== "kids_booklet" || env.ASSETS_BUCKET !== "kids-booklet-staging-assets") {
  throw new Error("Index retirement requires the exact staging target and disabled dispatch.");
}
if ((apply || verifyBackup) && (process.env.CONFIRM_DATABASE !== "kids_booklet" || !env.RECOVERY_BUCKET || !process.env.BACKUP_ID || !process.env.RELEASE_IMAGE_DIGEST)) {
  throw new Error("Index retirement requires exact database confirmation, recovery bucket, completed backup ID and selected image digest.");
}
const database = getDatabase();
try {
  await verifyExperimentMaintenanceIdle(database);
  const catalog = await inspectArtifactIndexRetirement(database);
  if (!apply && !verifyBackup) {
    console.log(`result: ${JSON.stringify({ preview: true, environment: "staging", database: env.MONGODB_DATABASE, index: "artifacts_booklet_type_unique", outcome: catalog === "ready" ? "would remove" : "already absent" })}`);
  } else {
    await verifyStoppedStagingMaintenance(database);
    const s3 = createObjectStoreClient(env);
    try {
      await new RecoveryStorage(s3, env.RECOVERY_BUCKET!).verifiedCompletedBackup(process.env.BACKUP_ID!, env.MONGODB_DATABASE, env.DEPLOYMENT_ENV, process.env.RELEASE_IMAGE_DIGEST!);
      // Inspect again after backup verification. Unknown work never causes replay.
      await verifyStoppedStagingMaintenance(database);
      const outcome = apply ? await retireLegacyArtifactIndex(database) : "backup verified";
      console.log(`result: ${JSON.stringify({ preview: !apply, environment: "staging", database: env.MONGODB_DATABASE, index: "artifacts_booklet_type_unique", outcome, backupId: process.env.BACKUP_ID })}`);
    } finally { s3.destroy(); }
  }
} finally { await database.close(); }
