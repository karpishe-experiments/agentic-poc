import { describe, expect, it } from "vitest";
import { experimentImageRequestSchema, imageRequestFingerprint } from "@/lib/contracts/experiment-image";

const source = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const request = { kind: "reference" as const, prompt: "The approved style module.\nFront, back and side views.", sourceVersionIds: [source], styleVersionId: source };

describe("experiment image request", () => {
  it("retains the exact prompt and ordered source identities", () => {
    expect(experimentImageRequestSchema.parse(request)).toEqual(request);
    expect(imageRequestFingerprint(request)).toBe(imageRequestFingerprint({ styleVersionId: source, sourceVersionIds: [source], prompt: request.prompt, kind: "reference" }));
    expect(imageRequestFingerprint(request)).not.toBe(imageRequestFingerprint({ ...request, prompt: request.prompt + " " }));
    expect(imageRequestFingerprint({ ...request, sourceVersionIds: [source, second] })).not.toBe(imageRequestFingerprint({ ...request, sourceVersionIds: [second, source] }));
  });

  it("requires a complete, unique, bounded source list and retained style source", () => {
    for (const change of [{ sourceVersionIds: [] }, { sourceVersionIds: [source, source] }, { styleVersionId: second }, { prompt: "" }, { prompt: "x".repeat(16_001) }]) {
      expect(experimentImageRequestSchema.safeParse({ ...request, ...change }).success).toBe(false);
    }
  });

  it("rejects caller-selected storage paths and unsupported asset kinds", () => {
    expect(experimentImageRequestSchema.safeParse({ ...request, uri: "another-book/image.png" }).success).toBe(false);
    expect(experimentImageRequestSchema.safeParse({ ...request, kind: "pdf_export" }).success).toBe(false);
  });

  it("permits a model-free fixture without a style while retaining its source", () => {
    expect(experimentImageRequestSchema.parse({ ...request, styleVersionId: null }).sourceVersionIds).toEqual([source]);
  });
});
