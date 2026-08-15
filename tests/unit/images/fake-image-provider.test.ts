import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FakeImageProvider } from "@/lib/images/fake-image-provider";

describe("FakeImageProvider", () => {
  it("returns a non-blank deterministic preview image", async () => {
    const result = await new FakeImageProvider().execute({
      schemaVersion: "1", operation: "generate", model: "fake-image", geometry: "square_1_1", quality: "low", references: [], editTargetAssetId: null,
      prompt: "A placeholder garden scene.",
      promptPlan: { purpose: "test", subject: "A robin in a garden", action: "Stand by a watering can.", location: "Garden", visualStyle: "Watercolor", continuityConstraints: [], preserve: [] },
    });

    expect(result.status).toBe("succeeded");
    const image = sharp(Buffer.from(result.bytesBase64!, "base64"));
    expect(await image.metadata()).toMatchObject({ width: 1024, height: 1024, format: "png" });
    const pixels = await image.raw().toBuffer();
    expect(new Set([pixels[0], pixels[1], pixels[2], pixels[pixels.length - 4], pixels[pixels.length - 3], pixels[pixels.length - 2]])).toHaveLength(6);
  });
});
