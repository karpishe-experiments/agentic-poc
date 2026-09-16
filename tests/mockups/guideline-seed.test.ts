import { describe, expect, it } from "vitest";
import manifest from "@/lib/mockups/specialty-management/guideline-manifest.json";
import { freshSeed } from "@/lib/mockups/specialty-management/state";

describe("guideline-based Agent Studio seed", () => {
  it("covers every pinned source with one specialty and a two-version agent", () => {
    const state = freshSeed();
    expect(manifest.commit).toBe("631f547ec3f7ce375f740dd6f2b1b9aaebbde940");
    expect(manifest.guidelines).toHaveLength(15);
    expect(new Set(manifest.guidelines.map((item) => item.sourcePath)).size).toBe(15);
    expect(state.specialties).toHaveLength(15);
    expect(state.agents).toHaveLength(15);
    for (const source of manifest.guidelines) {
      const specialty = state.specialties.find((item) => item.id === source.specialtyId);
      const agent = state.agents.find((item) => item.id === source.agentId);
      expect(specialty).toBeDefined();
      expect(agent?.specialtyId).toBe(specialty?.id);
      expect(agent?.versions.map((item) => item.status)).toEqual(["confirmed", "draft"]);
      expect(agent?.versions.every((version) => version.mainInstructions.includes("## Purpose"))).toBe(true);
    }
  });
});
