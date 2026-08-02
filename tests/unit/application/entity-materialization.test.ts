import { describe, expect, it } from "vitest";
import { materializePagePlan, materializeStoryPlan } from "@/lib/application/entity-materialization";
import type { PagePlanDraft, StoryPlanDraft } from "@/lib/contracts/drafts";

const ids = [
  "00000000-0000-4000-8000-000000000701",
  "00000000-0000-4000-8000-000000000702",
  "00000000-0000-4000-8000-000000000703",
  "00000000-0000-4000-8000-000000000704",
  "00000000-0000-4000-8000-000000000705",
  "00000000-0000-4000-8000-000000000706",
];

function idFactory() {
  let position = 0;
  return () => ids[position++]!;
}

const newStory: StoryPlanDraft = {
  schemaVersion: "1", premise: "Robin shares water.", theme: "Care", storyArc: "Robin learns to share.", keyEvents: ["Robin finds a puddle."], ending: "Everyone has water.", ageFitNotes: "Short and concrete.", continuityConstraints: ["Keep Robin recognizable."],
  characters: [{ kind: "new", clientKey: "robin", name: "Robin", narrativeRole: "hero", goal: "Share water", relationships: [], named: true, continuityRelevant: true, recurringVisualSubject: true }],
  settings: [{ kind: "new", clientKey: "garden", name: "Garden", narrativeRole: "setting", named: true, continuityRelevant: true, recurringVisualSubject: true }],
};

describe("application-owned identity materialization", () => {
  it("assigns IDs only for new Story Plan entity drafts and retains explicit existing IDs", () => {
    const first = materializeStoryPlan(newStory, null, idFactory());
    expect(first.characters[0]?.entityId).toBe(ids[0]);
    expect(first.settings[0]?.entityId).toBe(ids[1]);

    const revision: StoryPlanDraft = {
      ...newStory,
      characters: [{ kind: "existing", entityId: first.characters[0]!.entityId, name: "Robin", narrativeRole: "hero", goal: "Share rainwater", relationships: [], named: true, continuityRelevant: true, recurringVisualSubject: true }],
      settings: [{ kind: "existing", entityId: first.settings[0]!.entityId, name: "Garden", narrativeRole: "setting", named: true, continuityRelevant: true, recurringVisualSubject: true }],
    };
    const second = materializeStoryPlan(revision, first, idFactory());
    expect(second.characters[0]?.entityId).toBe(first.characters[0]?.entityId);
    expect(second.settings[0]?.entityId).toBe(first.settings[0]?.entityId);
    expect(() => materializeStoryPlan({ ...newStory, characters: [{ ...newStory.characters[0]!, kind: "existing", entityId: ids[5] }], settings: [] }, first, idFactory())).toThrow(/existing entity ID/);
  });

  it("assigns page IDs and preserves them by page position for a revision", () => {
    const page = (pageIndex: number, kind: "cover" | "story") => ({ pageIndex, kind, readerText: kind === "cover" ? "Robin" : "Robin shares.", sceneAction: "One clear action.", characterIds: [], locationIds: [], incidentalVisualDetails: [], compositionIntent: "One illustration.", continuityNotes: [], relevantReferenceIds: [], textSafeRegion: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 } });
    const draft: PagePlanDraft = { schemaVersion: "1", storyPageCount: 3, geometry: "square_1_1", pages: [page(0, "cover"), page(1, "story"), page(2, "story"), page(3, "story")] };
    const first = materializePagePlan(draft, null, idFactory());
    const second = materializePagePlan({ ...draft, pages: draft.pages.map((item) => ({ ...item, readerText: `${item.readerText} Revised` })) }, first, idFactory());
    expect(second.pages.map((item) => item.pageId)).toEqual(first.pages.map((item) => item.pageId));
  });
});
