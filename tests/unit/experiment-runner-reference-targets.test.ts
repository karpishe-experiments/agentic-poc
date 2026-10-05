import { describe, expect, it } from "vitest";
import { styleModuleHash } from "@/lib/contracts/experiment-references";
import { assembleReferenceSheet } from "@/lib/experiment-runner/reference-assembly";
import { referenceSheetRequest } from "@/lib/experiment-runner/reference-requests";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { configuredReferenceSheetTasks, nextReferenceSheetWork, referenceSheetTargets, type SheetProjection } from "@/lib/experiment-runner/reference-targets";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const styleText = "  soft ink\nclear silhouettes  \n";
const character = (n: number) => ({ characterId: id(n), nameOrRole: "Inventor", narrativeFunction: "Lead", background: "Invents", lifeStage: "Child",
  physicalDescription: "Short hair", personalityAndActing: "Curious", attireRequirements: [], accessories: [], expressions: ["joy", "concern", "relief"],
  openQuestions: [], unitIds: [id(90), id(91)], recurrence: "recurring", sheetRequired: true });
const location = (n: number) => ({ locationId: id(n), title: "Park", storyPurpose: "Rescue", basicDescription: "Park", stableAnchors: ["gate"],
  requiredFeatures: [], continuityNotes: [], openQuestions: [], unitIds: [id(90)], sheetRequired: true });
const style = { schemaVersion: "2", title: "Style", stylePromptModule: styleText, stylePromptModuleHash: styleModuleHash(styleText),
  styleDefinition: { mediumAndLineWork: "ink", shapeLanguageAndProportions: "round", colourAndContrast: "warm", textureAndRendering: "paper",
    lightingAndAtmosphere: "gentle", emotionalTone: "hopeful", accessibilityAndReadability: "clear" }, typographyDirection: "large text",
  speechAndThoughtBubbleDirection: "round", exclusions: [], approvalQuestions: [], draftStyleVersionId: id(50),
  samples: [1, 2].map((n) => ({ sampleKey: `sample_${n}`, purpose: "Style check", build: { prompt: styleText,
    stylePromptModuleHash: styleModuleHash(styleText), operationId: id(50 + n), assetId: id(60 + n), sourceVersionIds: [id(50)] } })) };
function sources(locationCount = 1) {
  return { characters: { versionId: id(10), content: { schemaVersion: "2", title: "Cast", characters: [character(2), character(1)], profileGuidance: [], representationAndContinuity: [], approvalQuestions: [] } },
    locations: { versionId: id(11), content: { schemaVersion: "2", title: "Places", locations: Array.from({ length: locationCount }, (_, n) => location(3 + n)), profileGuidance: [], worldSafetyAndAccessibility: [], approvalQuestions: [] } },
    style: { versionId: id(12), content: style } };
}
const proposal = { schemaVersion: "2", title: "Inventor sheet", finalListVersionId: id(10), styleVersionId: id(12), stylePromptModule: styleText,
  stylePromptModuleHash: styleModuleHash(styleText), sheetPromptModule: "One montage", reviewQuestions: [], characterId: id(1),
  characterDesignProfile: "Inventor", attireRequirements: [], accessories: [], requiredViews: ["front", "back", "side", "neutral_facial"], additionalExpressions: ["joy", "concern", "relief"] };
const request = referenceSheetRequest("J09", proposal);
const assembled = assembleReferenceSheet("J09", proposal, { operationId: id(70), assetId: id(71), request, inputFingerprint: imageRequestFingerprint(request) }).content;
const projection = (content: unknown = proposal, state = "draft"): SheetProjection => ({ taskId: "J09", subjectKind: "character", subjectId: id(1), state, currentVersionId: id(80), content });

