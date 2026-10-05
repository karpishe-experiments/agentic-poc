import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseReferenceProposal, styleModuleHash } from "@/lib/contracts/experiment-references";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const styleModule = "  painterly line\n  soft colours  ";
const digest = createHash("sha256").update(styleModule).digest("hex");
const build = (n: number, sources = [id(1), id(2)]) => ({
  prompt: `Subject\n${styleModule}\nDetails`, stylePromptModuleHash: digest,
  operationId: id(100 + n), assetId: id(200 + n), sourceVersionIds: sources,
});
const base = { schemaVersion: "2", title: "Reference", stylePromptModule: styleModule, stylePromptModuleHash: digest };
const style = {
  ...base,
  styleDefinition: {
    mediumAndLineWork: "ink", shapeLanguageAndProportions: "rounded", colourAndContrast: "warm",
    textureAndRendering: "paper", lightingAndAtmosphere: "gentle", emotionalTone: "hopeful",
    accessibilityAndReadability: "high contrast",
  },
  typographyDirection: "large text", speechAndThoughtBubbleDirection: "rounded bubbles",
  exclusions: ["watermarks"], approvalQuestions: [],
  samplePlan: [{ sampleKey: "sample_1", purpose: "emotion and action" }, { sampleKey: "sample_2", purpose: "environment and props" }],
};
const sheetBase = {
  ...base, finalListVersionId: id(1), styleVersionId: id(2), sheetPromptModule: "subject details", reviewQuestions: [],
};
const character = {
  ...sheetBase, characterId: id(3), characterDesignProfile: "young inventor", attireRequirements: ["coat"], accessories: ["bag"],
  requiredViews: ["front", "back", "side", "neutral_facial"], additionalExpressions: ["happy", "worried", "surprised"],
};
const location = {
  ...sheetBase, locationId: id(4), locationDefinitionProfile: "observatory", stableAnchors: ["dome"],
  requiredFeatures: ["telescope"], overview: "isometric",
  supportingViews: [{ angle: "north", shows: "dome" }, { angle: "south", shows: "entrance" }],
};

describe("J08–J10 reference contracts", () => {
  it("preserves exact module whitespace and permits a textual J08 proposal before images", () => {
    const parsed = parseReferenceProposal("J08", "proposal", style);
    expect(parsed.content.stylePromptModule).toBe(styleModule);
    expect(parsed.content.samplePlan).toHaveLength(2);
    expect(styleModuleHash(styleModule)).toBe(digest);
    expect(() => parseReferenceProposal("J08", "assembled", style)).toThrow();
  });

  it("requires two distinct completed J08 samples and correct hashes", () => {
    const assembled = { ...style, draftStyleVersionId: id(1), samples: style.samplePlan.map((item, index) => ({ ...item, build: build(index) })) };
    expect(parseReferenceProposal("J08", "assembled", assembled).content).toBeDefined();
    expect(() => parseReferenceProposal("J08", "assembled", { ...assembled, samples: assembled.samples.slice(0, 1) })).toThrow();
    expect(() => parseReferenceProposal("J08", "assembled", { ...assembled, samples: [assembled.samples[0], assembled.samples[0]] })).toThrow();
    expect(() => parseReferenceProposal("J08", "assembled", { ...assembled, samples: assembled.samples.map((sample) => ({ ...sample, build: build(0) })) })).toThrow();
    expect(() => parseReferenceProposal("J08", "assembled", { ...assembled, samples: assembled.samples.map((sample) => ({ ...sample, build: { ...sample.build, sourceVersionIds: [id(2)] } })) })).toThrow();
    expect(() => parseReferenceProposal("J08", "assembled", { ...assembled, samples: assembled.samples.map((sample) => ({ ...sample, build: { ...sample.build, stylePromptModuleHash: "0".repeat(64) } })) })).toThrow();
    expect(() => parseReferenceProposal("J08", "proposal", { ...style, stylePromptModuleHash: "0".repeat(64) })).toThrow();
  });

  it("accepts complete sheet inputs", () => {
    expect(parseReferenceProposal("J09", "assembled", { ...character, build: build(3) }).content).toBeDefined();
    expect(parseReferenceProposal("J10", "assembled", { ...location, build: build(4) }).content).toBeDefined();
  });

  it("requires view and expression instructions, overview and distinct supporting angles", () => {
    expect(() => parseReferenceProposal("J09", "proposal", { ...character, additionalExpressions: ["happy", "sad"] })).toThrow();
    expect(() => parseReferenceProposal("J09", "proposal", { ...character, requiredViews: ["front", "back"] })).toThrow();
    expect(() => parseReferenceProposal("J10", "proposal", { ...location, supportingViews: [location.supportingViews[0], location.supportingViews[0]] })).toThrow();
    expect(() => parseReferenceProposal("J10", "proposal", { ...location, overview: "front" })).toThrow();
  });

  it("checks exact prompt text and source identity, and strips unknown fields", () => {
    expect(() => parseReferenceProposal("J09", "assembled", { ...character, build: build(3, [id(2)]) })).toThrow();
    expect(() => parseReferenceProposal("J09", "assembled", { ...character, build: { ...build(3), prompt: "painterly line" } })).toThrow();
    expect(() => parseReferenceProposal("J10", "assembled", { ...location, build: { ...build(4), sourceVersionIds: [id(1), id(1)] } })).toThrow();
    expect(parseReferenceProposal("J09", "proposal", { ...character, invented: "ignored" }).content).not.toHaveProperty("invented");
  });

  it("enforces text, title, depth and artifact bounds while warning on preferences", () => {
    expect(() => parseReferenceProposal("J08", "proposal", { ...style, title: "x".repeat(1_001) })).toThrow();
    expect(() => parseReferenceProposal("J08", "proposal", { ...style, typographyDirection: "x".repeat(16_001) })).toThrow();
    expect(parseReferenceProposal("J08", "proposal", { ...style, title: "x".repeat(241) }).warnings.length).toBeGreaterThan(0);
    const deep: Record<string, unknown> = {}; let cursor = deep;
    for (let i = 0; i < 21; i++) { cursor.child = {}; cursor = cursor.child as Record<string, unknown>; }
    expect(() => parseReferenceProposal("J08", "proposal", { ...style, extra: deep })).toThrow(/depth/);
    expect(() => parseReferenceProposal("J08", "proposal", { ...style, exclusions: Array(100).fill("x".repeat(6_000)) })).toThrow(/512 KiB/);
  });
});
