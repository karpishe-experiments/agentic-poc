import path from "node:path";
import { readFile } from "node:fs/promises";
import styles from "@/seeds/styles/manifest.json";
import type { MongoDatabaseContext } from "@/db/client";
import type { AssetDocument, StyleCatalogDocument } from "@/db/documents";
import type { AssetStore } from "@/lib/assets/asset-store";
import { FilesystemAssetStore } from "@/lib/assets/filesystem-asset-store";

const styleAssetIds: Record<string, string> = {
  "soft-watercolor": "00000000-0000-4000-8000-000000000001",
  "cut-paper-collage": "00000000-0000-4000-8000-000000000002",
  "colored-pencil": "00000000-0000-4000-8000-000000000003",
};

export async function seedVisualAssets(database: MongoDatabaseContext, destination: string | AssetStore, now = Date.now(), idempotent = false): Promise<void> {
  const store = typeof destination === "string" ? new FilesystemAssetStore(path.resolve(destination)) : destination;
  const put = async (uri: string, source: string, mimeType: string) => {
    if (idempotent && await store.exists(uri)) return;
    await store.put(uri, await readFile(source), mimeType);
  };
  const ensureCompatible = async (collection: { findOne(filter: { _id: string }): Promise<unknown> }, expected: { _id: string }, fields: string[]) => {
    const current = await collection.findOne({ _id: expected._id });
    if (!current) return false;
    const currentRecord = current as Record<string, unknown>;
    const expectedRecord = expected as unknown as Record<string, unknown>;
    if (fields.some((field) => JSON.stringify(currentRecord[field]) !== JSON.stringify(expectedRecord[field]))) throw new Error(`Seed record ${expected._id} is incompatible with the deployment seed manifest.`);
    return true;
  };
  for (const style of styles) {
    const assetId = styleAssetIds[style.id];
    if (!assetId) throw new Error(`No stable asset ID is configured for ${style.id}`);
    const uri = `_seed/styles/${style.file}`;
    await put(uri, path.join(process.cwd(), "seeds", "styles", style.file), "image/png");
    const asset: AssetDocument = { _id: assetId, bookletId: null, kind: "style_preview", uri, mimeType: "image/png", width: 1280, height: 1280, sourceAssetId: null, metadataJson: JSON.stringify({ source: "seed" }), createdAtMs: now };
    const catalog: StyleCatalogDocument = { _id: style.id, name: style.name, description: style.description, previewAssetId: assetId, prompt: style.prompt, provenance: style.provenance, sortOrder: style.sortOrder, createdAtMs: now };
    if (idempotent) {
      if (!await ensureCompatible(database.collections.assets, asset, ["kind", "uri", "mimeType", "width", "height", "bookletId"])) await database.collections.assets.insertOne(asset);
      if (!await ensureCompatible(database.collections.style_catalog, catalog, ["name", "description", "previewAssetId", "prompt", "provenance", "sortOrder"])) await database.collections.style_catalog.insertOne(catalog);
    } else { await database.collections.assets.insertOne(asset); await database.collections.style_catalog.insertOne(catalog); }
  }
  await put("_seed/fonts/nunito/Nunito-Variable.ttf", path.join(process.cwd(), "seeds", "fonts", "nunito", "Nunito-Variable.ttf"), "font/ttf");
  await put("_seed/fonts/nunito/OFL.txt", path.join(process.cwd(), "seeds", "fonts", "nunito", "OFL.txt"), "text/plain");
  const font: AssetDocument = { _id: "00000000-0000-4000-8000-000000000004", bookletId: null, kind: "font", uri: "_seed/fonts/nunito/Nunito-Variable.ttf", mimeType: "font/ttf", width: null, height: null, sourceAssetId: null, metadataJson: JSON.stringify({ family: "Nunito", license: "SIL OFL 1.1", licenseUri: "_seed/fonts/nunito/OFL.txt" }), createdAtMs: now };
  if (idempotent) { if (!await ensureCompatible(database.collections.assets, font, ["kind", "uri", "mimeType", "bookletId"])) await database.collections.assets.insertOne(font); }
  else await database.collections.assets.insertOne(font);
}
