import { describe, expect, it } from "vitest";
import { CASES, type Persona } from "@/lib/contracts/experiment-runner";
import { materializePageLayout } from "@/db/experiment-pages";
import { simulatePaginationProposal } from "@/lib/experiment-runner/pagination-fixtures";
import { configuredPageBibleTask, parsePageBibleForLayout } from "@/lib/experiment-runner/page-bible-tasks";
import { id, paginationSources } from "@/tests/helpers/pagination-fixtures";

function setup(persona: Persona, pageIndex: number) {
  const result = simulatePaginationProposal({ persona, sources: paginationSources(persona) });
  if (result.kind !== "proposal") throw new Error("Expected layout proposal.");
  let next = 100;
  const layout = materializePageLayout(persona, result.content, null, () => id(next++));
  const page = layout.pages[pageIndex];
  const proposal = {
    schemaVersion: "2", pageId: page.pageId, pageIndex, layoutVersionId: id(90), manuscriptVersionId: id(5), styleVersionId: id(8),
    panels: page.panels.map((panel, index) => ({
      panelKey: panel.panelKey, manuscriptUnitIds: [...panel.manuscriptUnitIds], sheetReferences: [...panel.sheetReferences],
      actionBeat: "Action", emotionalBeat: "Wonder", composition: "Wide view", characterIds: panel.sheetReferences.filter((ref) => ref.subjectKind === "character").map((ref) => ref.subjectId),
      locationIds: panel.sheetReferences.filter((ref) => ref.subjectKind === "location").map((ref) => ref.subjectId),
      lettering: pageIndex === 0 && index === 0 ? [{ kind: "title", text: "  Story title  ", form: "display", speakerEntityId: null, panelKey: panel.panelKey,
        placement: "Top", typographyTreatment: "Large", bubbleTreatment: "None" }] : [],
      noText: pageIndex !== 0 || index !== 0,
    })), reviewQuestions: [],
  };
  const input = { persona, pageId: page.pageId, layout, layoutVersionId: id(90), manuscriptVersionId: id(5), styleVersionId: id(8), proposal };
  return { input, page, proposal };
}

