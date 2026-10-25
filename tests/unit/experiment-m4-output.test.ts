import { describe, expect, it } from "vitest";
import { M4CreativeOutputError, parseM4CreativeOutput } from "@/lib/experiment-runner/m4-output";
import { styleModuleHash } from "@/lib/contracts/experiment-references";
import { m4TestId as id } from "@/tests/helpers/m4-policy";
import { simulatePaginationProposal } from "@/lib/experiment-runner/pagination-fixtures";
import { paginationSources } from "@/tests/helpers/pagination-fixtures";
import { M4_LAYOUT_CONTRACT, projectM4Context } from "@/lib/experiment-runner/m4-request";
import { parsePageProposal } from "@/lib/contracts/experiment-pages";

const style = { schemaVersion: "2", title: "Warm ink", styleDefinition: { mediumAndLineWork: "ink", shapeLanguageAndProportions: "round",
  colourAndContrast: "warm", textureAndRendering: "paper", lightingAndAtmosphere: "sunny", emotionalTone: "hopeful", accessibilityAndReadability: "clear" },
  typographyDirection: "clear", speechAndThoughtBubbleDirection: "round", stylePromptModule: "Warm ink and paper", exclusions: [], approvalQuestions: [],
  samplePlan: [{ sampleKey: "sample_1", purpose: "character" }, { sampleKey: "sample_2", purpose: "location" }] };
const assembledStyle = { ...style, stylePromptModuleHash: styleModuleHash(style.stylePromptModule), draftStyleVersionId: id(1),
  samples: style.samplePlan.map((sample, index) => ({ ...sample, build: { prompt: style.stylePromptModule,
    stylePromptModuleHash: styleModuleHash(style.stylePromptModule), operationId: id(index + 2), assetId: id(index + 4), sourceVersionIds: [id(1), id(6)] } })) };
const character = (characterId: string) => ({ characterId, nameOrRole: "Friend", narrativeFunction: "Helper", background: "Local", lifeStage: "Child",
  physicalDescription: "Short hair", personalityAndActing: "Curious", attireRequirements: ["Blue coat"], accessories: ["Bag"], expressions: [], openQuestions: [],
  unitIds: [id(7)], recurrence: "recurring", sheetRequired: true });
const sheetCreative = { schemaVersion: "2", title: "Character", sheetPromptModule: "The approved character", reviewQuestions: [],
  characterDesignProfile: "Curious child", additionalExpressions: ["joy", "concern", "relief"] };
const selector = { role: "specialist" as const, taskId: "J09" as const, persona: "playful_kid" as const, report: false };
const context = { role: "specialist", subjectId: id(8), approvedSources: [
  { id: id(9), taskId: "J06", content: { schemaVersion: "2", title: "Friends", characters: [character(id(8)), character(id(10))],
    profileGuidance: [], representationAndContinuity: [], approvalQuestions: [] } },
  { id: id(11), taskId: "J08", content: assembledStyle },
] };
const proposal = (taskId: string, content: unknown) => JSON.stringify({ result: { kind: "proposal", payload: { taskId, content } } });

