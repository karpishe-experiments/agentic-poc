import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { composePage } from "@/lib/composition/compose-page";

const page = {
  schemaVersion: "1",
  pageId: "11111111-1111-4111-8111-111111111111",
  pageIndex: 0,
  kind: "cover",
  sceneAction: "A curious child opens a bright red book in a garden.",
  characterIds: [],
  locationIds: [],
  incidentalVisualDetails: [],
  compositionIntent: "Keep the title area calm and clear.",
  continuityNotes: [],
  readerText: "A bright adventure begins.",
  relevantReferenceIds: [],
  textSafeRegion: { x: 0.1, y: 0.72, width: 0.8, height: 0.2 },
};

describe("composePage", () => {
  it.each([
    ["square_1_1", 1536, 1536],
    ["landscape_5_4", 1600, 1280],
    ["portrait_4_5", 1280, 1600],
  ] as const)("writes the approved %s raster canvas", async (geometry, width, height) => {
    const source = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: "#f3d39b" } }).png().toBuffer();
    const result = await composePage({ source, page, geometry });

    expect(result).toMatchObject({ width, height });
    expect(await sharp(result.bytes).metadata()).toMatchObject({ width, height, format: "png" });
  });

  it("reduces the reader-text size to fit a narrow approved panel", async () => {
    const source = await sharp({ create: { width: 1600, height: 1280, channels: 3, background: "#f3d39b" } }).png().toBuffer();
    const result = await composePage({
      source,
      geometry: "landscape_5_4",
      page: {
        ...page,
        readerText: "The stars curled past sleepy flowers and shadowy hedges. Nora kept going, step by careful step.",
        textSafeRegion: { x: 0.56, y: 0.08, width: 0.36, height: 0.23 },
      },
    });

    expect(await sharp(result.bytes).metadata()).toMatchObject({ width: 1600, height: 1280, format: "png" });
  });
});
