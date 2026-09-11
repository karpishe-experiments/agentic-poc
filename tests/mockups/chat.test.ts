import { describe, expect, it } from "vitest";
import {
  getTarget,
  selectedTarget,
  simulateSuggestion,
  writeTarget,
} from "@/lib/mockups/specialty-management/chat";
import { finishPendingResponse } from "@/components/mockups/specialty-management/chat-panel";
import { freshSeed } from "@/lib/mockups/specialty-management/state";

describe("simulated chat", () => {
  it("applies deterministic transforms", () => {
    expect(
      simulateSuggestion("# Rule\nFirst line\nSecond line", "make concise"),
    ).toBe("# Rule\n\nFirst line");
    expect(
      simulateSuggestion("# Rule\nDo one\nDo two", "numbered checklist"),
    ).toContain("2. Do two");
    expect(simulateSuggestion("Rule", "add example")).toContain("## Example");
    expect(simulateSuggestion("Rule", "mention tone")).toContain(
      "mention tone",
    );
  });
  it("reads and writes only the captured target", () => {
    const state = freshSeed();
    const target = selectedTarget(state)!;
    const found = getTarget(state, target)!;
    writeTarget(found.version, target, "Changed");
    expect(getTarget(state, target)?.text).toBe("Changed");
    expect(
      state.agents.find((item) => item.id === "agent-playful")?.versions[0]
        ?.mainInstructions,
    ).not.toBe("Changed");
  });
  it("reports an unavailable completion when its captured target was deleted", () => {
    const state = freshSeed();
    const target = selectedTarget(state)!;
    state.chat.pendingResponse = {
      id: "pending",
      target,
      request: "Add an example",
      baseText: "Before",
      inputText: "Before",
    };
    state.agents.find((item) => item.id === target.agentId)!.versions = [];
    expect(finishPendingResponse(state)).toBe("unavailable");
    expect(state.chat.proposals[0]?.status).toBe("unavailable");
  });
});
