import { describe, expect, it } from "vitest";
import { imageRequestSchema } from "@/lib/contracts/images";
import { serializeImagePrompt } from "@/lib/images/prompt-serializer";

const request = {
  schemaVersion: "1",
  operation: "generate" as const,
  model: "fake-image",
  promptPlan: { purpose: "reference", subject: "Robin", action: "A clear reference pose", location: "a quiet garden", visualStyle: "soft watercolor", continuityConstraints: ["Keep the red chest."], preserve: ["Round silhouette"] },
  prompt: "reference prompt",
  geometry: "square_1_1" as const,
  quality: "balanced" as const,
  references: [],
  editTargetAssetId: null,
};

describe("image contracts", () => {
  it("allows generation without source images and refuses mismatched operations", () => {
    expect(imageRequestSchema.safeParse(request).success).toBe(true);
    expect(imageRequestSchema.safeParse({ ...request, references: [{ assetId: "00000000-0000-4000-8000-000000000701", role: "style" }] }).success).toBe(false);
    expect(imageRequestSchema.safeParse({ ...request, operation: "edit", references: [] }).success).toBe(false);
  });

  it("serializes prompt plans without requesting embedded reader text", () => {
    const prompt = serializeImagePrompt(request.promptPlan);
    expect(prompt).toContain("Keep the red chest");
    expect(prompt).not.toMatch(/dialogue|page numbers/i);
  });
});
