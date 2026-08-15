import "server-only";

export type StoredAsset = {
  uri: string;
  mimeType: string;
  byteLength: number;
};

export interface AssetStore {
  put(uri: string, content: Uint8Array, mimeType: string): Promise<StoredAsset>;
  get(uri: string): Promise<Uint8Array>;
  exists(uri: string): Promise<boolean>;
}
