import path from "node:path";
import { access, copyFile, mkdir } from "node:fs/promises";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import styles from "@/seeds/styles/manifest.json";
import { createDatabase } from "@/db/client";
import { assets, styleCatalog } from "@/db/schema";
import { getServerEnv, resolveDataRoot } from "@/lib/config/env";

config({ path: ".env.local" });

const now = Date.now();
const env = getServerEnv();
const dataRoot = resolveDataRoot(env);
const database = createDatabase();
const styleAssetIds: Record<string, string> = {
  "soft-watercolor": "00000000-0000-4000-8000-000000000001",
  "cut-paper-collage": "00000000-0000-4000-8000-000000000002",
  "colored-pencil": "00000000-0000-4000-8000-000000000003",
};

async function copyIfMissing(source: string, target: string): Promise<void> {
  try {
    await access(target);
  } catch {
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }
}

for (const style of styles) {
  const assetId = styleAssetIds[style.id];
  if (!assetId) throw new Error(`No stable asset ID is configured for ${style.id}`);
  const uri = `_seed/styles/${style.file}`;
  await copyIfMissing(path.join(process.cwd(), "seeds", "styles", style.file), path.join(dataRoot, ...uri.split("/")));

  await database.insert(assets).values({
    id: assetId,
    bookletId: null,
    kind: "style_preview",
    uri,
    mimeType: "image/png",
    width: 1280,
    height: 1280,
    sourceAssetId: null,
    metadataJson: JSON.stringify({ source: "seed" }),
    createdAtMs: now,
  }).onConflictDoNothing();

  await database.insert(styleCatalog).values({
    id: style.id,
    name: style.name,
    description: style.description,
    previewAssetId: assetId,
    prompt: style.prompt,
    provenance: style.provenance,
    sortOrder: style.sortOrder,
    createdAtMs: now,
  }).onConflictDoNothing();

  const seeded = await database.select({ id: styleCatalog.id })
    .from(styleCatalog)
    .where(and(eq(styleCatalog.id, style.id), eq(styleCatalog.previewAssetId, assetId)));
  if (seeded.length !== 1) throw new Error(`Could not verify seeded style ${style.id}`);
}

for (const file of ["Nunito-Variable.ttf", "OFL.txt"]) {
  await copyIfMissing(
    path.join(process.cwd(), "seeds", "fonts", "nunito", file),
    path.join(dataRoot, "_seed", "fonts", "nunito", file),
  );
}

await database.insert(assets).values({
  id: "00000000-0000-4000-8000-000000000004",
  bookletId: null,
  kind: "font",
  uri: "_seed/fonts/nunito/Nunito-Variable.ttf",
  mimeType: "font/ttf",
  width: null,
  height: null,
  sourceAssetId: null,
  metadataJson: JSON.stringify({ family: "Nunito", license: "SIL OFL 1.1", licenseUri: "_seed/fonts/nunito/OFL.txt" }),
  createdAtMs: now,
}).onConflictDoNothing();

const fontSeed = await database.select({ id: assets.id })
  .from(assets)
  .where(eq(assets.id, "00000000-0000-4000-8000-000000000004"));
if (fontSeed.length !== 1) throw new Error("Could not verify seeded Nunito font metadata");

console.log(`Seeded ${styles.length} visual styles and bundled Nunito assets.`);
