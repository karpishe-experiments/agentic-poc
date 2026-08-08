import { describe, expect, it } from "vitest";
import { pagePlanSchema, storyPlanSchema } from "@/lib/contracts/artifacts";

const characterId = "00000000-0000-4000-8000-000000000301";
const settingId = "00000000-0000-4000-8000-000000000302";

describe("artifact contracts", () => {
  it("enforces stable entity IDs across Story Plan characters and locations", () => {
    const result = storyPlanSchema.safeParse({
      schemaVersion: "1",
      premise: "A robin shares water.",
      theme: "Kindness",
      characters: [{ entityId: characterId, name: "Robin", narrativeRole: "hero", goal: "Share", relationships: [], named: true, continuityRelevant: true, recurringVisualSubject: true }],
      settings: [{ entityId: characterId, name: "Garden", narrativeRole: "setting", named: true, continuityRelevant: true, recurringVisualSubject: true }],
      storyArc: "Robin learns to wait.",
      keyEvents: ["Robin pauses."],
      ending: "The garden blooms.",
      ageFitNotes: "Warm and concrete.",
      continuityConstraints: [],
    });

    expect(result.success).toBe(false);
  });

  it("requires one cover followed by contiguous story pages", () => {
    const result = pagePlanSchema.safeParse({
      schemaVersion: "1",
      storyPageCount: 3,
      geometry: "landscape_5_4",
      pages: [
        { pageId: "00000000-0000-4000-8000-000000000311", pageIndex: 0, kind: "cover", readerText: "Robin's Garden", sceneAction: "Robin looks at the garden.", characterIds: [characterId], locationIds: [settingId], incidentalVisualDetails: [], compositionIntent: "A welcoming wide view", continuityNotes: [], relevantReferenceIds: [], textSafeRegion: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 } },
        { pageId: "00000000-0000-4000-8000-000000000312", pageIndex: 1, kind: "story", readerText: "Robin hurries.", sceneAction: "Robin tips the watering can.", characterIds: [characterId], locationIds: [settingId], incidentalVisualDetails: [], compositionIntent: "A close view", continuityNotes: [], relevantReferenceIds: [], textSafeRegion: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 } },
        { pageId: "00000000-0000-4000-8000-000000000313", pageIndex: 2, kind: "story", readerText: "The sparrows wait.", sceneAction: "The sparrows watch.", characterIds: [characterId], locationIds: [settingId], incidentalVisualDetails: [], compositionIntent: "A calm mid view", continuityNotes: [], relevantReferenceIds: [], textSafeRegion: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 } },
        { pageId: "00000000-0000-4000-8000-000000000314", pageIndex: 4, kind: "story", readerText: "Everyone shares.", sceneAction: "Everyone waters together.", characterIds: [characterId], locationIds: [settingId], incidentalVisualDetails: [], compositionIntent: "A happy wide view", continuityNotes: [], relevantReferenceIds: [], textSafeRegion: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 } },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("validates professional lettering speakers, reading order, and word limits", () => {
    const base = { pageId: "00000000-0000-4000-8000-000000000321", pageIndex: 1, kind: "story" as const, readerText: "We can do it! SPLASH!", sceneAction: "Robin tips the watering can.", characterIds: [characterId], locationIds: [settingId], incidentalVisualDetails: [], compositionIntent: "A close view", continuityNotes: [], relevantReferenceIds: [], textSafeRegion: { x: 0.1, y: 0.1, width: 0.8, height: 0.3 } };
    const valid = pagePlanSchema.shape.pages.element.safeParse({ ...base, lettering: [
      { kind: "dialogue", text: "We can do it!", speakerEntityId: characterId, delivery: "brave", placementHint: "near Robin" },
      { kind: "sound_effect", text: "SPLASH!", speakerEntityId: null, delivery: "playful", placementHint: "by the water" },
    ] });
    const invalidSpeaker = pagePlanSchema.shape.pages.element.safeParse({ ...base, lettering: [{ kind: "dialogue", text: base.readerText, speakerEntityId: settingId, delivery: "brave", placementHint: "near Robin" }] });
    expect(valid.success).toBe(true);
    expect(invalidSpeaker.success).toBe(false);
  });
});
