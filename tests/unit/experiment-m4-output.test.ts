import { describe, expect, it } from "vitest";
import { parseM4CreativeOutput } from "@/lib/experiment-runner/m4-output";
import { styleModuleHash } from "@/lib/contracts/experiment-references";
import { m4TestId as id } from "@/tests/helpers/m4-policy";

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
