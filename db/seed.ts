import path from "node:path";
import { fileURLToPath } from "node:url";
import { access, copyFile, mkdir } from "node:fs/promises";
import { config } from "dotenv";
import styles from "@/seeds/styles/manifest.json";
import { getDatabase, type MongoDatabaseContext } from "@/db/client";
import type { AssetDocument, StyleCatalogDocument } from "@/db/documents";
import { getServerEnv, resolveDataRoot } from "@/lib/config/env";

const styleAssetIds: Record<string, string> = { "soft-watercolor": "00000000-0000-4000-8000-000000000001", "cut-paper-collage": "00000000-0000-4000-8000-000000000002", "colored-pencil": "00000000-0000-4000-8000-000000000003" };
const canonical = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

async function copyIfMissing(source: string, target: string): Promise<void> { try { await access(target); } catch { await mkdir(path.dirname(target), { recursive: true }); await copyFile(source, target); } }
async function insertOrVerify<T extends { _id: string; createdAtMs: number }>(collection: { findOne(filter: { _id: string }): Promise<T | null>; insertOne(document: T): Promise<unknown> }, desired: T): Promise<void> {
  const existing = await collection.findOne({ _id: desired._id }); if (!existing) { await collection.insertOne(desired); return; }
  const { createdAtMs: existingTime, ...existingSemantic } = existing; const { createdAtMs: desiredTime, ...desiredSemantic } = desired;
  void existingTime; void desiredTime;
  if (canonical(existingSemantic) !== canonical(desiredSemantic)) throw new Error(`Seed record ${desired._id} conflicts with bundled metadata.`);
}

export async function seedVisualAssets(database: MongoDatabaseContext, dataRoot: string, now = Date.now()): Promise<void> {
  for (const style of styles) {
    const assetId = styleAssetIds[style.id]; if (!assetId) throw new Error(`No stable asset ID is configured for ${style.id}`);
    const uri = `_seed/styles/${style.file}`; await copyIfMissing(path.join(process.cwd(), "seeds", "styles", style.file), path.join(dataRoot, ...uri.split("/")));
    const asset: AssetDocument = { _id: assetId, bookletId: null, kind: "style_preview", uri, mimeType: "image/png", width: 1280, height: 1280, sourceAssetId: null, metadataJson: JSON.stringify({ source: "seed" }), createdAtMs: now };
    const catalog: StyleCatalogDocument = { _id: style.id, name: style.name, description: style.description, previewAssetId: assetId, prompt: style.prompt, provenance: style.provenance, sortOrder: style.sortOrder, createdAtMs: now };
    await insertOrVerify<AssetDocument>(database.collections.assets, asset); await insertOrVerify<StyleCatalogDocument>(database.collections.style_catalog, catalog);
  }
  for (const file of ["Nunito-Variable.ttf", "OFL.txt"]) await copyIfMissing(path.join(process.cwd(), "seeds", "fonts", "nunito", file), path.join(dataRoot, "_seed", "fonts", "nunito", file));
  await insertOrVerify<AssetDocument>(database.collections.assets, { _id: "00000000-0000-4000-8000-000000000004", bookletId: null, kind: "font", uri: "_seed/fonts/nunito/Nunito-Variable.ttf", mimeType: "font/ttf", width: null, height: null, sourceAssetId: null, metadataJson: JSON.stringify({ family: "Nunito", license: "SIL OFL 1.1", licenseUri: "_seed/fonts/nunito/OFL.txt" }), createdAtMs: now });
}

async function main() { config({ path: ".env.local" }); const env = getServerEnv(); const database = getDatabase(); try { await seedVisualAssets(database, resolveDataRoot(env)); console.log(`Seeded ${styles.length} visual styles and bundled Nunito assets.`); } finally { await database.close(); } }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
