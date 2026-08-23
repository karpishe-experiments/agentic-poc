import path from "node:path";
import { rm } from "node:fs/promises";
import type { MongoDatabaseContext } from "@/db/client";
import { seedDefaultAgents, setupMongoStructure } from "@/db/setup";
import { seedVisualAssets } from "@/db/seed";
import { verifyMongoData, type MongoVerification } from "@/db/verify";

export function assertResetDataRoot(dataRoot: string): void {
  const workspace = path.resolve(process.cwd());
  const resolved = path.resolve(dataRoot);
  const relative = path.relative(workspace, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("DATA_ROOT must be a non-workspace descendant before db:reset can remove it.");
}

export async function resetMongoData(context: MongoDatabaseContext, dataRoot: string): Promise<MongoVerification> {
  assertResetDataRoot(dataRoot);
  await context.database.dropDatabase();
  await rm(dataRoot, { recursive: true, force: true });
  await setupMongoStructure(context);
  await seedDefaultAgents(context);
  await seedVisualAssets(context, dataRoot);
  const verification = await verifyMongoData(context, dataRoot);
  if (verification.unresolvedAssetUris.length) throw new Error(`Reset left unresolved assets: ${verification.unresolvedAssetUris.join(", ")}`);
  return verification;
}
