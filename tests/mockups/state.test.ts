import { describe, expect, it } from "vitest";
import { freshSeed, isMockupState, loadState, saveState, STORAGE_KEY } from "@/lib/mockups/specialty-management/state";
import { beginResponse } from "@/lib/mockups/specialty-management/chat";

describe("mockup state", () => {
  it("starts an independent current-format directory generation", () => {
    const state = freshSeed();
    expect(STORAGE_KEY).toBe("specialty-management-mockup:v2");
    expect(state.ui.selection).toEqual({ kind: "directory" });
    expect(state.schemaVersion).toBe(1);
    expect(state.chat.messages[0]?.metadata?.state).toBe("error");
  });

  it("persists current editing preferences", () => {
    const state = freshSeed();
    state.ui.navWidth = 300;
    state.chat.composerText = "Keep this request";
    let value = "";
    expect(saveState({ setItem: (_key, next) => { value = next; } }, state)).toBeNull();
    expect(isMockupState(JSON.parse(value))).toBe(true);
    const loaded = loadState({ getItem: () => value }).state!;
    expect(loaded.ui.navWidth).toBe(300);
    expect(loaded.chat.composerText).toBe("Keep this request");
  });

  it("resets malformed, incompatible, incomplete, and future state", () => {
    const cases = ["{", JSON.stringify({ schemaVersion: 0 }), JSON.stringify({ schemaVersion: 2 }), JSON.stringify({ schemaVersion: 1 })];
    for (const value of cases) {
      const loaded = loadState({ getItem: () => value });
      expect(loaded.recovered).toBe(true);
      expect(loaded.state.schemaVersion).toBe(1);
    }
  });

  it("recovers inaccessible storage and reports unwritable storage", () => {
    expect(loadState({ getItem: () => { throw new Error("blocked"); } }).recovered).toBe(true);
    expect(saveState({ setItem: () => { throw new Error("quota"); } }, freshSeed())).toMatch(/cannot be retained/);
  });

  it("recovers an interrupted current response once without migrating state", () => {
    const state = freshSeed();
    const target = { kind: "agent" as const, specialtyId: "sp-story", agentId: "agent-playful", versionId: "playful-v2", section: "instructions" as const };
    beginResponse(state, target, "Make this concise", (prefix) => `${prefix}-1`);
    const loaded = loadState({ getItem: () => JSON.stringify(state) }).state;
    expect(loaded.chat.pendingResponse).toBeNull();
    expect(loaded.chat.messages.filter((message) => message.metadata?.state === "interrupted")).toHaveLength(1);
  });
});
