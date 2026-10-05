import { describe, expect, it } from "vitest";
import { CASES, type Persona } from "@/lib/contracts/experiment-runner";
import { parsePageProposal } from "@/lib/contracts/experiment-pages";

const id = (number: number) => `00000000-0000-4000-8000-${number.toString().padStart(12, "0")}`;
const reference = () => ({ subjectKind: "character", subjectId: id(1), artifactVersionId: id(2), assetId: id(3) });
const panel = (panelKey: string) => ({ panelKey, manuscriptUnitIds: [id(4)], textCapacity: 40, liveTextSafeRegion: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, sheetReferences: [reference()], deferredCompositionDecisions: [] });
const typographyKinds = ["narration", "speech", "thought", "sound_effect", "title", "credit", "diegetic"] as const;
const typography = () => typographyKinds.map((kind) => ({ kind, fontDirection: "legible", sizeHierarchy: "primary", containerTreatment: "clear", placementRules: "safe region" }));
const margins = () => ({ top: 2, right: 2, bottom: 2, left: 2, unit: "mm" });

function layout(persona: Persona) {
  const pages = Array.from({ length: CASES[persona].storyPages + 1 }, (_, pageIndex) => ({
    pageIndex,
    pageTurnRhythm: "pause",
    panels: [panel("a")],
  }));
  if (persona === "enthusiast_parent") pages[2].panels.push(panel("b"));
  if (persona === "professional_creator") {
    pages[2].panels.push(panel("b"));
    pages[4].panels.push(panel("b"));
  }
  return {
    schemaVersion: "2", title: "Book", canvas: {
      trim: { width: 200, height: 200, unit: "mm" }, orientation: "square", aspectRatio: { width: 1, height: 1 },
      workingPixels: { width: 2048, height: 2048 }, bleed: margins(),
      binding: { edge: "left", allowance: 4, unit: "mm" }, liveTextSafeMargins: margins(), readingDirection: "left_to_right",
    }, typography: typography(), pages, deferredCompositionDecisions: [], approvalQuestions: [],
  };
}

function subject() {
  return {
    schemaVersion: "2", pageId: id(10), pageIndex: 0, layoutVersionId: id(11), manuscriptVersionId: id(12), styleVersionId: id(13),
    panels: [{ panelKey: "a", manuscriptUnitIds: [id(4)], sheetReferences: [reference()], actionBeat: "Reach", emotionalBeat: "Hope",
      composition: "Wide", characterIds: [id(1)], locationIds: [], noText: false,
      lettering: [{ kind: "title", text: "  Exact title  ", form: "display", speakerEntityId: null as string | null, panelKey: "a", placement: "top", typographyTreatment: "large", bubbleTreatment: "none" }],
    }], reviewQuestions: [],
  };
}

