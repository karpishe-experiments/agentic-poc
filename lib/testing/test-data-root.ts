import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

export async function createTemporaryDataRoot(prefix = "kids-booklet-test-"): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}
