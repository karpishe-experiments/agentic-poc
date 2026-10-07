import { createHash } from "node:crypto";
import type { AssetStore } from "@/lib/assets/asset-store";

// Distinguish unreadable storage from bytes that contradict saved evidence.
export class ImageEvidenceMismatch extends Error {}

// Create inside the transaction callback, never outside withMongoTransaction.
// A retry, later phase or later request must build new evidence from storage.
export function createVerificationAttempt(store: AssetStore) {
  const bytes = new Map<string, Uint8Array>();
  const checked = new Set<string>();
  return {
    async once(key: string, work: () => Promise<unknown>) {
      if (checked.has(key)) return;
      await work();
      checked.add(key);
    },
    async read(evidence: { assetId?: string; uri: string; sha256: string; byteLength: number }) {
      const key = JSON.stringify([evidence.assetId ?? evidence.uri, evidence.uri, evidence.sha256]);
      let value = bytes.get(key);
      if (!value) {
        value = await store.get(evidence.uri);
        if (createHash("sha256").update(value).digest("hex") !== evidence.sha256) throw new ImageEvidenceMismatch("Image digest differs");
        bytes.set(key, Uint8Array.from(value));
      }
      // Every consumer still checks its own expected metadata.
      if (value.byteLength !== evidence.byteLength) throw new ImageEvidenceMismatch("Image length differs");
      return Uint8Array.from(value);
    },
  };
}
export type VerificationAttempt = ReturnType<typeof createVerificationAttempt>;
