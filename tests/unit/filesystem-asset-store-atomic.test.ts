import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FilesystemAssetStore } from "@/lib/assets/filesystem-asset-store";

const fault = vi.hoisted(() => ({ partialWrite: false }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return { ...original, writeFile: async (...args: Parameters<typeof original.writeFile>) => {
    if (fault.partialWrite) {
      fault.partialWrite = false;
      await original.writeFile(args[0], new Uint8Array([1]), args[2]);
      throw new Error("Interrupted write");
    }
    return original.writeFile(...args);
  } };
});
const roots: string[] = [];
afterEach(async () => { fault.partialWrite = false; await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("does not publish partial bytes and permits the same request to recover", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "booklet-atomic-assets-")); roots.push(root);
  const store = new FilesystemAssetStore(root);
  const bytes = new Uint8Array([1, 2, 3]);
  fault.partialWrite = true;
  await expect(store.put("image.png", bytes, "image/png")).rejects.toThrow("Interrupted write");
  expect(await store.exists("image.png")).toBe(false);
  expect(await readdir(root)).toEqual([]);
  await store.put("image.png", bytes, "image/png");
  expect(Uint8Array.from(await store.get("image.png"))).toEqual(bytes);
});

it("publishes one winner without overwriting an existing asset", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "booklet-atomic-assets-")); roots.push(root);
  const store = new FilesystemAssetStore(root);
  const results = await Promise.allSettled([store.put("image.png", new Uint8Array([1]), "image/png"), store.put("image.png", new Uint8Array([2]), "image/png")]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(await readdir(root)).toEqual(["image.png"]);
  const saved = await store.get("image.png");
  await expect(store.put("image.png", new Uint8Array([3]), "image/png")).rejects.toMatchObject({ code: "EEXIST" });
  expect(await store.get("image.png")).toEqual(saved);
});
