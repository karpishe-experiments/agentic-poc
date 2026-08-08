import OpenAI from "openai";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { ImageRequest } from "@/lib/contracts/images";
import { OpenAIImageProvider } from "@/lib/images/openai-image-provider";

const request: ImageRequest = {
  schemaVersion: "1",
  operation: "generate",
  model: "gpt-image-2",
  promptPlan: {
    purpose: "fast draft",
    subject: "Robin",
    action: "Robin waves.",
    location: "Garden",
    visualStyle: "Watercolor",
    continuityConstraints: [],
    preserve: [],
  },
  prompt: "Create a fast draft of Robin waving in a garden.",
  geometry: "square_1_1",
  quality: "low",
  references: [],
  editTargetAssetId: null,
};

describe("OpenAI image provider", () => {
  it("requests compressed JPEG output in fast mode and normalizes it for persisted PNG assets", async () => {
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "orange" } }).jpeg().toBuffer();
    const generate = vi.fn(async () => ({
      _request_id: "request-fast",
      data: [{ b64_json: jpeg.toString("base64") }],
    }));
    const client = { images: { generate } } as unknown as OpenAI;

    const result = await new OpenAIImageProvider(client, { fastOutput: true }).execute(request);

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      quality: "low",
      output_format: "jpeg",
      output_compression: 60,
    }));
    expect(result.status).toBe("succeeded");
    expect(result.mimeType).toBe("image/png");
    expect((await sharp(Buffer.from(result.bytesBase64!, "base64")).metadata()).format).toBe("png");
  });

  it("keeps edit input fidelity low in fast mode", async () => {
    const source = await sharp({ create: { width: 8, height: 8, channels: 4, background: "blue" } }).png().toBuffer();
    const jpeg = await sharp(source).jpeg().toBuffer();
    const edit = vi.fn(async () => ({
      _request_id: "request-fast-edit",
      data: [{ b64_json: jpeg.toString("base64") }],
    }));
    const client = { images: { edit } } as unknown as OpenAI;
    const editRequest: ImageRequest = {
      ...request,
      operation: "edit",
      references: [{ assetId: "00000000-0000-4000-8000-000000000701", role: "character_identity" }],
    };

    const result = await new OpenAIImageProvider(client, { fastOutput: true }).execute(editRequest, [{
      assetId: editRequest.references[0]!.assetId,
      bytes: source,
    }]);

    expect(edit).toHaveBeenCalledWith(expect.objectContaining({
      quality: "low",
      input_fidelity: "low",
      output_format: "jpeg",
      output_compression: 60,
    }));
    expect(result.status).toBe("succeeded");
  });
});