describe("subject-specific reference routing", () => {
  it("keeps sheets disabled for old, partial and ambiguous saved bindings", () => {
    const bindings = Array.from({ length: 10 }, (_, n) => ({ role: "specialist", taskId: `J${String(n + 1).padStart(2, "0")}`,
      appId: id(100 + n), publishedWorkflowId: id(200 + n) }));
    const image = { role: "image", taskId: null, appId: id(110), publishedWorkflowId: id(210) };
    const complete = [...bindings, image];
    expect(configuredReferenceSheetTasks(JSON.stringify(complete))).toEqual(["J09", "J10"]);
    for (const rows of [bindings, [...bindings.slice(0, 8), image], [...bindings.slice(0, 9), image],
      [...complete, bindings[9]], [...complete, image],
      complete.map((row, n) => n === 9 ? { ...row, appId: id(100) } : row),
      complete.map((row, n) => n === 8 ? { ...row, publishedWorkflowId: "missing" } : row),
      [...bindings, { ...image, taskId: "J08" }]]) {
      expect(configuredReferenceSheetTasks(JSON.stringify(rows))).toEqual([]);
    }
    expect(configuredReferenceSheetTasks("invalid")).toEqual([]);
  });
  for (const [persona, count] of [["playful_kid", 1], ["enthusiast_parent", 1], ["professional_creator", 2]] as const) {
    it(`enumerates the complete ${persona} sheet set independent of list order`, () => {
      const input = sources(count), targets = referenceSheetTargets(input);
      expect(targets.map((target) => `${target.taskId}:${target.subjectId}`)).toEqual([`J09:${id(1)}`, `J09:${id(2)}`, ...Array.from({ length: count }, (_, n) => `J10:${id(3 + n)}`)]);
      expect(targets.map((target) => target.sourceVersionIds)).toEqual([[id(10), id(12)], [id(10), id(12)], ...Array.from({ length: count }, () => [id(11), id(12)])]);
      input.characters.content.characters.reverse(); input.locations.content.locations.reverse();
      expect(referenceSheetTargets(input)).toEqual(targets);
    });
  }
  it("rejects unassembled style, duplicate sources and missing recurring sheet requirements", () => {
    const input = sources();
    expect(() => referenceSheetTargets({ ...input, style: { ...input.style, content: { ...style, samples: [] } } })).toThrow();
    expect(() => referenceSheetTargets({ ...input, style: { ...input.style, versionId: id(10) } })).toThrow();
    input.characters.content.characters[0].sheetRequired = false;
    expect(() => referenceSheetTargets(input)).toThrow();
  });
  it("routes absent, invalidated, textual and image-backed sheets without accepting drafts", () => {
    const targets = referenceSheetTargets(sources()).slice(0, 1);
    expect(nextReferenceSheetWork(targets, [])).toMatchObject({ kind: "proposal", currentVersionId: null });
    expect(nextReferenceSheetWork(targets, [projection(null, "needs_review")])).toMatchObject({ kind: "proposal", currentVersionId: id(80) });
    expect(nextReferenceSheetWork(targets, [projection()])).toMatchObject({ kind: "image" });
    expect(nextReferenceSheetWork(targets, [projection(assembled)])).toMatchObject({ kind: "review" });
    expect(nextReferenceSheetWork(targets, [projection(assembled, "approved")])).toBeNull();
    expect(() => nextReferenceSheetWork(targets, [projection(proposal, "approved")])).toThrow();
  });
  it("rejects stale source/subject identities, ambiguous current artifacts and corrupt builds", () => {
    const targets = referenceSheetTargets(sources()).slice(0, 1);
    for (const content of [{ ...proposal, characterId: id(2) }, { ...proposal, finalListVersionId: id(99) },
      { ...proposal, styleVersionId: id(99) }, { ...proposal, build: {} }]) {
      expect(() => nextReferenceSheetWork(targets, [projection(content)])).toThrow();
    }
    expect(() => nextReferenceSheetWork(targets, [projection(), projection()])).toThrow();
    expect(() => nextReferenceSheetWork(targets, [{ ...projection(), currentVersionId: null }])).toThrow();
    expect(() => nextReferenceSheetWork(targets, [projection(assembled, "rejected")])).toThrow();
  });
  it("does not mistake one subject's approval for completion of every sheet", () => {
    const targets = referenceSheetTargets(sources());
    expect(nextReferenceSheetWork(targets, [projection(assembled, "approved")])).toMatchObject({ kind: "proposal", target: { taskId: "J09", subjectId: id(2) } });
  });
});