describe("M4 trusted creative output assembly", () => {
  it("retains manuscript evidence while preserving the creator's resolved J09 design", () => {
    const attire = "No specific clothing is established in the approved manuscript; keep attire practical and consistent across the observatory dome and attached workshop.";
    const saved = structuredClone(context);
    const final = saved.approvedSources[0].content as typeof context.approvedSources[0]["content"] & { characters: ReturnType<typeof character>[] };
    final.characters[0].attireRequirements = [attire];
    const design = "Green sweater, cream shirt, dark trousers and glasses. Include the full-body side view.";
    const creative = { ...sheetCreative, characterDesignProfile: design, sheetPromptModule: design };
    for (const persona of ["playful_kid", "enthusiast_parent", "professional_creator"] as const) {
      const result = parseM4CreativeOutput({ ...selector, persona }, proposal("J09", creative), JSON.stringify(saved));
      expect(result).toMatchObject({ payload: { content: { attireRequirements: [attire], accessories: ["Bag"],
        characterDesignProfile: design, sheetPromptModule: design, requiredViews: ["front", "back", "side", "neutral_facial"] } } });
    }
  });
  it("distinguishes malformed model bytes from an unreadable saved context", () => {
    const manager = { role: "manager" as const, taskId: null, persona: "playful_kid" as const, report: false };
    const valid = JSON.stringify({ result: { kind: "delegate", payload: { taskId: "J01", subjectKind: "book", subjectId: id(1) } } });
    expect(() => parseM4CreativeOutput(manager, "{", "{}")).toThrow(M4CreativeOutputError);
    expect(() => parseM4CreativeOutput(manager, valid, "{")).toThrow(SyntaxError);
  });
  it("rejects the observed center-coordinate rectangles and Kid multi-panel layout without rewriting either", () => {
    const sources = paginationSources("playful_kid");
    const fixture = simulatePaginationProposal({ persona: "playful_kid", sources });
    if (fixture.kind !== "proposal") throw new Error("Expected deterministic layout");
    const layout = structuredClone(fixture.content);
    const savedContext = JSON.stringify({ role: "specialist", subjectId: id(1), approvedSources: sources });
    const layoutSelector = { ...selector, taskId: "J11" as const };
    for (const page of layout.pages) for (const panel of page.panels) panel.liveTextSafeRegion = { x: 0.5, y: 0.5, width: 1, height: 1 };
    const invalid = proposal("J11", layout);
    expect(() => parseM4CreativeOutput(layoutSelector, invalid, savedContext)).toThrow();
    expect(proposal("J11", layout)).toBe(invalid);
    const multi = structuredClone(fixture.content);
    multi.pages[1].panels.push({ ...multi.pages[1].panels[0], panelKey: "second" });
    expect(() => parsePageProposal("J11", "playful_kid", multi)).toThrow("single-scene");
    for (const persona of ["playful_kid", "enthusiast_parent", "professional_creator"] as const) {
      const valid = simulatePaginationProposal({ persona, sources: paginationSources(persona) });
      if (valid.kind !== "proposal") throw new Error("Expected valid layout");
      expect(() => parsePageProposal("J11", persona, valid.content)).not.toThrow();
    }
  });
  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("resolves %s layout subjects from saved approved sheets and preserves legacy output", persona => {
    const sources = paginationSources(persona);
    const fixture = simulatePaginationProposal({ persona, sources });
    if (fixture.kind !== "proposal") throw new Error("Expected layout");
    const layoutSelector = { ...selector, taskId: "J11" as const, persona };
    const legacy = { role: "specialist", subjectId: id(1), approvedSources: sources };
    const saved = projectM4Context(layoutSelector, legacy, id(2));
    expect(saved.layoutContract).toBe(M4_LAYOUT_CONTRACT);
    const creative = { ...fixture.content, pages: fixture.content.pages.map(page => ({ ...page,
      panels: page.panels.map(({ sheetReferences, ...panel }) => ({ ...panel,
        sheetSubjects: sheetReferences.map(({ subjectKind, subjectId }) => ({ subjectKind, subjectId })) })) })) };
    const bytes = proposal("J11", creative);
    expect(parseM4CreativeOutput(layoutSelector, bytes, JSON.stringify(saved))).toEqual(
      parseM4CreativeOutput(layoutSelector, proposal("J11", fixture.content), JSON.stringify(legacy)));
    expect(() => parseM4CreativeOutput(layoutSelector, bytes, JSON.stringify({ ...saved, layoutContract: "unknown" }))).toThrow("Unknown saved");
    // Compatibility never depends on a model-supplied marker or parse fallback.
    expect(() => parseM4CreativeOutput(layoutSelector, bytes, JSON.stringify(legacy))).toThrow(M4CreativeOutputError);
    expect(() => parseM4CreativeOutput(layoutSelector, proposal("J11", fixture.content), JSON.stringify(saved))).toThrow(M4CreativeOutputError);
    const invalid = (change: (panel: typeof creative.pages[number]["panels"][number]) => void) => {
      const copy = structuredClone(creative); change(copy.pages[1].panels[0]);
      expect(() => parseM4CreativeOutput(layoutSelector, proposal("J11", copy), JSON.stringify(saved))).toThrow(M4CreativeOutputError);
    };
    if (persona !== "playful_kid") {
      const repeatedPanel = structuredClone(creative);
      const page = repeatedPanel.pages.find(page => page.panels.length > 1)!;
      page.panels[1].panelKey = page.panels[0].panelKey;
      const legacyRepeated = structuredClone(fixture.content);
      const legacyPage = legacyRepeated.pages.find(page => page.panels.length > 1)!;
      legacyPage.panels[1].panelKey = legacyPage.panels[0].panelKey;
      expect(() => parseM4CreativeOutput(layoutSelector, proposal("J11", legacyRepeated), JSON.stringify(legacy))).toThrow(M4CreativeOutputError);
      expect(() => parseM4CreativeOutput(layoutSelector, proposal("J11", repeatedPanel), JSON.stringify(saved))).toThrow(M4CreativeOutputError);
    }
    invalid(panel => panel.sheetSubjects.push(panel.sheetSubjects[0]));
    invalid(panel => { panel.sheetSubjects[0].subjectId = id(999); });
    invalid(panel => { panel.sheetSubjects[0].subjectKind = "location"; });
    invalid(panel => Object.assign(panel, { sheetReferences: fixture.content.pages[1].panels[0].sheetReferences }));
    const sharedAsset = structuredClone(sources);
    const sheets = sharedAsset.filter(row => row.taskId === "J09");
    (sheets[1].content as { build: { assetId: string } }).build.assetId = (sheets[0].content as { build: { assetId: string } }).build.assetId;
    for (const corrupt of [
      sharedAsset, sources.filter(row => row.taskId !== "J09" && row.taskId !== "J10"),
      [...sources, sources.find(row => row.taskId === "J09")!],
      sources.map(row => row.taskId === "J09" ? { ...row, subjectKind: "location" } : row),
    ]) {
      expect(() => projectM4Context(layoutSelector, { ...legacy, approvedSources: corrupt }, id(2))).toThrow("catalog");
      try { parseM4CreativeOutput(layoutSelector, bytes, JSON.stringify({ ...saved, approvedSources: corrupt })); throw new Error("Expected catalog failure"); }
      catch (error) { expect(error).not.toBeInstanceOf(M4CreativeOutputError); expect(String(error)).toContain("catalog"); }
    }
    const mixedLegacy = structuredClone(fixture.content);
    Object.assign(mixedLegacy.pages[1].panels[0], { sheetSubjects: creative.pages[1].panels[0].sheetSubjects });
    expect(() => parseM4CreativeOutput(layoutSelector, proposal("J11", mixedLegacy), JSON.stringify(legacy))).toThrow(M4CreativeOutputError);
    const duplicate = structuredClone(fixture.content);
    duplicate.pages[1].panels[0].sheetReferences.push(duplicate.pages[1].panels[0].sheetReferences[0]);
    expect(() => parseM4CreativeOutput(layoutSelector, proposal("J11", duplicate), JSON.stringify(legacy))).toThrow(M4CreativeOutputError);
    expect(proposal("J11", creative)).toBe(bytes);
  });
  it("computes the style hash from exact creative bytes", () => {
    const result = parseM4CreativeOutput({ ...selector, taskId: "J08" }, proposal("J08", style), JSON.stringify({ ...context, approvedSources: [] }));
    expect(result).toMatchObject({ kind: "proposal", payload: { content: { stylePromptModuleHash: styleModuleHash(style.stylePromptModule) } } });
  });
  it("supplies approved sheet identity, attire, accessories, style and required views", () => {
    const result = parseM4CreativeOutput(selector, proposal("J09", sheetCreative), JSON.stringify(context));
    expect(result).toMatchObject({ kind: "proposal", payload: { taskId: "J09", content: { finalListVersionId: id(9), styleVersionId: id(11),
      characterId: id(8), attireRequirements: ["Blue coat"], accessories: ["Bag"], requiredViews: ["front", "back", "side", "neutral_facial"],
      stylePromptModuleHash: styleModuleHash(style.stylePromptModule) } } });
    expect(() => parseM4CreativeOutput(selector, proposal("J09", sheetCreative), JSON.stringify({ ...context, subjectId: id(99) }))).toThrow("not eligible");
    expect(() => parseM4CreativeOutput(selector, proposal("J09", sheetCreative), JSON.stringify({ ...context, approvedSources: [...context.approvedSources, context.approvedSources[0]] }))).toThrow("ambiguous");
  });
  it("supplies report identity and cost fields without claiming visual inspection", () => {
    const note = { status: "observed", explanation: "Text evidence" };
    const report = { summary: "Independent text review", intent: note, interaction: note, findings: [], consistency: { status: "not_assessed", explanation: "No image input" } };
    for (const role of ["tester", "judge"] as const) {
      const result = parseM4CreativeOutput({ ...selector, role, taskId: null, report: true }, JSON.stringify({ report }), JSON.stringify({ reportEvidence: {
        role, mode: "balanced", runId: id(1), configurationHash: "a".repeat(64), versionIds: [id(2)] } }));
      expect(result).toMatchObject({ kind: role === "judge" ? "assessment" : "feedback", payload: { role, mode: "balanced", runId: id(1),
        evidence: { versionIds: [id(2)], inspectedAssetIds: [] }, costEvidence: { status: "unavailable", actualUsd: null, estimatedUsd: null } } });
    }
  });
  it("fails malformed, wrong-task and truncated output without producing a result", () => {
    expect(() => parseM4CreativeOutput(selector, '{"result":', JSON.stringify(context))).toThrow();
    expect(() => parseM4CreativeOutput(selector, proposal("J10", sheetCreative), JSON.stringify(context))).toThrow();
    expect(() => parseM4CreativeOutput(selector, proposal("J09", { ...sheetCreative, additionalExpressions: [] }), JSON.stringify(context))).toThrow();
  });
});
