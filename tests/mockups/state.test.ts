import { describe, expect, it } from "vitest";
import {
  freshSeed,
  isMockupState,
  loadState,
  saveState,
  STORAGE_KEY,
} from "@/lib/mockups/specialty-management/state";

describe("mockup state", () => {
  it("starts a fresh independent generation in the directory", () => {
    const state = freshSeed();
    expect(STORAGE_KEY).toBe("specialty-management-mockup:v2");
    expect(state.formatVersion).toBe(1);
    expect(state.seedRevision).toBe(1);
    expect(state.ui.selection).toEqual({ kind: "directory" });
    expect(state.ui.navigationNotice).toBeNull();
    expect(state.booklets).toHaveLength(3);
    expect(
      state.agents.every((agent) =>
        agent.versions.every((version) => version.description.length > 0),
      ),
    ).toBe(true);
  });

  it("persists current state and working preferences", () => {
    const state = freshSeed();
    state.ui.navWidth = 300;
    state.chat.composerText = "Keep this request";
    let value = "";
    expect(
      saveState(
        {
          setItem: (key, next) => {
            expect(key).toBe(STORAGE_KEY);
            value = next;
          },
        },
        state,
      ),
    ).toBeNull();
    expect(isMockupState(JSON.parse(value))).toBe(true);
    const loaded = loadState({ getItem: () => value }).state!;
    expect(loaded.ui.navWidth).toBe(300);
    expect(loaded.chat.composerText).toBe("Keep this request");
  });

  it("does not migrate an older generation", () => {
    const old = structuredClone(freshSeed()) as unknown as {
      formatVersion: number;
      seedRevision: number;
    };
    old.formatVersion = 4;
    expect(loadState({ getItem: () => JSON.stringify(old) })).toEqual({
      state: null,
      error: "Saved demo data uses an unsupported format.",
    });
  });

  it("converts in-flight editing and test responses to interrupted records", () => {
    const state = freshSeed();
    const target = {
      kind: "agent" as const,
      specialtyId: "sp-story",
      agentId: "agent-playful",
      versionId: "playful-v2",
      section: "instructions" as const,
    };
    state.chat.pendingResponse = {
      id: "pending-chat",
      target,
      request: "Add an example",
      base: { kind: "instructions", mainInstructions: "Before" },
      startedAt: "2026-01-01T00:00:00.000Z",
      stage: "Preparing response",
    };
    state.testSessions.push({
      id: "session",
      name: "Saved test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      agentId: "agent-playful",
      agentName: "Playful Writer",
      agentVersionId: "playful-v2",
      agentVersionNumber: 2,
      specialtyId: "sp-story",
      specialtyName: "Story Planning",
      agentSnapshot: structuredClone(
        state.agents
          .find((agent) => agent.id === "agent-playful")!
          .versions.find((version) => version.id === "playful-v2")!,
      ),
      specialtySnapshot: {
        id: "sp-story",
        name: "Story Planning",
        outputType: "text",
        allowedToolIds: [],
      },
      stageSnapshot: structuredClone(state.booklets[0]!.snapshots[0]!),
      routingCatalog: [],
      sourceSessionId: null,
      openingRequest: "Produce a sample result",
      messages: [],
      activity: [],
    });
    state.pendingTestResponse = {
      id: "pending-test",
      sessionId: "session",
      request: "Produce a sample result",
      startedAt: "2026-01-01T00:00:00.000Z",
      kind: "opening",
    };

    const loaded = loadState({ getItem: () => JSON.stringify(state) }).state!;
    expect(loaded.chat.pendingResponse).toBeNull();
    expect(loaded.chat.messages.at(-1)?.metadata?.state).toBe("interrupted");
    expect(loaded.pendingTestResponse).toBeNull();
    expect(loaded.testSessions[0]?.messages.at(-1)?.state).toBe("interrupted");
  });

  it("reports malformed, unsupported, and unwritable storage", () => {
    expect(loadState({ getItem: () => "{" }).error).toMatch(/could not/);
    expect(
      loadState({ getItem: () => JSON.stringify({ formatVersion: 1 }) }).error,
    ).toMatch(/unsupported/);
    expect(
      saveState(
        {
          setItem: () => {
            throw new Error("quota");
          },
        },
        freshSeed(),
      ),
    ).toMatch(/cannot be retained/);
  });
});
