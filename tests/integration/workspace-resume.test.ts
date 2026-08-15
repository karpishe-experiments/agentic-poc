import { describe, expect, it } from "vitest";
import { selectWorkspaceArtifact } from "@/lib/application/workspace-selection";

describe("workspace selection", () => {
  it("uses a valid artifact query across reloads and falls back to the persisted active stage", () => {
    const fallback = "audience_profile" as const;
    expect(selectWorkspaceArtifact({ artifact: "visual_bible" }, fallback)).toBe("visual_bible");
    expect(selectWorkspaceArtifact({ artifact: ["page_plan", "story_plan"] }, fallback)).toBe("page_plan");
    expect(selectWorkspaceArtifact({ artifact: "not-a-stage" }, fallback)).toBe(fallback);
    expect(selectWorkspaceArtifact({}, fallback)).toBe(fallback);
  });
});
