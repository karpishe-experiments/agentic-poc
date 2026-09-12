import { describe, expect, it } from "vitest";
import { freshSeed, isMockupState, loadState, saveState, STORAGE_KEY } from "@/lib/mockups/specialty-management/state";

describe("mockup state", () => {
  it("seeds the format-2 document and one inspectable synthetic failure", () => {
    const state = freshSeed();
    expect(state.formatVersion).toBe(2);
    expect(state.chat.messages.some((message) => message.id === "seeded-synthetic-failure")).toBe(true);
  });

  it("migrates version-1 editor data without adding the seeded failure", () => {
    const old = structuredClone(freshSeed()) as unknown as { formatVersion: number; chat: object };
    old.formatVersion = 1;
    old.chat = { messages: [], proposals: [], pendingResponse: null };
    const result = loadState({ getItem: () => JSON.stringify(old) });
    expect(result.error).toBeNull();
    expect(result.state?.formatVersion).toBe(2);
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

  it("reports malformed and unwritable storage", () => {
    expect(loadState({ getItem: () => "{" }).error).toMatch(/could not/);
    expect(saveState({ setItem: () => { throw new Error("quota"); } }, freshSeed())).toMatch(/cannot be retained/);
  });
});
