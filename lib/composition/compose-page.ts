import sharp from "sharp";
import path from "node:path";
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
  const page = pagePackageSchema.parse(input.page);
  const geometry = geometrySchema.parse(input.geometry);
  const { width, height } = dimensions[geometry];
  const text = page.readerText.trim();
  if (text.length > 360) throw new TextOverflowError();
  const region = page.textSafeRegion;
  const x = Math.round(region.x * width);
  const y = Math.round(region.y * height);
  const boxWidth = Math.round(region.width * width);
  const boxHeight = Math.round(region.height * height);
  const words = text.split(/\s+/);
  const fontFile = path.join(process.cwd(), "seeds", "fonts", "nunito", "Nunito-Variable.ttf");
  const maximumFontSize = Math.max(24, Math.min(54, Math.floor(boxHeight / 3.3)));
  let textLayer: Buffer | null = null;
  // Page plans reserve different fractions of the canvas. Start with the largest
  // reader-friendly size, then shrink only when the approved copy needs it.
  for (let fontSize = maximumFontSize; fontSize >= 24; fontSize -= 2) {
    const lines: string[] = [];
    let line = "";
    const charactersPerLine = Math.max(12, Math.floor((boxWidth - 36) / (fontSize * 0.58)));
    for (const word of words) {
      const candidate = `${line}${line ? " " : ""}${word}`;
      if (candidate.length > charactersPerLine && line) { lines.push(line); line = word; } else line = candidate;
    }
    if (line) lines.push(line);
    if (lines.length * fontSize * 1.32 > boxHeight - 36) continue;
    const candidate = await sharp({
      text: {
        text: lines.join("\n"),
        font: `Nunito Bold ${fontSize}`,
        fontfile: fontFile,
        width: boxWidth - 36,
        align: "left",
        spacing: Math.round(fontSize * 0.18),
        rgba: true,
      },
    }).png().toBuffer();
    const textMetrics = await sharp(candidate).metadata();
    if ((textMetrics.height ?? 0) <= boxHeight - 36) {
      textLayer = candidate;
      break;
    }
  }
  if (!textLayer) throw new TextOverflowError();
  const panel = await sharp({ create: { width: boxWidth, height: boxHeight, channels: 4, background: "#fffdf6" } }).png().toBuffer();
  // GPT Image's nearest supported landscape and portrait ratios are 3:2 and 2:3.
  // A cover crop preserves the image's aspect ratio while producing the confirmed
  // printable 5:4 or 4:5 canvas without stretching reader-facing artwork.
  const output = await sharp(input.source)
    .rotate()
    .resize(width, height, { fit: "cover", position: "attention" })
    .composite([{ input: panel, left: x, top: y }, { input: textLayer, left: x + 18, top: y + 18 }])
    .png()
    .toBuffer();
  return { bytes: output, width, height };
}
