import path from "node:path";
import { copyFile, mkdir } from "node:fs/promises";
import styles from "@/seeds/styles/manifest.json";
import type { MongoDatabaseContext } from "@/db/client";
import type { AssetDocument, StyleCatalogDocument } from "@/db/documents";

const styleAssetIds: Record<string, string> = {
  "soft-watercolor": "00000000-0000-4000-8000-000000000001",
  "cut-paper-collage": "00000000-0000-4000-8000-000000000002",
  "colored-pencil": "00000000-0000-4000-8000-000000000003",
};

async function copySeedAsset(source: string, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}

export async function seedVisualAssets(database: MongoDatabaseContext, dataRoot: string, now = Date.now()): Promise<void> {
  for (const style of styles) {
    const assetId = styleAssetIds[style.id];
    if (!assetId) throw new Error(`No stable asset ID is configured for ${style.id}`);
    const uri = `_seed/styles/${style.file}`;
    await copySeedAsset(path.join(process.cwd(), "seeds", "styles", style.file), path.join(dataRoot, ...uri.split("/")));
    const asset: AssetDocument = { _id: assetId, bookletId: null, kind: "style_preview", uri, mimeType: "image/png", width: 1280, height: 1280, sourceAssetId: null, metadataJson: JSON.stringify({ source: "seed" }), createdAtMs: now };
    const catalog: StyleCatalogDocument = { _id: style.id, name: style.name, description: style.description, previewAssetId: assetId, prompt: style.prompt, provenance: style.provenance, sortOrder: style.sortOrder, createdAtMs: now };
    await database.collections.assets.insertOne(asset);
    await database.collections.style_catalog.insertOne(catalog);
  }
  for (const file of ["Nunito-Variable.ttf", "OFL.txt"]) await copySeedAsset(path.join(process.cwd(), "seeds", "fonts", "nunito", file), path.join(dataRoot, "_seed", "fonts", "nunito", file));
  await database.collections.assets.insertOne({ _id: "00000000-0000-4000-8000-000000000004", bookletId: null, kind: "font", uri: "_seed/fonts/nunito/Nunito-Variable.ttf", mimeType: "font/ttf", width: null, height: null, sourceAssetId: null, metadataJson: JSON.stringify({ family: "Nunito", license: "SIL OFL 1.1", licenseUri: "_seed/fonts/nunito/OFL.txt" }), createdAtMs: now });
}
