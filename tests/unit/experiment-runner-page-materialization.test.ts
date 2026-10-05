import { describe, expect, it, vi } from "vitest";
import { CASES, type Persona } from "@/lib/contracts/experiment-runner";
import { materializePageLayout } from "@/db/experiment-pages";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const personas = ["playful_kid", "enthusiast_parent", "professional_creator"] as const;
function layout(persona: Persona) {
  const panel = (panelKey: string) => ({ panelKey, manuscriptUnitIds: [id(4)], textCapacity: 40,
    liveTextSafeRegion: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, sheetReferences: [], deferredCompositionDecisions: [] });
  const pages = Array.from({ length: CASES[persona].storyPages + 1 }, (_, pageIndex) => ({ pageIndex, pageTurnRhythm: "pause", panels: [panel("a")] }));
  if (persona === "enthusiast_parent") pages[2].panels.push(panel("b"));
  if (persona === "professional_creator") { pages[2].panels.push(panel("b")); pages[4].panels.push(panel("b")); }
  const margins = { top: 2, right: 2, bottom: 2, left: 2, unit: "mm" };
  return { schemaVersion: "2", title: "Book", canvas: {
    trim: { width: 200, height: 200, unit: "mm" }, orientation: "square", aspectRatio: { width: 1, height: 1 },
    workingPixels: { width: 2048, height: 2048 }, bleed: margins,
    binding: { edge: "left", allowance: 4, unit: "mm" }, liveTextSafeMargins: margins, readingDirection: "left_to_right",
  }, typography: ["narration", "speech", "thought", "sound_effect", "title", "credit", "diegetic"].map((kind) => ({
    kind, fontDirection: "legible", sizeHierarchy: "primary", containerTreatment: "clear", placementRules: "safe region",
  })), pages, deferredCompositionDecisions: [], approvalQuestions: [] };
}

describe("J11 page identity materialization", () => {
  it.each(personas)("allocates %s cover and story IDs once, then preserves them through revision", (persona) => {
    const allocator = vi.fn().mockImplementation(() => id(100 + allocator.mock.calls.length));
    const first = materializePageLayout(persona, layout(persona), null, allocator);
    const count = CASES[persona].storyPages + 1;
    expect(first.pages.map((page) => page.pageId)).toEqual(Array.from({ length: count }, (_, n) => id(101 + n)));
    expect(allocator).toHaveBeenCalledTimes(count);
    const revised = layout(persona);
    revised.pages[1].pageTurnRhythm = "quicker";
    revised.pages[1].panels[0].textCapacity = 30;
    const second = materializePageLayout(persona, revised, JSON.parse(JSON.stringify(first)), allocator);
    expect(second.pages.map((page) => page.pageId)).toEqual(first.pages.map((page) => page.pageId));
    expect(second.pages[1].pageTurnRhythm).toBe("quicker");
    expect(allocator).toHaveBeenCalledTimes(count);
  });

  it("ignores specialist-supplied page IDs", () => {
    const proposal = layout("playful_kid");
    const supplied = { ...proposal, pages: proposal.pages.map((page) => ({ ...page, pageId: id(999) })) };
    let next = 77;
    const stored = materializePageLayout("playful_kid", supplied, null, () => id(next++));
    expect(stored.pages.map((page) => page.pageId)).toEqual([id(77), id(78), id(79), id(80)]);
  });

  it("fails malformed prior mappings before allocating replacements", () => {
    const persona = "playful_kid", proposal = layout(persona);
    const first = materializePageLayout(persona, proposal, null, (() => { let n = 0; return () => id(++n); })());
    const allocate = vi.fn(() => id(99));
    const bad = [
      { ...first, pages: first.pages.slice(1) },
      { ...first, pages: [...first.pages.slice(0, -1), first.pages[0]] },
      { ...first, pages: first.pages.map((page, n) => n === 1 ? { ...page, pageId: first.pages[0].pageId } : page) },
      { ...first, pages: first.pages.map((page, n) => n === 1 ? { ...page, pageId: undefined } : page) },
    ];
    for (const previous of bad) expect(() => materializePageLayout(persona, proposal, previous, allocate)).toThrow();
    expect(allocate).not.toHaveBeenCalled();
  });

  it("rejects duplicate allocator identities", () => {
    expect(() => materializePageLayout("playful_kid", layout("playful_kid"), null, () => id(10))).toThrow();
  });
});
