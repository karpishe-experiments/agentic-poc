import { describe, expect, it } from "vitest";
import {
  compatibilityFor,
  completeTestResponse,
  createTestSession,
  editingHandoff,
  isSessionOrphaned,
  repeatTestSetup,
  retryTestResponse,
  selectTestVersion,
  startTestResponse,
  stopTestResponse,
} from "@/lib/mockups/specialty-management/testing";
import { freshSeed } from "@/lib/mockups/specialty-management/state";

let number = 0;
const id = (prefix: string) => `${prefix}-${++number}`;

describe("synthetic agent tests", () => {
  it("only exposes prepared current and earlier stage snapshots", () => {
    const state = freshSeed();
    const forest = state.booklets.find((booklet) => booklet.id === "demo-forest")!;
    expect(forest.snapshots.map((snapshot) => snapshot.stageId)).toEqual(["audience_profile", "story_plan"]);
    expect(forest.snapshots[0]?.artifacts).toEqual([]);
    expect(forest.snapshots[1]?.artifacts.map((artifact) => artifact.stageId)).toEqual(["audience_profile"]);
  });

  it("captures unsaved visible agent content and frozen stage context", () => {
    const state = freshSeed();
    const saved = state.agents.find((agent) => agent.id === "agent-playful")!.versions.find((version) => version.id === "playful-v2")!;
    state.workingCopies.versions[saved.id] = { ...saved, mainInstructions: "Unsaved test instructions" };
    const session = createTestSession(state, "agent-playful", state.ui.testSetup, id)!;
    expect(session.agentSnapshot.mainInstructions).toBe("Unsaved test instructions");
    state.workingCopies.versions[saved.id] = { ...saved, mainInstructions: "Later edit" };
    expect(session.agentSnapshot.mainInstructions).toBe("Unsaved test instructions");
  });

  it("distinguishes a retry from repeat test with current edits", () => {
    const state = freshSeed();
    const session = createTestSession(state, "agent-playful", state.ui.testSetup, id)!;
    startTestResponse(state, session.id, session.openingRequest, "opening", id);
    stopTestResponse(state, id);
    const stopped = session.messages.at(-1)!;
    expect(retryTestResponse(state, session.id, stopped.id, id)?.kind).toBe("retry");
    stopTestResponse(state, id);
    const setup = repeatTestSetup(state, session.id)!;
    expect(setup.sourceSessionId).toBe(session.id);
    expect(setup.openingRequest).toBe(session.openingRequest);
  });

  it("creates deterministic text and image results with only frozen allowed activity", () => {
    const state = freshSeed();
    const text = createTestSession(state, "agent-playful", state.ui.testSetup, id)!;
    startTestResponse(state, text.id, "Produce a sample result", "opening", id);
    completeTestResponse(state, id);
    expect(text.messages.at(-1)?.result?.kind).toBe("text");
    expect(text.activity.every((activity) => activity.kind !== "tool-call" || state.specialties.find((specialty) => specialty.id === "sp-story")?.allowedToolIds.some((tool) => activity.label.includes(tool)))).toBe(true);

    const image = createTestSession(state, "agent-watercolor", state.ui.testSetup, id)!;
    startTestResponse(state, image.id, "Produce a sample result", "opening", id);
    completeTestResponse(state, id);
    expect(image.messages.at(-1)?.result?.kind).toBe("image");
    expect(image.activity.some((activity) => activity.label.includes("generate_image"))).toBe(true);
  });

  it("summarizes only context captured before the selected stage", () => {
    const state = freshSeed();
    const session = createTestSession(state, "agent-playful", state.ui.testSetup, id)!;
    startTestResponse(state, session.id, "Summarize context", "opening", id);
    completeTestResponse(state, id);
    const result = session.messages.at(-1)?.result;
    expect(result?.kind).toBe("text");
    if (result?.kind !== "text") return;
    expect(result.markdown).toContain("Audience profile");
    expect(result.markdown).toContain("Help with Story plan for Forest Friends");
    expect(result.markdown).not.toContain("Warm watercolor");
    expect(result.markdown).not.toContain("Visual bible");
  });

  it("uses version fallback and retains inspectable orphan sessions", () => {
    const state = freshSeed();
    const session = createTestSession(state, "agent-playful", state.ui.testSetup, id)!;
    state.agents = state.agents.filter((agent) => agent.id !== "agent-playful");
    expect(isSessionOrphaned(state, session)).toBe(true);
    expect(repeatTestSetup(state, session.id)).toBeNull();
    expect(selectTestVersion(state, "agent-playful")).toBeNull();
  });

  it("marks compatibility warnings without blocking a session", () => {
    const state = freshSeed();
    const story = state.specialties.find((specialty) => specialty.id === "sp-story")!;
    expect(compatibilityFor(story, "visual_bible")).toBe("warning");
    expect(createTestSession(state, "agent-playful", { ...state.ui.testSetup, stageId: "story_plan" }, id)).not.toBeNull();
  });

  it("prepares an editing handoff using an available fallback version", () => {
    const state = freshSeed();
    const session = createTestSession(state, "agent-playful", state.ui.testSetup, id)!;
    startTestResponse(state, session.id, "Produce a sample result", "opening", id);
    completeTestResponse(state, id);
    const message = session.messages.at(-1)!;
    state.agents.find((agent) => agent.id === "agent-playful")!.versions = state.agents.find((agent) => agent.id === "agent-playful")!.versions.filter((version) => version.id !== session.agentVersionId);
    const handoff = editingHandoff(state, session.id, message.id);
    expect(handoff?.differs).toBe(true);
    expect(handoff?.request).toContain(`Tested v${session.agentVersionNumber} at ${session.stageSnapshot.stageLabel}`);
  });

  it("falls back to the highest numbered remaining version", () => {
    const state = freshSeed();
    const agent = state.agents.find((item) => item.id === "agent-playful")!;
    state.ui.selection = { kind: "specialty", specialtyId: "sp-story" };
    state.ui.recentVersionIds = {};
    agent.activeVersionId = null;
    agent.versions.reverse();
    expect(selectTestVersion(state, agent.id)?.saved.number).toBe(2);
  });
});