describe("J12 pure page preparation", () => {
  for (const persona of ["playful_kid", "enthusiast_parent", "professional_creator"] as const) {
    it(`binds all ${CASES[persona].storyPages + 1} ${persona} pages, including cover`, () => {
      for (let pageIndex = 0; pageIndex <= CASES[persona].storyPages; pageIndex++) {
        const { input, page } = setup(persona, pageIndex);
        const parsed = parsePageBibleForLayout(input);
        expect(parsed.content.pageId).toBe(page.pageId);
        expect(parsed.content.panels.map((panel) => panel.panelKey)).toEqual(page.panels.map((panel) => panel.panelKey));
        expect(parsed.dependencyVersionIds).toEqual([...new Set([id(90), id(5), id(8), ...page.panels.flatMap((panel) => panel.sheetReferences)
          .sort((a, b) => a.subjectKind.localeCompare(b.subjectKind) || a.subjectId.localeCompare(b.subjectId))
          .map((ref) => ref.artifactVersionId)])]);
        if (pageIndex === 0) expect(parsed.content.panels[0].lettering[0].text).toBe("  Story title  ");
        else expect(parsed.content.panels.every((panel) => panel.noText && panel.lettering.length === 0)).toBe(true);
      }
    });
  }

  it("allows routing array order changes but preserves lettering order and whitespace", () => {
    const { input, proposal } = setup("enthusiast_parent", 3);
    const first = proposal.panels[0];
    first.manuscriptUnitIds.reverse(); first.sheetReferences.reverse();
    first.characterIds.reverse();
    first.lettering = ["  First  ", "Second "].map((text) => ({ kind: "narration", text, form: "caption", speakerEntityId: null,
      panelKey: first.panelKey, placement: "Bottom", typographyTreatment: "Plain", bubbleTreatment: "None" }));
    first.noText = false;
    const parsed = parsePageBibleForLayout(input);
    expect(parsed.content.panels[0].lettering.map((item) => item.text)).toEqual(["  First  ", "Second "]);
    expect(parsed.dependencyVersionIds).toEqual(parsePageBibleForLayout({ ...input, proposal: { ...proposal,
      panels: proposal.panels.map((panel, index) => index === 0 ? { ...panel, sheetReferences: [...panel.sheetReferences].reverse() } : panel) } }).dependencyVersionIds);
  });

  it("recognizes only complete J12 public and saved profiles", () => {
    const idFor = (n: number) => id(n + 500);
    const base = [
      { role: "manager", taskId: null, persona: null },
      ...Array.from({ length: 12 }, (_, n) => ({ role: "specialist", taskId: `J${String(n + 1).padStart(2, "0")}`, persona: null })),
      ...(["playful_kid", "enthusiast_parent", "professional_creator"] as const).map((persona) => ({ role: "tester", taskId: null, persona })),
      { role: "image", taskId: null, persona: null },
    ].map((row, n) => ({ ...row, appId: idFor(n), publishedWorkflowId: idFor(n + 30) }));
    const saved = base.filter((row) => row.role !== "tester" || row.persona === "playful_kid")
      .map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "persona")));
    expect(configuredPageBibleTask(JSON.stringify(base))).toBe(true);
    expect(configuredPageBibleTask(JSON.stringify(saved))).toBe(true);
    expect(configuredPageBibleTask(JSON.stringify(base.filter((row) => row.taskId !== "J12")))).toBe(false);
    expect(configuredPageBibleTask(JSON.stringify(base.map((row) => row.taskId === "J12" ? { ...row, taskId: "J10" } : row)))).toBe(false);
    expect(configuredPageBibleTask(JSON.stringify(base.map((row) => row.taskId === "J12" ? { ...row, appId: base[0].appId } : row)))).toBe(false);
    expect(configuredPageBibleTask(JSON.stringify(base.map((row) => row.role === "image" ? { ...row, taskId: "J12" } : row)))).toBe(false);
  });

  it("rejects mismatched identity, versions, panel order and routing", () => {
    const { input, proposal } = setup("enthusiast_parent", 3);
    expect(() => parsePageBibleForLayout({ ...input, pageId: id(999) })).toThrow("not in");
    expect(() => parsePageBibleForLayout({ ...input, proposal: { ...proposal, pageId: id(999) } })).toThrow("identity");
    expect(() => parsePageBibleForLayout({ ...input, proposal: { ...proposal, pageIndex: 2 } })).toThrow("identity");
    expect(() => parsePageBibleForLayout({ ...input, proposal: { ...proposal, layoutVersionId: id(91) } })).toThrow("source versions");
    expect(() => parsePageBibleForLayout({ ...input, proposal: { ...proposal, manuscriptVersionId: id(91) } })).toThrow("source versions");
    expect(() => parsePageBibleForLayout({ ...input, proposal: { ...proposal, styleVersionId: id(91) } })).toThrow("source versions");
    expect(() => parsePageBibleForLayout({ ...input, proposal: { ...proposal, panels: [...proposal.panels].reverse() } })).toThrow("panel order");
    const unit = structuredClone(proposal); unit.panels[0].manuscriptUnitIds = [id(999)];
    expect(() => parsePageBibleForLayout({ ...input, proposal: unit })).toThrow("manuscript routing");
    const reference = structuredClone(proposal); reference.panels[0].sheetReferences[0].assetId = id(999);
    expect(() => parsePageBibleForLayout({ ...input, proposal: reference })).toThrow("sheet routing");
    const missing = structuredClone(proposal); missing.panels[0].sheetReferences.pop();
    expect(() => parsePageBibleForLayout({ ...input, proposal: missing })).toThrow();
    const extra = structuredClone(proposal); extra.panels[0].sheetReferences.push({ ...extra.panels[0].sheetReferences[0], subjectId: id(999), assetId: id(998) });
    expect(() => parsePageBibleForLayout({ ...input, proposal: extra })).toThrow();
    const duplicate = structuredClone(proposal); duplicate.panels[0].sheetReferences.push(duplicate.panels[0].sheetReferences[0]);
    expect(() => parsePageBibleForLayout({ ...input, proposal: duplicate })).toThrow();
  });
});
