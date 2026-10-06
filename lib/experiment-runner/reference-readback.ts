import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";

// Dify 1.17.1 file_factory/builders.py emits reference, not the graph File.id.
// Decode only the canonical runtime reference; never fall back to a URL or id.
export function verifyReferenceReadback(raw: unknown, expectedIds: string[]): boolean {
  const expected = z.array(opaqueIdSchema).max(15).safeParse(expectedIds);
  const files = z.array(z.object({ type: z.literal("image"), transfer_method: z.literal("local_file"),
    reference: z.string().max(2048) })).max(15).safeParse(raw);
  if (!expected.success || new Set(expected.data).size !== expected.data.length || !files.success || files.data.length !== expected.data.length) return false;
  try {
    const ids = files.data.map((file) => {
      const prefix = "dify-file-ref:";
      if (!file.reference.startsWith(prefix)) throw new Error("Noncanonical reference");
      const encoded = file.reference.slice(prefix.length);
      if (!/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) throw new Error("Invalid reference encoding");
      const payload = z.object({ record_id: opaqueIdSchema }).parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
      return payload.record_id;
    });
    return ids.every((id, index) => id === expected.data[index]);
  } catch { return false; }
}
