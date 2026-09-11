import { describe, expect, it } from "vitest";
import { freshSeed, isMockupState, loadState, reducer, saveState, STORAGE_KEY } from "@/lib/mockups/specialty-management/state";

describe("mockup state", () => {
  it("loads seeds when empty", () => expect(loadState({ getItem: () => null }).state?.formatVersion).toBe(1));
  it("rejects malformed data", () => expect(loadState({ getItem: () => "{" }).error).toMatch(/could not/));
  it("persists one versioned document", () => { let value = ""; expect(saveState({ setItem: (key, next) => { expect(key).toBe(STORAGE_KEY); value = next; } }, freshSeed())).toBeNull(); expect(isMockupState(JSON.parse(value))).toBe(true); });
  it("reports storage write failures", () => expect(saveState({ setItem: () => { throw new Error("quota"); } }, freshSeed())).toMatch(/cannot be retained/));
  it("supports isolated fork and lifecycle state transitions", () => {
    const state = freshSeed();
    const next = reducer(state, { type: "mutate", mutate: (current) => { const draft = structuredClone(current); const agent = draft.agents.find((item) => item.id === "agent-playful")!; const source = agent.versions.find((item) => item.id === "playful-v2")!; const copy = structuredClone(source); copy.id = "test-v3"; copy.number = 3; copy.parentVersionId = source.id; copy.status = "draft"; agent.versions.push(copy); copy.mainInstructions = "Changed clone"; copy.status = "confirmed"; agent.activeVersionId = copy.id; return draft; } });
    const source = next.agents.find((item) => item.id === "agent-playful")!.versions.find((item) => item.id === "playful-v2")!;
    const copy = next.agents.find((item) => item.id === "agent-playful")!.versions.find((item) => item.id === "test-v3")!;
    expect(source.mainInstructions).not.toBe(copy.mainInstructions);
    expect(copy.references.map((item) => item.id)).toEqual(source.references.map((item) => item.id));
    expect(next.agents.find((item) => item.id === "agent-playful")!.activeVersionId).toBe(copy.id);
  });
});
