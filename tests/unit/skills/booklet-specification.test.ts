import { describe, expect, it } from "vitest";
import { recommendBookletSpecification } from "@/lib/skills/booklet-specification";

const context = { schemaVersion: "1" as const, bookletId: "00000000-0000-4000-8000-000000000100", stage: "booklet_specification" as const, operation: "guided_intake" as const, intent: "Recommend a booklet.", knownFacts: [], recentMessages: [], approvedArtifactVersionIds: [], traceId: "00000000-0000-4000-8000-000000000101" };

function story(ageFitNotes: string) {
  return { schemaVersion: "1" as const, premise: "A kind story.", theme: "Care", characters: [], settings: [], storyArc: "A gentle arc.", keyEvents: ["A beginning."], ending: "A hopeful ending.", ageFitNotes, continuityConstraints: [] };
}

describe("booklet specification recommendations", () => {
  it.each([
    ["Pacing is tuned for ages 3–5.", 3, "square_1_1"],
    ["Pacing is tuned for ages 6–8.", 6, "landscape_5_4"],
    ["Pacing is tuned for ages 9–12.", 8, "portrait_4_5"],
  ] as const)("matches %s to an approved bounded format", async (ageFitNotes, storyPageCount, geometry) => {
    const result = await recommendBookletSpecification({ intent: "Recommend a booklet.", storyPlan: story(ageFitNotes) }, context);
    expect(result.content).toMatchObject({ storyPageCount, geometry, geometryConfirmed: false });
  });
});