describe("J11 and J12 local page contracts", () => {
  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("accepts the %s fixed case", (persona) => {
    expect(parsePageProposal("J11", persona, layout(persona)).content.pages).toHaveLength(CASES[persona].storyPages + 1);
  });

  it("requires ordered cover and story pages with persona panel counts", () => {
    const duplicate = layout("playful_kid"); duplicate.pages[1].pageIndex = 0;
    expect(() => parsePageProposal("J11", "playful_kid", duplicate)).toThrow();
    const missing = layout("playful_kid"); missing.pages.pop();
    expect(() => parsePageProposal("J11", "playful_kid", missing)).toThrow();
    const kidMulti = layout("playful_kid"); kidMulti.pages[1].panels.push(panel("b"));
    expect(() => parsePageProposal("J11", "playful_kid", kidMulti)).toThrow();
    const parent = layout("enthusiast_parent"); parent.pages[2].panels.pop();
    expect(() => parsePageProposal("J11", "enthusiast_parent", parent)).toThrow();
    const creator = layout("professional_creator"); creator.pages[4].panels.pop();
    expect(() => parsePageProposal("J11", "professional_creator", creator)).toThrow();
  });

  it("checks canvas geometry, safe regions and J12 page range", () => {
    const fractional = layout("playful_kid"); fractional.canvas.trim.width = 200.5;
    fractional.canvas.trim.height = 200.5;
    expect(() => parsePageProposal("J11", "playful_kid", fractional)).not.toThrow();
    fractional.canvas.workingPixels.width = 1000;
    expect(() => parsePageProposal("J11", "playful_kid", fractional)).toThrow();
    const region = layout("playful_kid"); region.pages[0].panels[0].liveTextSafeRegion.x = 0.5;
    expect(() => parsePageProposal("J11", "playful_kid", region)).toThrow();
    const outOfRange = subject(); outOfRange.pageIndex = 4;
    expect(() => parsePageProposal("J12", "playful_kid", outOfRange)).toThrow();
  });

  it("requires every canvas and typography field", () => {
    for (const key of Object.keys(layout("playful_kid").canvas)) {
      const candidate = structuredClone(layout("playful_kid"));
      Reflect.deleteProperty(candidate.canvas, key);
      expect(() => parsePageProposal("J11", "playful_kid", candidate), key).toThrow();
    }
    for (const key of Object.keys(typography()[0])) {
      const candidate = structuredClone(layout("playful_kid"));
      Reflect.deleteProperty(candidate.typography[0], key);
      expect(() => parsePageProposal("J11", "playful_kid", candidate), key).toThrow();
    }
  });

  it("rejects duplicate panel and reference identities", () => {
    const duplicatePanel = layout("enthusiast_parent"); duplicatePanel.pages[2].panels[1].panelKey = "a";
    expect(() => parsePageProposal("J11", "enthusiast_parent", duplicatePanel)).toThrow();
    const duplicateReference = subject(); duplicateReference.panels[0].sheetReferences.push(reference());
    expect(() => parsePageProposal("J12", "playful_kid", duplicateReference)).toThrow();
  });

  it("preserves exact lettering and requires every lettering field", () => {
    expect(parsePageProposal("J12", "playful_kid", subject()).content.panels[0].lettering[0].text).toBe("  Exact title  ");
    for (const key of Object.keys(subject().panels[0].lettering[0])) {
      const candidate = structuredClone(subject());
      Reflect.deleteProperty(candidate.panels[0].lettering[0], key);
      expect(() => parsePageProposal("J12", "playful_kid", candidate), key).toThrow();
    }
  });

  it("requires panel source routing and explicit no-text", () => {
    for (const key of ["manuscriptUnitIds", "sheetReferences", "actionBeat", "emotionalBeat", "composition", "characterIds", "locationIds", "noText"] as const) {
      const candidate = structuredClone(subject());
      Reflect.deleteProperty(candidate.panels[0], key);
      expect(() => parsePageProposal("J12", "playful_kid", candidate), key).toThrow();
    }
    const textFree = subject(); textFree.pageIndex = 1; textFree.panels[0].lettering = []; textFree.panels[0].noText = true;
    expect(parsePageProposal("J12", "playful_kid", textFree).content.panels[0].noText).toBe(true);
    textFree.panels[0].noText = false;
    expect(() => parsePageProposal("J12", "playful_kid", textFree)).toThrow();
  });

  it("permits a source-free title-only cover but requires native title instructions", () => {
    const cover = subject();
    cover.panels[0].characterIds = [];
    cover.panels[0].sheetReferences = [];
    cover.panels[0].manuscriptUnitIds = [];
    expect(() => parsePageProposal("J12", "playful_kid", cover)).not.toThrow();
    cover.panels[0].lettering = [];
    cover.panels[0].noText = true;
    expect(() => parsePageProposal("J12", "playful_kid", cover)).toThrow(/title/);
    const plan = layout("playful_kid");
    plan.pages[0].panels[0].manuscriptUnitIds = [];
    plan.pages[0].panels[0].sheetReferences = [];
    expect(() => parsePageProposal("J11", "playful_kid", plan)).not.toThrow();
  });

  it("matches sheet subjects to panel subjects and speech speakers", () => {
    const missingReference = subject(); missingReference.panels[0].sheetReferences = [];
    expect(() => parsePageProposal("J12", "playful_kid", missingReference)).toThrow();
    const unrelated = subject(); unrelated.panels[0].sheetReferences[0].subjectId = id(99);
    expect(() => parsePageProposal("J12", "playful_kid", unrelated)).toThrow();
    const dialogue = subject(); dialogue.pageIndex = 1; dialogue.panels[0].lettering[0].kind = "speech";
    expect(() => parsePageProposal("J12", "playful_kid", dialogue)).toThrow();
    dialogue.panels[0].lettering[0].speakerEntityId = id(1);
    expect(() => parsePageProposal("J12", "playful_kid", dialogue)).not.toThrow();
  });

  it("bounds size and depth, warns on preference, and strips harmless extras", () => {
    const candidate = subject() as ReturnType<typeof subject> & { harmless?: string };
    candidate.harmless = "ignored";
    candidate.panels[0].actionBeat = "x".repeat(2_001);
    const parsed = parsePageProposal("J12", "playful_kid", candidate);
    expect(parsed.warnings.some((item) => item.field === "panels.0.actionBeat")).toBe(true);
    expect("harmless" in parsed.content).toBe(false);
    candidate.panels[0].actionBeat = "x".repeat(16_001);
    expect(() => parsePageProposal("J12", "playful_kid", candidate)).toThrow();
    let deep: unknown = subject();
    for (let i = 0; i < 22; i++) deep = { wrapper: deep };
    expect(() => parsePageProposal("J12", "playful_kid", deep)).toThrow(/depth/);
    const oversized = layout("playful_kid");
    Reflect.set(oversized, "deferredCompositionDecisions", Array(100).fill("x".repeat(6_000)));
    expect(() => parsePageProposal("J11", "playful_kid", oversized)).toThrow(/512 KiB/);
  });
});
