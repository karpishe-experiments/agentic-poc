import { describe, expect, it } from "vitest";
import { GetObjectCommand, PutObjectCommand, NoSuchKey, type S3Client } from "@aws-sdk/client-s3";
import { backupIdSchema, digest, parseManifest, RecoveryStorage } from "@/scripts/recovery-storage";

function fixture() {
  const objects = new Map<string, Uint8Array>();
  const writes: string[] = [];
  const client = { async send(command: GetObjectCommand | PutObjectCommand) {
    const key = `${command.input.Bucket}/${command.input.Key}`;
    if (command instanceof PutObjectCommand) {
      if (command.input.IfNoneMatch === "*" && objects.has(key)) throw new Error("PreconditionFailed");
      objects.set(key, Buffer.from(command.input.Body as string | Uint8Array)); writes.push(key);
      return {};
    }
    const bytes = objects.get(key);
    if (!bytes) throw new Error("NoSuchKey");
    return { Body: { transformToByteArray: async () => bytes }, ContentType: "image/png" };
  } } as unknown as S3Client;
  return { objects, writes, storage: new RecoveryStorage(client, "recovery") };
}

describe("immutable recovery snapshots", () => {
  it("reserves an ID exactly once and leaves a previous asset unchanged on retry", async () => {
    const { storage, objects, writes } = fixture();
    objects.set("assets/book/page.png", Buffer.from("original"));
    await storage.reserve("backup-1");
    const asset = await storage.snapshot("backup-1", "book/page.png", "assets");
    objects.set("assets/book/page.png", Buffer.from("changed"));
    await expect(storage.reserve("backup-1")).rejects.toThrow("PreconditionFailed");
    await expect(storage.snapshot("backup-1", "book/page.png", "assets")).rejects.toThrow("PreconditionFailed");
    expect(Buffer.from(await storage.verifiedAsset(asset)).toString()).toBe("original");
    expect(writes).toEqual(["recovery/database/backup-1.reserved", "recovery/assets/backup-1/book/page.png"]);
  });
  it("checks actual bytes rather than trusting object metadata", async () => {
    const { storage, objects } = fixture();
    objects.set("assets/page.png", Buffer.from("original"));
    const asset = await storage.snapshot("b", "page.png", "assets");
    objects.set("recovery/assets/b/page.png", Buffer.from("tampered"));
    await expect(storage.verifiedAsset(asset)).rejects.toThrow("checksum");
  });
  it("does not swallow missing or permission failures", async () => {
    await expect(fixture().storage.snapshot("b", "missing.png", "assets")).rejects.toThrow("NoSuchKey");
    const client = { send: async () => { throw new Error("AccessDenied"); } } as unknown as S3Client;
    await expect(new RecoveryStorage(client, "recovery").read("key")).rejects.toThrow("AccessDenied");
  });
});

describe("restore manifest boundary", () => {
  const manifest = { schemaVersion: "1", backupId: "b", database: "kids_booklet", environment: "_staging", imageDigest: null, sha256: digest("archive"), collections: { assets: 1 }, assets: [{ uri: "book/page.png", recoveryKey: "assets/b/book/page.png", sha256: digest("asset"), bytes: 5, contentType: "image/png" }] };
  const parse = (value: unknown) => parseManifest(value, "b", "kids_booklet", "_staging");
  it("accepts a complete matching manifest", () => expect(parse(manifest)).toEqual(manifest));
  it("rejects an unknown schema", () => expect(() => parse({ ...manifest, schemaVersion: "2" })).toThrow("manifest schema"));
  it("rejects cross-environment manifests", () => expect(() => parse({ ...manifest, environment: "_prod" })).toThrow("target"));
  it.each(["../page.png", "/page.png", "book\\page.png"])("rejects unsafe or noncanonical URI %s", (uri) => expect(() => parse({ ...manifest, assets: [{ ...manifest.assets[0], uri }] })).toThrow());
  it("rejects references outside the selected backup", () => expect(() => parse({ ...manifest, assets: [{ ...manifest.assets[0], recoveryKey: "assets/other/book/page.png" }] })).toThrow("out-of-scope"));
  it("rejects duplicate objects", () => expect(() => parse({ ...manifest, assets: [manifest.assets[0], manifest.assets[0]] })).toThrow("duplicate"));
  it.each(["../id", "bad/id", "", "a.b"])("rejects unsafe backup ID %s", (id) => expect(() => backupIdSchema.parse(id)).toThrow());
});

