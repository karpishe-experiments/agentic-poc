import { describe, expect, it } from "vitest";
import { freshSeed, isMockupState, loadState, saveState, STORAGE_KEY } from "@/lib/mockups/specialty-management/state";

describe("mockup state", () => {
  it("starts an independent directory generation", () => {
    const state = freshSeed();
    expect(STORAGE_KEY).toBe("specialty-management-mockup:v2");
    expect(state.ui.selection).toEqual({ kind: "directory" });
    expect(state).not.toHaveProperty("testSessions");
    expect(state).not.toHaveProperty("booklets");
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

  it("removes obsolete testing state without resetting edits", () => {
    const legacy = freshSeed() as unknown as Record<string, unknown>;
    legacy.testSessions = [{ id: "session" }];
    legacy.pendingTestResponse = { id: "pending" };
    legacy.booklets = [{ id: "booklet" }];
    legacy.taskCatalog = [{ id: "task" }];
    (legacy.ui as Record<string, unknown>).testSetup = { bookletId: "booklet" };
    (legacy.ui as Record<string, unknown>).selection = { kind: "test-history" };
    const loaded = loadState({ getItem: () => JSON.stringify(legacy) }).state!;
    expect(loaded.ui.selection).toEqual({ kind: "directory" });
    expect(loaded.agents).toHaveLength(15);
    expect(loaded).not.toHaveProperty("testSessions");
    expect(loaded).not.toHaveProperty("booklets");
  });

  it("reports malformed and unwritable storage", () => {
    expect(loadState({ getItem: () => "{" }).error).toMatch(/could not/);
    expect(saveState({ setItem: () => { throw new Error("quota"); } }, freshSeed())).toMatch(/cannot be retained/);
  });
});
