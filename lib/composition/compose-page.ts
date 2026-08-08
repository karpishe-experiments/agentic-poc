import sharp from "sharp";
import { geometrySchema, pagePackageSchema } from "@/lib/contracts/artifacts";

const dimensions = {
  square_1_1: { width: 1536, height: 1536 },
  landscape_5_4: { width: 1600, height: 1280 },
  portrait_4_5: { width: 1280, height: 1600 },
} as const;

export class TextOverflowError extends Error {
  public constructor() { super("Reader text does not fit its reserved text-safe region."); this.name = "TextOverflowError"; }
}

export async function composePage(input: { source: Buffer; page: unknown; geometry: unknown }) {
  pagePackageSchema.parse(input.page);
  const geometry = geometrySchema.parse(input.geometry);
  const { width, height } = dimensions[geometry];
  // The image model renders all approved comic lettering. This boundary only
  // normalizes provider output to the confirmed printable geometry and PNG.
  const output = await sharp(input.source)
    .rotate()
    .resize(width, height, { fit: "cover", position: "attention" })
    .png()
    .toBuffer();
  return { bytes: output, width, height };
}