describe("completed maintenance backup verification", () => {
  const imageDigest = `sha256:${"a".repeat(64)}`;
  function completed() {
    const state = fixture();
    const manifest = { schemaVersion: "1", backupId: "b", database: "kids_booklet", environment: "_staging", imageDigest, sha256: digest("archive"), collections: { assets: 1 }, assets: [{ uri: "page.png", recoveryKey: "assets/b/page.png", sha256: digest("asset"), bytes: 5, contentType: "image/png" }] };
    const raw = JSON.stringify(manifest);
    state.objects.set("recovery/database/b.manifest.json", Buffer.from(raw));
    state.objects.set("recovery/database/b.complete", Buffer.from(digest(raw)));
    state.objects.set("recovery/database/b.archive.gz", Buffer.from("archive"));
    state.objects.set("recovery/assets/b/page.png", Buffer.from("asset"));
    return { ...state, manifest };
  }
  it("verifies all saved bytes without writes or reservations", async () => {
    const { storage, writes, manifest } = completed();
    expect(await storage.verifiedCompletedBackup("b", "kids_booklet", "_staging", imageDigest)).toEqual(manifest);
    expect(writes).toEqual([]);
  });
  it("accepts the full immutable GHCR reference stored by host backups", async () => {
    const { storage, objects, manifest, writes } = completed();
    const reference = `ghcr.io/example/kids@${imageDigest}`;
    const raw = JSON.stringify({ ...manifest, imageDigest: reference });
    objects.set("recovery/database/b.manifest.json", Buffer.from(raw));
    objects.set("recovery/database/b.complete", Buffer.from(digest(raw)));
    expect((await storage.verifiedCompletedBackup("b", "kids_booklet", "_staging", reference)).imageDigest).toBe(reference);
    expect(writes).toEqual([]);
  });
  it.each(["database/b.complete", "database/b.archive.gz", "assets/b/page.png"])("rejects corrupt %s", async (key) => {
    const { storage, objects, writes } = completed();
    objects.set(`recovery/${key}`, Buffer.from("corrupt"));
    await expect(storage.verifiedCompletedBackup("b", "kids_booklet", "_staging", imageDigest)).rejects.toThrow();
    expect(writes).toEqual([]);
  });
  it("reports an incomplete backup only for a modeled missing completion marker", async () => {
    const client = { send: async () => { throw new NoSuchKey({ message: "private object", $metadata: { httpStatusCode: 404 } }); } } as unknown as S3Client;
    await expect(new RecoveryStorage(client, "recovery").inspectCompletedBackup("b", "kids_booklet", "_staging", imageDigest)).resolves.toBeNull();
  });
  it("does not treat permission or transport failure as an incomplete backup", async () => {
    for (const name of ["AccessDenied", "AbortError", "NotFound"]) {
      const original = Object.assign(new Error("private endpoint"), { name });
      const client = { send: async () => { throw original; } } as unknown as S3Client;
      await expect(new RecoveryStorage(client, "recovery").inspectCompletedBackup("b", "kids_booklet", "_staging", imageDigest)).rejects.toBe(original);
    }
  });
  it("fully verifies a completed backup during inspection and rejects corrupt completion evidence", async () => {
    const { storage, manifest, objects, writes } = completed();
    expect(await storage.inspectCompletedBackup("b", "kids_booklet", "_staging", imageDigest)).toEqual(manifest);
    objects.set("recovery/database/b.complete", Buffer.from("corrupt"));
    await expect(storage.inspectCompletedBackup("b", "kids_booklet", "_staging", imageDigest)).rejects.toThrow("completion marker");
    expect(writes).toEqual([]);
  });
  it("rejects missing completion evidence", async () => {
    const { storage, objects } = completed();
    objects.delete("recovery/database/b.complete");
    await expect(storage.verifiedCompletedBackup("b", "kids_booklet", "_staging", imageDigest)).rejects.toThrow("NoSuchKey");
  });
  it("rejects the wrong target or selected release", async () => {
    const { storage } = completed();
    await expect(storage.verifiedCompletedBackup("b", "kids_booklet_prod", "_staging", imageDigest)).rejects.toThrow("target");
    await expect(storage.verifiedCompletedBackup("b", "kids_booklet", "_prod", imageDigest)).rejects.toThrow("target");
    await expect(storage.verifiedCompletedBackup("b", "kids_booklet", "_staging", `sha256:${"b".repeat(64)}`)).rejects.toThrow("selected release");
    await expect(storage.verifiedCompletedBackup("b", "kids_booklet", "_staging", "latest")).rejects.toThrow("immutable");
  });
});
