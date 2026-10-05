import { describe, expect, it } from "vitest";
import { styleModuleHash } from "@/lib/contracts/experiment-references";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { referenceSheetRequest, styleSampleRequests } from "@/lib/experiment-runner/reference-requests";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const moduleText = "  ink lines\nsoft colours  \n";
const base = { schemaVersion: "2", title: "Reference", stylePromptModule: moduleText,
  stylePromptModuleHash: styleModuleHash(moduleText) };
const style = { ...base, styleDefinition: { mediumAndLineWork: "ink", shapeLanguageAndProportions: "round",
  colourAndContrast: "warm", textureAndRendering: "paper", lightingAndAtmosphere: "gentle",
  emotionalTone: "hopeful", accessibilityAndReadability: "clear" },
  typographyDirection: "large text", speechAndThoughtBubbleDirection: "rounded bubbles",
  exclusions: ["watermarks"], approvalQuestions: [],
  samplePlan: [{ sampleKey: "sample_2", purpose: "Same scene" }, { sampleKey: "sample_1", purpose: "Same scene" }] };
const sources = { draftStyleVersionId: id(1), conceptVersionId: id(2), outlineVersionId: id(3),
  manuscriptVersionId: id(4), finalCharactersVersionId: id(5), finalLocationsVersionId: id(6) };
const sheet = { ...base, finalListVersionId: id(5), styleVersionId: id(7),
  sheetPromptModule: "One montage, no labels.", reviewQuestions: [] };
const character = { ...sheet, characterId: id(8), characterDesignProfile: "Inventor",
  attireRequirements: ["coat"], accessories: ["bag"],
  requiredViews: ["front", "back", "side", "neutral_facial"], additionalExpressions: ["joy", "concern", "relief"] };
const location = { ...sheet, finalListVersionId: id(6), locationId: id(9), locationDefinitionProfile: "Park",
  stableAnchors: ["gate"], requiredFeatures: ["tree"], overview: "isometric",
  supportingViews: [{ angle: "north", shows: "gate" }, { angle: "south", shows: "tree" }] };

describe("reference image request serialization", () => {
  it("orders both sample slots and sources and preserves exact style bytes", () => {
    const requests = styleSampleRequests(style, sources);
    expect(requests.map((item) => item.sampleKey)).toEqual(["sample_1", "sample_2"]);
    for (const { request } of requests) {
      expect(request.kind).toBe("style_preview");
      expect(request.styleVersionId).toBe(id(1));
      expect(request.sourceVersionIds).toEqual([1, 2, 3, 4, 5, 6].map(id));
      expect(request.prompt.endsWith(moduleText)).toBe(true);
      expect(request.prompt).toContain("rounded bubbles");
    }
    expect(imageRequestFingerprint(requests[0].request)).not.toBe(imageRequestFingerprint(requests[1].request));
    expect(styleSampleRequests({ ...style, samplePlan: [...style.samplePlan].reverse() }, sources)).toEqual(requests);
  });
  it("reproduces requests after reload and changes identities when sources or module change", () => {
    const original = styleSampleRequests(style, sources)[0].request;
    expect(styleSampleRequests(JSON.parse(JSON.stringify(style)), { ...sources })[0].request).toEqual(original);
    expect(imageRequestFingerprint(styleSampleRequests(style, { ...sources, manuscriptVersionId: id(10) })[0].request))
      .not.toBe(imageRequestFingerprint(original));
    const changed = `${moduleText}new instruction`;
    expect(styleSampleRequests({ ...style, stylePromptModule: changed, stylePromptModuleHash: styleModuleHash(changed) }, sources)[0].request.prompt).toContain(changed);
  });
  it("serializes required subject views, expressions, anchors and exact sources", () => {
    const charRequest = referenceSheetRequest("J09", character);
    const placeRequest = referenceSheetRequest("J10", location);
    expect(charRequest.sourceVersionIds).toEqual([id(5), id(7)]);
    expect(placeRequest.sourceVersionIds).toEqual([id(6), id(7)]);
    expect(charRequest.prompt).toContain("full-body front, full-body back and full-body side views");
    expect(charRequest.prompt).toContain("a detailed neutral facial view");
    expect(charRequest.prompt).toContain("three additional facial-expression shots");
    expect(placeRequest.prompt).toContain("an isometric overview and each specified supporting view");
    for (const value of ["front", "back", "side", "neutral_facial", "joy", "concern", "relief", "coat", "bag"]) expect(charRequest.prompt).toContain(value);
    for (const value of ["isometric", "north", "south", "gate", "tree"]) expect(placeRequest.prompt).toContain(value);
    for (const request of [charRequest, placeRequest]) {
      expect(request.kind).toBe("reference");
      expect(request.prompt.endsWith(moduleText)).toBe(true);
    }
    expect(imageRequestFingerprint(referenceSheetRequest("J09", { ...character, characterId: id(10) }))).not.toBe(imageRequestFingerprint(charRequest));
  });
  it("rejects invalid hashes, missing slots, duplicate or malformed version IDs and oversized prompts", () => {
    expect(() => styleSampleRequests({ ...style, stylePromptModuleHash: "0".repeat(64) }, sources)).toThrow();
    expect(() => styleSampleRequests({ ...style, samplePlan: style.samplePlan.slice(0, 1) }, sources)).toThrow();
    expect(() => styleSampleRequests(style, { ...sources, conceptVersionId: id(1) })).toThrow();
    expect(() => styleSampleRequests(style, { ...sources, draftStyleVersionId: "invalid" })).toThrow();
    expect(() => referenceSheetRequest("J09", { ...character, finalListVersionId: id(7) })).toThrow();
    expect(() => referenceSheetRequest("J10", { ...location, stylePromptModuleHash: "0".repeat(64) })).toThrow();
    expect(() => styleSampleRequests({ ...style, typographyDirection: "x".repeat(16_000) }, sources)).toThrow();
  });
});
