import { describe, expect, it } from "vitest";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { styleModuleHash } from "@/lib/contracts/experiment-references";
import { materializePageLayout } from "@/db/experiment-pages";
import { simulatePaginationProposal } from "@/lib/experiment-runner/pagination-fixtures";
import { pageSourceRequest } from "@/lib/experiment-runner/page-image-requests";
import { id, paginationSources } from "@/tests/helpers/pagination-fixtures";

function setup(persona: "playful_kid" | "enthusiast_parent" | "professional_creator", pageIndex: number) {
  const result = simulatePaginationProposal({ persona, sources: paginationSources(persona) });
  if (result.kind !== "proposal") throw new Error("Expected layout proposal.");
  let next = 100;
  const layout = materializePageLayout(persona, result.content, null, () => id(next++));
  const page = layout.pages[pageIndex];
  const proposal = {
    schemaVersion: "2", pageId: page.pageId, pageIndex, layoutVersionId: id(90), manuscriptVersionId: id(5), styleVersionId: id(8),
    panels: page.panels.map((panel, index) => ({
      panelKey: panel.panelKey, manuscriptUnitIds: [...panel.manuscriptUnitIds], sheetReferences: [...panel.sheetReferences],
      actionBeat: `Action ${index + 1}`, emotionalBeat: "Wonder", composition: `Composition ${index + 1}`,
      characterIds: panel.sheetReferences.filter((reference) => reference.subjectKind === "character").map((reference) => reference.subjectId),
      locationIds: panel.sheetReferences.filter((reference) => reference.subjectKind === "location").map((reference) => reference.subjectId),
      lettering: pageIndex === 0 && index === 0 ? [{ kind: "title", text: "  Exact cover title  ", form: "display", speakerEntityId: null, panelKey: panel.panelKey,
        placement: "Top", typographyTreatment: "Large", bubbleTreatment: "None" }]
        : index === 0 ? [{ kind: "narration", text: "  Exact story words  ", form: "caption", speakerEntityId: null, panelKey: panel.panelKey,
          placement: "Bottom", typographyTreatment: "Clear", bubbleTreatment: "None" }] : [],
      noText: index !== 0,
    })), reviewQuestions: [],
  };
  const styleModule = "  keep ink texture\nkeep all spacing  \n";
  const visualStyleBase = {
    schemaVersion: "2", title: "Style", styleDefinition: { mediumAndLineWork: "ink", shapeLanguageAndProportions: "round", colourAndContrast: "warm",
      textureAndRendering: "paper", lightingAndAtmosphere: "soft", emotionalTone: "hopeful", accessibilityAndReadability: "clear" },
    typographyDirection: "legible", speechAndThoughtBubbleDirection: "rounded", stylePromptModule: styleModule,
    stylePromptModuleHash: styleModuleHash(styleModule), exclusions: ["watermarks"], approvalQuestions: [],
    draftStyleVersionId: id(81),
  };
  const visualStyle = {
    ...visualStyleBase,
    samples: (["sample_1", "sample_2"] as const).map((sampleKey, index) => ({
      sampleKey, purpose: `${sampleKey} purpose`, build: {
        prompt: `Sample ${index + 1}\n${styleModule}`,
        stylePromptModuleHash: styleModuleHash(styleModule), operationId: id(200 + index), assetId: id(210 + index),
        sourceVersionIds: [id(81), id(1)],
      },
    })),
  };
  return {
    input: { persona, pageId: page.pageId, layout, layoutVersionId: id(90), manuscriptVersionId: id(5), styleVersionId: id(8),
      pageBibleVersionId: id(91), pageBible: proposal, approvedVisualStyle: visualStyle },
    page, proposal, visualStyle, styleModule,
  };
}

