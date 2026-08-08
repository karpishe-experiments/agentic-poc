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
  it("classifies exhausted billing as blocked rather than retryable", async () => {
    const generate = vi.fn(async () => {
      throw new OpenAI.APIError(429, {
        code: "credit_balance_exhausted",
        type: "insufficient_quota",
      }, "You have no credits remaining.", new Headers());
    });
    const client = { images: { generate } } as unknown as OpenAI;

    const result = await new OpenAIImageProvider(client).execute(request);

    expect(generate).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: "failed",
      error: {
        kind: "blocked",
        providerError: {
          status: 429,
          code: "credit_balance_exhausted",
          type: "insufficient_quota",
        },
      },
    });
  });

  it("sends configured output quality and supported native sizes", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "orange" } }).png().toBuffer();
    const generate = vi.fn(async (input: unknown) => {
      void input;
      return { _request_id: "request-quality", data: [{ b64_json: png.toString("base64") }] };
    });
    const client = { images: { generate } } as unknown as OpenAI;

    const cases = [
      ["square_1_1", "1024x1024"],
      ["landscape_5_4", "1536x1024"],
      ["portrait_4_5", "1024x1536"],
    ] as const;
    const provider = new OpenAIImageProvider(client);
    for (const [geometry, size] of cases) {
      const result = await provider.execute({ ...request, geometry });
      expect(generate).toHaveBeenLastCalledWith(expect.objectContaining({ quality: "low", size }));
      expect(result.status).toBe("succeeded");
      expect(result.mimeType).toBe("image/png");
      expect((await sharp(Buffer.from(result.bytesBase64!, "base64")).metadata()).format).toBe("png");
    }
    expect(generate.mock.calls[0]?.[0]).not.toHaveProperty("output_format");
  });

  it("omits input fidelity from gpt-image-2 edits while preserving output quality", async () => {
    const source = await sharp({ create: { width: 8, height: 8, channels: 4, background: "blue" } }).png().toBuffer();
    const edit = vi.fn(async (input: unknown) => {
      void input;
      return {
        _request_id: "request-gpt-image-2-edit",
        data: [{ b64_json: source.toString("base64") }],
      };
    });
    const client = { images: { edit } } as unknown as OpenAI;
    const editRequest: ImageRequest = {
      ...request,
      operation: "edit",
      references: [{ assetId: "00000000-0000-4000-8000-000000000701", role: "character_identity" }],
    };

    const result = await new OpenAIImageProvider(client).execute(editRequest, [{
      assetId: editRequest.references[0]!.assetId,
      bytes: source,
    }]);

    expect(edit).toHaveBeenCalledWith(expect.objectContaining({
      quality: "low",
    }));
    expect(edit.mock.calls[0]?.[0]).not.toHaveProperty("input_fidelity");
    expect(result.status).toBe("succeeded");
  });

  it("sends matching output quality and input fidelity for supported edits", async () => {
    const source = await sharp({ create: { width: 8, height: 8, channels: 4, background: "green" } }).png().toBuffer();
    const edit = vi.fn(async () => ({ _request_id: "request-fidelity", data: [{ b64_json: source.toString("base64") }] }));
    const client = { images: { edit } } as unknown as OpenAI;
    const editRequest: ImageRequest = {
      ...request,
      model: "gpt-image-1.5",
      operation: "edit",
      quality: "high",
      references: [{ assetId: "00000000-0000-4000-8000-000000000702", role: "character_identity" }],
    };

    await new OpenAIImageProvider(client).execute(editRequest, [{ assetId: editRequest.references[0]!.assetId, bytes: source }]);

    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ quality: "high", input_fidelity: "high" }));
  });

  it("omits both quality controls when disabled", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).png().toBuffer();
    const generate = vi.fn(async (input: unknown) => {
      void input;
      return { _request_id: "request-default", data: [{ b64_json: png.toString("base64") }] };
    });
    const client = { images: { generate } } as unknown as OpenAI;

    await new OpenAIImageProvider(client).execute({ ...request, quality: "disabled" });

    expect(generate.mock.calls[0]?.[0]).not.toHaveProperty("quality");
    expect(generate.mock.calls[0]?.[0]).not.toHaveProperty("input_fidelity");
  });
});
