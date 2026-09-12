import { describe, expect, it } from "vitest";
import { freshSeed, isMockupState, loadState, saveState, STORAGE_KEY } from "@/lib/mockups/specialty-management/state";
import { createTestSession } from "@/lib/mockups/specialty-management/testing";

let migrationId = 0;
const nextMigrationId = (prefix: string) => `${prefix}-${++migrationId}`;

describe("mockup state", () => {
  it("seeds the format-4 document and one inspectable synthetic failure", () => {
    const state = freshSeed();
    expect(state.formatVersion).toBe(4);
    expect(state.ui.focusMode).toBe(false);
    expect(state.agents.every((agent) => agent.versions.every((version) => version.versionNote === ""))).toBe(true);
    expect(state.booklets).toHaveLength(3);
    expect(state.chat.messages.some((message) => message.id === "seeded-synthetic-failure")).toBe(true);
  });

  it("migrates version-1 editor data without adding the seeded failure", () => {
    const old = structuredClone(freshSeed()) as unknown as { formatVersion: number; chat: object };
    old.formatVersion = 1;
    old.chat = { messages: [], proposals: [], pendingResponse: null };
    const result = loadState({ getItem: () => JSON.stringify(old) });
    expect(result.error).toBeNull();
    expect(result.state?.formatVersion).toBe(4);
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
    expect(result.state?.formatVersion).toBe(4);
    expect(result.state?.testSessions).toEqual([]);
    expect(result.state?.booklets).toHaveLength(3);
  });

  it("migrates format 3 without losing editor, chat, tests, or pane preferences", () => {
    const state = freshSeed();
    state.chat.composerText = "Preserve this editing request";
    state.ui.navWidth = 300;
    state.ui.chatOpen = false;
    const saved = state.agents.find((agent) => agent.id === "agent-playful")!.versions.find((version) => version.id === "playful-v2")!;
    state.workingCopies.versions[saved.id] = { ...saved, title: "Unsaved title" };
    const session = createTestSession(state, "agent-playful", state.ui.testSetup, nextMigrationId)!;
    const old = state as unknown as {
      formatVersion: number;
      ui: { focusMode?: boolean };
      agents: Array<{ versions: Array<Record<string, unknown>> }>;
      workingCopies: { versions: Record<string, Record<string, unknown>> };
      testSessions: Array<{ agentSnapshot: Record<string, unknown> }>;
    };
    old.formatVersion = 3;
    delete old.ui.focusMode;
    old.agents.forEach((agent) =>
      agent.versions.forEach((version) => delete version.versionNote),
    );
    Object.values(old.workingCopies.versions).forEach(
      (version) => delete version.versionNote,
    );
    delete old.testSessions[0]!.agentSnapshot.versionNote;

    const loaded = loadState({ getItem: () => JSON.stringify(old) }).state!;
    expect(loaded.formatVersion).toBe(4);
    expect(loaded.ui.focusMode).toBe(false);
    expect(loaded.ui.navWidth).toBe(300);
    expect(loaded.ui.chatOpen).toBe(false);
    expect(loaded.chat.composerText).toBe("Preserve this editing request");
    expect(loaded.workingCopies.versions[saved.id]?.title).toBe("Unsaved title");
    expect(loaded.workingCopies.versions[saved.id]?.versionNote).toBe("");
    expect(loaded.testSessions[0]?.id).toBe(session.id);
    expect(loaded.testSessions[0]?.agentSnapshot.versionNote).toBeUndefined();
  });

  it("migrates format 3 through format 4 without losing editor, chat, or test work", () => {
    const old = structuredClone(freshSeed()) as unknown as {
      formatVersion: number;
      agents: Array<{ versions: Array<Record<string, unknown>> }>;
      workingCopies: { versions: Record<string, Record<string, unknown>> };
      ui: Record<string, unknown>;
      chat: { composerText: string };
      testSessions: Array<{ name: string; agentSnapshot: Record<string, unknown> }>;
    };
    old.formatVersion = 3;
    delete old.ui.focusMode;
    old.chat.composerText = "Keep this chat draft";
    const draft = structuredClone(old.agents[2]!.versions[1]!);
    draft.mainInstructions = "Keep this working copy";
    old.workingCopies.versions["playful-v2"] = draft;
    for (const agent of old.agents)
      for (const version of agent.versions) delete version.versionNote;
    delete old.workingCopies.versions["playful-v2"]!.versionNote;
    old.testSessions.push({
      name: "Keep this test",
      agentSnapshot: structuredClone(old.agents[2]!.versions[1]!),
    });
    const result = loadState({ getItem: () => JSON.stringify(old) }).state!;
    expect(result.formatVersion).toBe(4);
    expect(result.ui.focusMode).toBe(false);
    expect(result.chat.composerText).toBe("Keep this chat draft");
    expect(result.workingCopies.versions["playful-v2"]?.mainInstructions).toBe("Keep this working copy");
    expect(result.workingCopies.versions["playful-v2"]?.versionNote).toBe("");
    expect(result.testSessions[0]?.name).toBe("Keep this test");
    expect(result.testSessions[0]?.agentSnapshot.versionNote).toBeUndefined();
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
