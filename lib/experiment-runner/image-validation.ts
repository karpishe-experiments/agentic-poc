import { createHash } from "node:crypto";
import sharp from "sharp";

export const MAX_EXPERIMENT_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_EXPERIMENT_IMAGE_PIXELS = 64_000_000;

export type ExperimentImageValidationCode =
  | "empty"
  | "too_large"
  | "unsupported_format"
  | "invalid_dimensions"
  | "multiple_frames"
  | "invalid_image";

export class ExperimentImageValidationError extends Error {
  public constructor(public readonly code: ExperimentImageValidationCode) {
    super(`Experiment image validation failed: ${code}.`);
    this.name = "ExperimentImageValidationError";
  }
}

export type ValidatedExperimentImage = {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  extension: "png" | "jpg" | "webp";
  width: number;
  height: number;
  byteLength: number;
  sha256: string;
};

const formats = {
  png: { mimeType: "image/png", extension: "png" },
  jpeg: { mimeType: "image/jpeg", extension: "jpg" },
  webp: { mimeType: "image/webp", extension: "webp" },
} as const;

function assertSinglePngFrame(bytes: Buffer): void {
  // Sharp can report only the PNG default frame. Inspect bounded APNG chunks
  // without scanning arbitrary compressed pixel bytes for marker strings.
  let frameControls = 0;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) throw new ExperimentImageValidationError("invalid_image");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "acTL") {
      if (length !== 8) throw new ExperimentImageValidationError("invalid_image");
      if (bytes.readUInt32BE(offset + 8) !== 1) throw new ExperimentImageValidationError("multiple_frames");
    }
    if (type === "fcTL" && ++frameControls > 1) throw new ExperimentImageValidationError("multiple_frames");
    offset += length + 12;
    if (type === "IEND") break;
  }
}

export async function validateExperimentImage(content: Uint8Array): Promise<ValidatedExperimentImage> {
  if (content.byteLength === 0) throw new ExperimentImageValidationError("empty");
  if (content.byteLength > MAX_EXPERIMENT_IMAGE_BYTES) throw new ExperimentImageValidationError("too_large");
  // Copy once so an external buffer cannot change between decoding and hashing.
  const bytes = Buffer.from(content);
  try {
    const decoder = sharp(bytes, { limitInputPixels: MAX_EXPERIMENT_IMAGE_PIXELS, failOn: "warning" });
    const metadata = await decoder.metadata();
    const format = formats[metadata.format as keyof typeof formats];
    if (!format) throw new ExperimentImageValidationError("unsupported_format");
    if (metadata.format === "png") assertSinglePngFrame(bytes);
    const { width, height } = metadata;
    if (!width || !height || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width * height > MAX_EXPERIMENT_IMAGE_PIXELS) {
      throw new ExperimentImageValidationError("invalid_dimensions");
    }
    if ((metadata.pages ?? 1) !== 1) throw new ExperimentImageValidationError("multiple_frames");
    // Metadata and signatures do not prove that all image pixels can be decoded.
    await decoder.stats();
    return { ...format, width, height, byteLength: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch (error) {
    if (error instanceof ExperimentImageValidationError) throw error;
    if (error instanceof Error && /pixel limit|image too large/i.test(error.message)) throw new ExperimentImageValidationError("invalid_dimensions");
    throw new ExperimentImageValidationError("invalid_image");
  }
}
