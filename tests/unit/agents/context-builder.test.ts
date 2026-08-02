import { describe, expect, it } from "vitest";
import { buildSkillContext } from "@/lib/application/skill-context";

describe("buildSkillContext", () => {
  it("keeps a compact, deduplicated record of known facts and approved dependencies", () => {
    const context = buildSkillContext({
      booklet: { id: "00000000-0000-4000-8000-000000000551", schemaVersion: "1", workingTitle: "Robin", lifecycle: "draft", currentStage: "story_plan", coverAssetId: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
      intent: "Make the middle playful.", originalIdea: "A robin shares water.", approvedArtifactVersionIds: ["00000000-0000-4000-8000-000000000552"], traceId: "00000000-0000-4000-8000-000000000553", operation: "guided_intake",
      previousMessages: [{ id: "00000000-0000-4000-8000-000000000554", role: "user", sequence: 0, createdAt: "2026-08-01T00:00:00.000Z", message: { parts: [{ type: "text", text: "A robin shares water." }] } }],
    });

    expect(context.knownFacts).toEqual(["A robin shares water.", "Make the middle playful."]);
    expect(context.approvedArtifactVersionIds).toEqual(["00000000-0000-4000-8000-000000000552"]);
    expect(context.recentMessages).toHaveLength(1);
  });
});
