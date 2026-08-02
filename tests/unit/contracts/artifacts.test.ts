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
});
