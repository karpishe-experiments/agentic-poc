import { describe, expect, it } from "vitest";
import { simulatePaginationProposal } from "@/lib/experiment-runner/pagination-fixtures";
import { CASES } from "@/lib/contracts/experiment-runner";
import { id, paginationSources as sources } from "@/tests/helpers/pagination-fixtures";

describe("simulated J11 layout", () => {
  for (const persona of ["playful_kid", "enthusiast_parent", "professional_creator"] as const) {
    it(`routes every manuscript unit and relevant sheet for ${persona}`, () => {
      const result = simulatePaginationProposal({ persona, sources: sources(persona) });
      if (result.kind !== "proposal") throw new Error("Expected proposal.");
      const pages = result.content.pages;
      expect(pages).toHaveLength(CASES[persona].storyPages + 1);
      expect(pages[0].pageIndex).toBe(0);
      expect(pages[0].panels[0].manuscriptUnitIds).toEqual([]);
      expect(pages[0].panels[0].sheetReferences).toEqual([]);
      const story = pages.slice(1);
      expect(new Set(story.flatMap((page) => page.panels.flatMap((panel) => panel.manuscriptUnitIds)))).toEqual(new Set([id(30), id(31), id(32), id(33), id(34)]));
      expect(story.filter((page) => page.panels.length > 1)).toHaveLength(persona === "playful_kid" ? 0 : persona === "enthusiast_parent" ? 1 : 2);
      expect(story.flatMap((page) => page.panels).every((panel) => panel.manuscriptUnitIds.length > 0 && panel.sheetReferences.length >= 3)).toBe(true);
      if (persona === "professional_creator") {
        const workshop = story.flatMap((page) => page.panels).filter((panel) => panel.manuscriptUnitIds.includes(id(33)));
        expect(workshop.every((panel) => panel.sheetReferences.some((ref) => ref.subjectId === id(21)) && !panel.sheetReferences.some((ref) => ref.subjectId === id(20)))).toBe(true);
      }
    });
  }

  it("keeps geometry on revision and refreshes routing after stale sources", () => {
    const original = simulatePaginationProposal({ persona: "playful_kid", sources: sources("playful_kid") });
    if (original.kind !== "proposal") throw new Error("Expected proposal.");
    const saved = { ...original.content, canvas: { ...original.content.canvas, workingPixels: { width: 1024, height: 1024 } },
      pages: original.content.pages.map((page) => ({ ...page, pageTurnRhythm: "Creator rhythm" })) };
    const revised = simulatePaginationProposal({ persona: "playful_kid", sources: sources("playful_kid"), currentContent: saved, revision: "Keep the opening quiet." });
    if (revised.kind !== "proposal") throw new Error("Expected proposal.");
    expect(revised.content.canvas).toEqual(saved.canvas);
    expect(revised.content.pages.map((page) => page.pageTurnRhythm)).toEqual(saved.pages.map((page) => page.pageTurnRhythm));
    expect(revised.content.deferredCompositionDecisions).toContain("Revision request: Keep the opening quiet.");
    const updated = sources("playful_kid");
    (updated.find((item) => item.taskId === "J09")!.content as { build: { assetId: string } }).build.assetId = id(99);
    const refreshed = simulatePaginationProposal({ persona: "playful_kid", sources: updated, currentContent: saved, sourceChanged: true });
    if (refreshed.kind !== "proposal") throw new Error("Expected proposal.");
    expect(refreshed.content.canvas).toEqual(saved.canvas);
    expect(refreshed.content.pages[1].panels[0].sheetReferences[0].assetId).toBe(id(99));
  });

  it("clarifies an unanswered material gap once and rejects missing sheets", () => {
    const approved = sources("playful_kid");
    const question = "Should the cover show the robot?";
    expect(simulatePaginationProposal({ persona: "playful_kid", sources: approved, materialQuestion: question })).toEqual({ kind: "clarification", question });
    expect(simulatePaginationProposal({ persona: "playful_kid", sources: approved, materialQuestion: question, answers: [`${question}: Yes.`] }).kind).toBe("proposal");
    expect(() => simulatePaginationProposal({ persona: "playful_kid", sources: approved.filter((item) => item.taskId !== "J10") })).toThrow("every approved character and location sheet");
  });
});
