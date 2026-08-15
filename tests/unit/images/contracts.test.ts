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
  quality: "disabled" as const,
  references: [],
  editTargetAssetId: null,
};

describe("image contracts", () => {
  it("allows generation without source images and refuses mismatched operations", () => {
    expect(imageRequestSchema.safeParse(request).success).toBe(true);
    expect(imageRequestSchema.safeParse({ ...request, references: [{ assetId: "00000000-0000-4000-8000-000000000701", role: "style" }] }).success).toBe(false);
    expect(imageRequestSchema.safeParse({ ...request, operation: "edit", references: [] }).success).toBe(false);
  });

  it("keeps reference prompts free of unapproved text", () => {
    const prompt = serializeImagePrompt(request.promptPlan);
    expect(prompt).toContain("Keep the red chest");
    expect(prompt).toMatch(/single full-page storybook illustration/i);
    expect(prompt).toMatch(/Do not use comic panels/i);
    expect(prompt).not.toMatch(/dialogue|page numbers/i);
  });

  it("serializes approved comic lettering as exact professional in-image copy", () => {
    const speakerId = "00000000-0000-4000-8000-000000000702";
    const prompt = serializeImagePrompt({
      ...request.promptPlan,
      lettering: [
        { kind: "dialogue", text: "We can do it!", speakerEntityId: speakerId, delivery: "bright and brave", placementHint: "balloon near Robin" },
        { kind: "sound_effect", text: "SPLOOSH!", speakerEntityId: null, delivery: "large playful splash letters", placementHint: "integrated beside the watering can" },
      ],
      speakerNames: { [speakerId]: "Robin" },
      textSafeRegion: { x: 0.08, y: 0.07, width: 0.84, height: 0.22 },
    });

    expect(prompt).toContain('exact text "We can do it!" — speaker: Robin');
    expect(prompt).toContain('exact text "SPLOOSH!"');
    expect(prompt).toMatch(/speech balloons with tails clearly pointing/i);
    expect(prompt).toMatch(/Render every quoted string exactly once, verbatim/i);
    expect(prompt).toMatch(/Do not add any other letters, words, digits/i);
  });
});
