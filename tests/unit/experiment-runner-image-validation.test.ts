import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ExperimentImageValidationError, MAX_EXPERIMENT_IMAGE_BYTES, validateExperimentImage } from "@/lib/experiment-runner/image-validation";

async function image(format: "png" | "jpeg" | "webp", width = 3, height = 2) {
  return sharp({ create: { width, height, channels: 3, background: "#74aadd" } })[format]().toBuffer();
}
async function rejected(bytes: Uint8Array, code: ExperimentImageValidationError["code"]) {
  await expect(validateExperimentImage(bytes)).rejects.toMatchObject({ name: "ExperimentImageValidationError", code });
}

describe("experiment original-image validation", () => {
  for (const [format, mimeType, extension] of [
    ["png", "image/png", "png"], ["jpeg", "image/jpeg", "jpg"], ["webp", "image/webp", "webp"],
  ] as const) {
    it(`decodes ${format} pixels and hashes unchanged original bytes`, async () => {
      const bytes = await image(format);
      const original = Buffer.from(bytes);
      await expect(validateExperimentImage(bytes)).resolves.toEqual({
        mimeType, extension, width: 3, height: 2, byteLength: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
      expect(bytes).toEqual(original);
    });
  }

  it("accepts a 1254-square image without normalizing its dimensions or bytes", async () => {
    const bytes = await image("png", 1254, 1254);
    const validated = await validateExperimentImage(bytes);
    expect(validated).toMatchObject({ width: 1254, height: 1254, byteLength: bytes.byteLength });
    expect(validated.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("rejects empty, oversized, unsupported, truncated, and corrupt input with safe typed errors", async () => {
    await rejected(new Uint8Array(), "empty");
    await rejected(new Uint8Array(MAX_EXPERIMENT_IMAGE_BYTES + 1), "too_large");
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>');
    await rejected(svg, "unsupported_format");
    const jpeg = await image("jpeg", 64, 64);
    await rejected(jpeg.subarray(0, Math.floor(jpeg.length / 2)), "invalid_image");
    const png = await image("png", 64, 64);
    const corrupt = Buffer.from(png);
    corrupt.fill(0, 45, Math.min(75, corrupt.length));
    await rejected(corrupt, "invalid_image");
  });

  it("rejects damaged pixel data after readable metadata", async () => {
    const raw = Buffer.alloc(128 * 128 * 3);
    for (let index = 0; index < raw.length; index++) raw[index] = (index * 37) % 256;
    const complete = await sharp(raw, { raw: { width: 128, height: 128, channels: 3 } }).png().toBuffer();
    const truncated = complete.subarray(0, Math.floor(complete.length * 0.2));
    await expect(sharp(truncated).metadata()).resolves.toMatchObject({ format: "png", width: 128, height: 128 });
    await rejected(truncated, "invalid_image");
  });

  it("rejects multiple frames", async () => {
    const frames = Buffer.concat([Buffer.alloc(12, 0), Buffer.alloc(12, 255)]);
    const bytes = await sharp(frames, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
    expect((await sharp(bytes, { animated: true }).metadata()).pages).toBe(2);
    await rejected(bytes, "multiple_frames");
  });

  it("rejects APNG frames even when Sharp reports only the default PNG frame", async () => {
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAACAAAAAgAAAAAAAAAAAAEACgAA6FTcAAAAABFJREFUeJxj+M/A8J8BjIEUAB/uA/3SUH0aAAAAGmZjVEwAAAABAAAAAgAAAAIAAAAAAAAAAAABAAoAAHMnNtQAAAAVZmRBVAAAAAJ4nGP4z8DwnwGMgRQAH+4D/T+K7LQAAAAASUVORK5CYII=", "base64");
    await expect(sharp(bytes).metadata()).resolves.toMatchObject({ format: "png", width: 2, height: 2 });
    await expect(sharp(bytes).stats()).resolves.toBeDefined();
    await rejected(bytes, "multiple_frames");
  });

  it("bounds declared dimensions before pixel decoding", async () => {
    const bytes = await image("png", 2, 2);
    const largeHeader = Buffer.from(bytes);
    largeHeader.writeUInt32BE(8001, 16);
    largeHeader.writeUInt32BE(8000, 20);
    await rejected(largeHeader, "invalid_dimensions");
  });
});
