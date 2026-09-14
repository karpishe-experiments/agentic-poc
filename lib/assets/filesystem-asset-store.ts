import path from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import type { AssetStore, StoredAsset } from "@/lib/assets/asset-store";
import { normalizeAssetUri } from "@/lib/assets/asset-uri";

function normalizeUri(uri: string): string {
  return normalizeAssetUri(uri);
}

export class FilesystemAssetStore implements AssetStore {
  public constructor(private readonly dataRoot: string) {}

  private resolve(uri: string): string {
    const normalized = normalizeUri(uri);
    const target = path.resolve(this.dataRoot, ...normalized.split("/"));
    const rootWithSeparator = `${this.dataRoot}${path.sep}`;
    if (!target.startsWith(rootWithSeparator)) {
      throw new Error("Asset URI resolves outside DATA_ROOT");
    }
    return target;
  }

  public async put(uri: string, content: Uint8Array, mimeType: string): Promise<StoredAsset> {
    const target = this.resolve(uri);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, { flag: "wx" });
    return { uri: normalizeUri(uri), mimeType, byteLength: content.byteLength };
  }

  public async get(uri: string): Promise<Uint8Array> {
    return readFile(this.resolve(uri));
  }

  public async exists(uri: string): Promise<boolean> {
    try {
      await access(this.resolve(uri));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
}
