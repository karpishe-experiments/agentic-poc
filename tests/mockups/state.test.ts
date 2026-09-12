import { describe, expect, it } from "vitest";
import { freshSeed, isMockupState, loadState, saveState, STORAGE_KEY } from "@/lib/mockups/specialty-management/state";

describe("mockup state", () => {
  it("seeds the format-3 document and one inspectable synthetic failure", () => {
    const state = freshSeed();
    expect(state.formatVersion).toBe(3);
    expect(state.booklets).toHaveLength(3);
    expect(state.chat.messages.some((message) => message.id === "seeded-synthetic-failure")).toBe(true);
  });

  it("migrates version-1 editor data without adding the seeded failure", () => {
    const old = structuredClone(freshSeed()) as unknown as { formatVersion: number; chat: object };
    old.formatVersion = 1;
    old.chat = { messages: [], proposals: [], pendingResponse: null };
    const result = loadState({ getItem: () => JSON.stringify(old) });
    expect(result.error).toBeNull();
    expect(result.state?.formatVersion).toBe(3);
    expect(result.state?.chat.messages).toHaveLength(0);
  });

  it("infers legacy agent specialty targets and preserves proposal and retry cards", () => {
    const old = structuredClone(freshSeed()) as unknown as {
      formatVersion: number;
      chat: Record<string, unknown>;
    };
    old.formatVersion = 1;
    const target = {
      agentId: "agent-playful",
      versionId: "playful-v2",
      section: "instructions",
    };
    old.chat = {
      messages: [],
      proposals: [
        {
          id: "legacy-proposal",
          target,
          request: "Add an example",
          baseText: "Before",
          proposedText: "After",
          status: "pending",
        },
      ],
      pendingResponse: {
        id: "legacy-pending",
        target,
        request: "Make it concise",
        baseText: "Before",
      },
    };
    const result = loadState({ getItem: () => JSON.stringify(old) });
    expect(result.error).toBeNull();
    expect(result.state?.chat.proposals[0]?.target).toMatchObject({
      kind: "agent",
      specialtyId: "sp-story",
    });
    expect(
      result.state?.chat.messages.some((message) =>
        message.parts.some(
          (part) => part.type === "data-proposal" && part.data.proposalId === "legacy-proposal",
        ),
      ),
    ).toBe(true);
    expect(result.state?.chat.messages.at(-1)?.retryRequest).toBe("Make it concise");
  });

  it("converts a pending response into an interrupted retry record on refresh", () => {
    const state = freshSeed();
    const target = { kind: "agent" as const, specialtyId: "sp-story", agentId: "agent-playful", versionId: "playful-v2", section: "instructions" as const };
    state.chat.pendingResponse = {
      id: "pending",
      target,
      request: "Add an example",
      base: { kind: "instructions", mainInstructions: "Before" },
      startedAt: "2026-01-01T00:00:00.000Z",
      stage: "Preparing response",
    };
    const result = loadState({ getItem: () => JSON.stringify(state) });
    expect(result.state?.chat.pendingResponse).toBeNull();
    expect(result.state?.chat.messages.at(-1)?.metadata?.state).toBe("interrupted");
  });

  it("persists a valid versioned document", () => {
    let value = "";
    expect(saveState({ setItem: (key, next) => { expect(key).toBe(STORAGE_KEY); value = next; } }, freshSeed())).toBeNull();
    expect(isMockupState(JSON.parse(value))).toBe(true);
  });

  it("migrates a format-2 document with empty test history", () => {
    const old = structuredClone(freshSeed()) as unknown as { formatVersion: number; booklets?: unknown; testSessions?: unknown; pendingTestResponse?: unknown; ui: Record<string, unknown> };
    old.formatVersion = 2;
    delete old.booklets;
    delete old.testSessions;
    delete old.pendingTestResponse;
    delete old.ui.testSetup;
    const result = loadState({ getItem: () => JSON.stringify(old) });
    expect(result.state?.formatVersion).toBe(3);
    expect(result.state?.testSessions).toEqual([]);
    expect(result.state?.booklets).toHaveLength(3);
  });

  it("turns an in-flight test response into an interrupted retry turn on refresh", () => {
    const state = freshSeed();
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
      agentSnapshot: structuredClone(state.agents.find((agent) => agent.id === "agent-playful")!.versions.find((version) => version.id === "playful-v2")!),
      specialtySnapshot: { id: "sp-story", name: "Story Planning", outputType: "text", allowedToolIds: [] },
      stageSnapshot: structuredClone(state.booklets[0]!.snapshots[0]!),
      routingCatalog: [],
      sourceSessionId: null,
      openingRequest: "Produce a sample result",
      messages: [],
      activity: [],
    });
    state.pendingTestResponse = { id: "pending", sessionId: "session", request: "Produce a sample result", startedAt: "2026-01-01T00:00:00.000Z", kind: "opening" };
    const loaded = loadState({ getItem: () => JSON.stringify(state) }).state!;
    expect(loaded.pendingTestResponse).toBeNull();
    expect(loaded.testSessions[0]?.messages.at(-1)?.state).toBe("interrupted");
  });

  it("reports malformed and unwritable storage", () => {
    expect(loadState({ getItem: () => "{" }).error).toMatch(/could not/);
    expect(saveState({ setItem: () => { throw new Error("quota"); } }, freshSeed())).toMatch(/cannot be retained/);
  });
});
