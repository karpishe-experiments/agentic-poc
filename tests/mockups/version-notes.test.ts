import { describe, expect, it } from "vitest";
import { freshSeed } from "@/lib/mockups/specialty-management/state";
import { suggestVersionNote } from "@/lib/mockups/specialty-management/version-notes";

describe("version note suggestions", () => {
  it("uses the fixed category order and ignores the note itself", () => {
    const state = freshSeed();
    const agent = state.agents.find((item) => item.id === "agent-playful")!;
    const draft = structuredClone(agent.versions.find((item) => item.id === "playful-v2")!);
    draft.languageModel = { provider: "Demo South", model: "Quick" };
    draft.mainInstructions = "Changed instructions";
    draft.references = [];
    draft.versionNote = "This text is ignored";
    expect(suggestVersionNote(agent, draft)).toBe(
      "Updated models, Main instructions, and references.",
    );
  });

  it("handles initial and unchanged drafts", () => {
    const state = freshSeed();
    const agent = state.agents.find((item) => item.id === "agent-playful")!;
    const parent = agent.versions.find((item) => item.id === "playful-v1")!;
    expect(suggestVersionNote(agent, { ...parent, status: "draft" })).toBe(
      "Initial draft",
    );
    expect(
      suggestVersionNote(agent, {
        ...structuredClone(parent),
        id: "same-draft",
        parentVersionId: parent.id,
        status: "draft",
      }),
    ).toBe("No configuration or instruction changes.");
  });
});