describe("J13 page image request serialization", () => {
  it("serializes a cover and a multi-panel page with full layout and exact native text", () => {
    const cover = setup("playful_kid", 0);
    const coverRequest = pageSourceRequest(cover.input);
    expect(coverRequest.pageId).toBe(cover.page.pageId);
    expect(coverRequest.request.kind).toBe("page_source");
    expect(coverRequest.request.sourceVersionIds).toEqual([id(91), id(90), id(5), id(8)]);
    expect(coverRequest.request.prompt).toContain("  Exact cover title  ");
    expect(coverRequest.request.prompt).toContain(JSON.stringify(cover.input.layout.canvas));
    expect(coverRequest.request.prompt).toContain(JSON.stringify(cover.input.layout.typography));
    expect(coverRequest.request.prompt).toContain(cover.page.pageTurnRhythm);
    expect(coverRequest.request.prompt).toContain(JSON.stringify(cover.page.panels[0].liveTextSafeRegion));

    const multi = setup("enthusiast_parent", 3);
    const multiRequest = pageSourceRequest(multi.input);
    expect(multiRequest.pageIndex).toBe(3);
    expect(multiRequest.request.prompt).toContain("Panel 1 (panel_1).");
    expect(multiRequest.request.prompt).toContain("Panel 2 (panel_2).");
    expect(multiRequest.request.prompt).toContain("No text: true.");
  });

  it("uses selected J12 references once in panel order and preserves exact style bytes", () => {
    const { input, page, styleModule } = setup("professional_creator", 1);
    const result = pageSourceRequest(input);
    const expected = page.panels.flatMap((panel) => panel.sheetReferences);
    const distinct = expected.filter((reference, index, all) => all.findIndex((candidate) =>
      candidate.subjectKind === reference.subjectKind && candidate.subjectId === reference.subjectId &&
      candidate.artifactVersionId === reference.artifactVersionId && candidate.assetId === reference.assetId,
    ) === index);
    expect(result.references.map((reference) => ({
      subjectKind: reference.subjectKind, subjectId: reference.subjectId,
      artifactVersionId: reference.artifactVersionId, assetId: reference.assetId,
    }))).toEqual(distinct);
    expect(result.references).toHaveLength(distinct.length);
    expect(result.references.some((reference) => reference.subjectId === id(21))).toBe(false);
    expect(result.request.sourceVersionIds).not.toContain(id(56));
    expect(result.request.prompt).toContain(styleModule);
    expect(result.request.prompt).toContain("Shared style module begins. Use these exact instructions unchanged:\n" + styleModule + "\nShared style module ends.");
  });

  it("rejects mismatched source identities and invalid style proposals", () => {
    const { input, proposal, visualStyle } = setup("playful_kid", 1);
    expect(() => pageSourceRequest({ ...input, pageBible: { ...proposal, styleVersionId: id(92) } })).toThrow("source versions");
    expect(() => pageSourceRequest({ ...input, approvedVisualStyle: { ...visualStyle, stylePromptModuleHash: "0".repeat(64) } })).toThrow("hash");
    const invalidTextFlag = structuredClone(proposal);
    invalidTextFlag.panels[0].noText = true;
    expect(() => pageSourceRequest({ ...input, pageBible: invalidTextFlag })).toThrow("lettering or explicitly declare noText");
  });

  it("accepts an assembled style whose historical draft ID differs from the approved J08 version", () => {
    const { input, visualStyle } = setup("playful_kid", 1);
    expect(visualStyle.draftStyleVersionId).not.toBe(input.styleVersionId);
    expect(pageSourceRequest(input).request.styleVersionId).toBe(input.styleVersionId);
  });

  it("has a stable fingerprint for the same approved page and changes with exact lettering", () => {
    const { input, proposal } = setup("professional_creator", 3);
    const first = pageSourceRequest(input).request;
    expect(pageSourceRequest(structuredClone(input)).request).toEqual(first);
    const revised = structuredClone(proposal);
    revised.panels[0].lettering[0].text = "Exact story words";
    const changed = pageSourceRequest({ ...input, pageBible: revised }).request;
    expect(imageRequestFingerprint(changed)).not.toBe(imageRequestFingerprint(first));
  });

  it("fails rather than truncating an approved page whose serialized prompt is too large", () => {
    const { input, proposal } = setup("playful_kid", 1);
    const oversized = structuredClone(proposal);
    oversized.panels[0].composition = "x".repeat(16_000);
    expect(() => pageSourceRequest({ ...input, pageBible: oversized })).toThrow();
  });
});
