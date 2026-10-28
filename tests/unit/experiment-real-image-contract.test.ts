import { describe, expect, it } from "vitest";
import { realImageCharge, realImageRequest, realImageResultSchema, verifyRealImageRequest } from "@/lib/experiment-runner/real-image-contract";

describe("bounded Real image carrier", () => {
  it("matches the Python adapter's non-ASCII canonical request digest", () => {
    const request = realImageRequest({ schemaVersion: "booklet_real_image_request_v1",
      operation: "generate", prompt: "قاصدک 🪁", model: "gpt-image-2.5-sunburst-2026-09-08",
      size: "1024x1024", quality: "high", background: "opaque", outputFormat: "png",
      n: 1, retries: 0, timeoutSeconds: 60, deadlineAtMs: 120000, references: [] });
    expect(request.requestDigest).toBe("89c53bb388b0e5a3c54ce67b880b95c05de1ffa1877f5e4c8d2e6341b20f5110");
    expect(verifyRealImageRequest(request)).toEqual(request);
    expect(() => verifyRealImageRequest({ ...request, prompt: "changed" })).toThrow();
  });

  it("rejects an oversized provider prompt before a paid claim", () => {
    const base = realImageRequest({ schemaVersion: "booklet_real_image_request_v1",
      operation: "generate", prompt: "x", model: "gpt-image-2.5-sunburst-2026-09-08",
      size: "1024x1024", quality: "high", background: "opaque", outputFormat: "png",
      n: 1, retries: 0, timeoutSeconds: 270, deadlineAtMs: 120000, references: [] });
    expect(() => realImageRequest({ ...base, prompt: "x".repeat(32_001) })).toThrow();
  });

  it("retains total usage and prices an uncategorized input as an upper estimate", () => {
    const result = realImageResultSchema.parse({ schemaVersion: "booklet_real_image_result_v1",
      requestDigest: "a".repeat(64), adapterIdentity: "m5-openai-image-bounded@1",
      dispatchStarted: true, requestedModel: "gpt-image-2.5-sunburst-2026-09-08",
      status: "failed_after_provider", usage: { inputTokens: 10, outputTokens: 20 },
      output: null, failure: { stage: "post_provider", code: "output_invalid" } });
    expect(realImageCharge(result, { inputTextMicrodollarsPerMillion: 5_000_000,
      inputImageMicrodollarsPerMillion: 8_000_000, outputImageMicrodollarsPerMillion: 30_000_000 }))
      .toEqual({ microdollars: 680, basis: "upper_estimate" });
  });

  it("does not charge explicitly classified text output", () => {
    const result = realImageResultSchema.parse({ schemaVersion: "booklet_real_image_result_v1",
      requestDigest: "a".repeat(64), adapterIdentity: "m5-openai-image-bounded@1",
      dispatchStarted: true, requestedModel: "gpt-image-2.5-sunburst-2026-09-08",
      status: "failed_after_provider", usage: { inputTokens: 10, inputTextTokens: 4, inputImageTokens: 6,
        outputTokens: 20, outputTextTokens: 5, outputImageTokens: 15 },
      output: null, failure: { stage: "post_provider", code: "output_invalid" } });
    expect(realImageCharge(result, { inputTextMicrodollarsPerMillion: 5_000_000,
      inputImageMicrodollarsPerMillion: 8_000_000, outputImageMicrodollarsPerMillion: 30_000_000 }))
      .toEqual({ microdollars: 518, basis: "reported_categories" });
  });
});
