import { describe, expect, it } from "vitest";
import { CASES, type Persona } from "@/lib/contracts/experiment-runner";
import { parseReferenceProposal, styleModuleHash, type VisualStyleProposal } from "@/lib/contracts/experiment-references";
import { simulateReferenceProposal } from "@/lib/experiment-runner/reference-fixtures";

const version = (versionId: string, content: unknown) => ({ versionId, content });
const id = (number: number) => `00000000-0000-4000-8000-${number.toString().padStart(12, "0")}`;

// Supplied source fixture only: these IDs do not claim actual stored images.
function assembledStyle(style: VisualStyleProposal) {
  const { samplePlan, ...definition } = style;
  return { ...definition, draftStyleVersionId: id(37), samples: samplePlan.map((sample, index) => ({
    ...sample,
    build: { prompt: `${style.stylePromptModule}\nSample ${index + 1}`, stylePromptModuleHash: style.stylePromptModuleHash,
      operationId: id(40 + index), assetId: id(40 + index), sourceVersionIds: [id(37), id(31), id(32), id(33), id(34), id(35)] },
  })) };
}

function inputs(persona: Persona) {
  const placeCount = persona === "professional_creator" ? 2 : 1;
  const title = persona === "playful_kid" ? "Kite Rescue" : persona === "enthusiast_parent" ? "Rainy Room" : "Observatory Lantern";
  const names = persona === "playful_kid" ? ["Inventor", "Robot"] : persona === "enthusiast_parent" ? ["Child", "Grandparent"] : ["First friend", "Second friend"];
  const places = Array.from({ length: placeCount }, (_, index) => ({
    locationId: id(index + 11), title: index ? "Workshop" : persona === "enthusiast_parent" ? "Living room" : persona === "playful_kid" ? "Park" : "Observatory",
    storyPurpose: "A meaningful story setting", basicDescription: "A recognizable safe place", stableAnchors: ["Entry arch"], requiredFeatures: ["Clear path"], continuityNotes: [], openQuestions: [], unitIds: placeCount === 1 ? [id(21), id(22)] : [id(21 + index)], sheetRequired: true as const,
  }));
  const characters = names.map((name, index) => ({ characterId: id(index + 1), nameOrRole: name, narrativeFunction: "Helps solve the problem", background: "A trusted story participant", lifeStage: "Story appropriate", physicalDescription: `Recognizable silhouette for ${name}`, personalityAndActing: "Expressive and kind", attireRequirements: [`${name} coat`], accessories: [`${name} bag`], expressions: ["Joy", "Concern", "Relief"], openQuestions: [], unitIds: [id(21), id(22)], recurrence: "recurring" as const, sheetRequired: true }));
  const common = { mode: "simulated" as const, persona, brief: CASES[persona].brief };
  const styleInput = {
    ...common,
    concept: version(id(31), { schemaVersion: "2", title, sourceInput: common.brief, audience: { ageBand: persona === "enthusiast_parent" ? "3-5" : persona === "playful_kid" ? "6-8" : "9-12", readingNeeds: "Clear reading" }, premise: "Friends solve a problem", theme: "Working together", emotionalPromise: "A hopeful resolution", tone: "Gentle", storyScope: "One story", contentRequirements: [], knownConstraints: [], deferredDecisions: [], approvalQuestions: [] }),
    outline: version(id(32), { schemaVersion: "2", title, summary: "A problem is solved", characters: names.map((name) => ({ nameOrRole: name, narrativeRole: "Helper", relationship: "Friends", openDetails: [] })), locations: places.map((place) => ({ name: place.title, storyPurpose: place.storyPurpose, openDetails: [] })), storyArc: { opening: "An ordinary start", incitingAction: "A problem appears", escalation: "First try fails", decisiveChoice: "They listen", resolution: "They succeed" }, theme: "Working together", emotionalArc: "From worry to relief", deferredDecisions: [], approvalQuestions: [] }),
    manuscript: version(id(33), { schemaVersion: "2", title, continuityNotes: [], units: [{ unitId: id(21), unitKey: "beat-1", beatTitle: "Start", prose: "They begin together", action: "They look around", narration: "The day begins", charactersPresent: characters.map((item) => item.characterId), locationId: places[0].locationId, dialogue: [] }, { unitId: id(22), unitKey: "beat-2", beatTitle: "End", prose: "They succeed together", action: "They solve the problem", narration: "A kind ending", charactersPresent: characters.map((item) => item.characterId), locationId: places.at(-1)!.locationId, dialogue: [] }], expansionNotes: [], openQuestions: [], approvalQuestions: [] }),
    finalCharacters: version(id(34), { schemaVersion: "2", title, characters, profileGuidance: [], representationAndContinuity: [], approvalQuestions: [] }),
    finalLocations: version(id(35), { schemaVersion: "2", title, locations: places, profileGuidance: [], worldSafetyAndAccessibility: [], approvalQuestions: [] }),
  };
  return { styleInput, characters, places };
}

describe("reference simulation fixtures", () => {
  for (const persona of Object.keys(CASES) as Persona[]) {
    it(`produces three proposal types from ${persona} sources`, () => {
      const { styleInput, characters, places } = inputs(persona);
      const style = simulateReferenceProposal("J08", styleInput);
      expect(style.kind).toBe("proposal");
      if (style.kind !== "proposal") return;
      expect(style.content.samplePlan.map((sample) => sample.sampleKey)).toEqual(["sample_1", "sample_2"]);
      expect(style.content.stylePromptModule).toContain("narration");
      expect(style.content.stylePromptModule).toContain("diegetic");
      for (const name of characters.map((item) => item.nameOrRole)) expect(style.content.stylePromptModule).not.toContain(name);
      for (const place of places) expect(style.content.stylePromptModule).not.toContain(place.title);
      expect(style.content.stylePromptModule).not.toContain("They look around");
      expect(style.content.stylePromptModuleHash).toBe(styleModuleHash(style.content.stylePromptModule));
      parseReferenceProposal("J08", "proposal", style.content);
      const sheetBase = { mode: "simulated" as const, persona, brief: CASES[persona].brief, style: version(id(36), assembledStyle(style.content)), styleVersionId: id(36) };
      const character = simulateReferenceProposal("J09", { ...sheetBase, finalList: styleInput.finalCharacters, targetId: characters[1].characterId });
      expect(character.kind).toBe("proposal");
      if (character.kind !== "proposal") return;
      expect(character.content.characterId).toBe(characters[1].characterId);
      expect(character.content.attireRequirements).toEqual(characters[1].attireRequirements);
      expect(character.content.accessories).toEqual(characters[1].accessories);
      expect(character.content.sheetPromptModule).toContain("full-body front, full-body back, full-body side");
      expect(character.content.sheetPromptModule).toContain("No readable labels, watermarks, logos, or unrelated characters.");
      expect(character.content.stylePromptModule).toBe(style.content.stylePromptModule);
      parseReferenceProposal("J09", "proposal", character.content);
      for (const place of places) {
        const location = simulateReferenceProposal("J10", { ...sheetBase, finalList: styleInput.finalLocations, targetId: place.locationId });
        expect(location.kind).toBe("proposal");
        if (location.kind !== "proposal") continue;
        expect(location.content.locationId).toBe(place.locationId);
        expect(location.content.supportingViews).toHaveLength(2);
        expect(location.content.stableAnchors).toEqual(place.stableAnchors);
        expect(location.content.sheetPromptModule).toContain("Do not add page action or weather unless it is an approved stable fact.");
        parseReferenceProposal("J10", "proposal", location.content);
      }
    });
  }

  it("rejects paid mode, wrong brief, absent target, and mismatched style version", () => {
    const { styleInput } = inputs("playful_kid");
    expect(() => simulateReferenceProposal("J08", { ...styleInput, mode: "real" })).toThrow();
    expect(() => simulateReferenceProposal("J08", { ...styleInput, brief: "wrong" })).toThrow();
    const style = simulateReferenceProposal("J08", styleInput);
    if (style.kind !== "proposal") throw new Error("Expected style proposal");
    const base = { mode: "simulated" as const, persona: "playful_kid" as const, brief: CASES.playful_kid.brief, style: version(id(36), assembledStyle(style.content)), styleVersionId: id(36), finalList: styleInput.finalCharacters };
    expect(() => simulateReferenceProposal("J09", { ...base, targetId: "missing" })).toThrow();
    expect(() => simulateReferenceProposal("J09", { ...base, targetId: id(1), styleVersionId: "other" })).toThrow();
    expect(() => simulateReferenceProposal("J09", { ...base, targetId: id(1), style: version(id(36), { ...assembledStyle(style.content), stylePromptModuleHash: "0".repeat(64) }) })).toThrow();
    expect(() => simulateReferenceProposal("J09", { ...base, targetId: id(1), style: version(id(36), style.content) })).toThrow();
    expect(() => simulateReferenceProposal("J10", { ...base, finalList: styleInput.finalLocations, targetId: id(11), style: version(id(36), style.content) })).toThrow();
    expect(() => simulateReferenceProposal("J09", { ...base, targetId: id(1), finalList: version("invalid-version", styleInput.finalCharacters.content) })).toThrow();
    const twoLocations = { ...(styleInput.finalLocations.content as { locations: object[] }), locations: [...(styleInput.finalLocations.content as { locations: object[] }).locations, { ...(styleInput.finalLocations.content as { locations: object[] }).locations[0], locationId: id(12) }] };
    expect(() => simulateReferenceProposal("J08", { ...styleInput, finalLocations: version(id(35), twoLocations) })).toThrow();
    expect(() => simulateReferenceProposal("J10", { ...base, finalList: version(id(35), twoLocations), targetId: id(11) })).toThrow();
  });

  it("asks once for missing expressions and uses the saved answer", () => {
    const { styleInput } = inputs("enthusiast_parent");
    const style = simulateReferenceProposal("J08", styleInput);
    if (style.kind !== "proposal") throw new Error("Expected style proposal");
    const list = { ...styleInput.finalCharacters, content: { ...(styleInput.finalCharacters.content as object), characters: (styleInput.finalCharacters.content as { characters: { expressions: string[] }[] }).characters.map((item) => ({ ...item, expressions: ["Joy"] })) } };
    const input = { mode: "simulated" as const, persona: "enthusiast_parent" as const, brief: CASES.enthusiast_parent.brief, style: version(id(36), assembledStyle(style.content)), styleVersionId: id(36), finalList: list, targetId: id(1) };
    const first = simulateReferenceProposal("J09", input);
    expect(first.kind).toBe("clarification");
    if (first.kind !== "clarification") return;
    const answered = simulateReferenceProposal("J09", { ...input, answers: [{ question: first.question, answer: "Concern, Relief" }] });
    expect(answered.kind).toBe("proposal");
    if (answered.kind === "proposal") expect(answered.content.additionalExpressions).toEqual(["Joy", "Concern", "Relief"]);
    const repeatedAnswer = simulateReferenceProposal("J09", { ...input, answers: [{ question: first.question, answer: "Concern, Concern, Relief" }] });
    expect(repeatedAnswer.kind).toBe("proposal");
    if (repeatedAnswer.kind === "proposal") expect(repeatedAnswer.content.additionalExpressions).toEqual(["Joy", "Concern", "Relief"]);
    expect(simulateReferenceProposal("J09", { ...input, answers: [{ question: first.question, answer: "Concern, Concern" }] }).kind).toBe("clarification");
  });

  it("retains exact module whitespace and current content on a notes revision", () => {
    const { styleInput } = inputs("professional_creator");
    const first = simulateReferenceProposal("J08", styleInput);
    if (first.kind !== "proposal") throw new Error("Expected style proposal");
    const changed = { ...first.content, stylePromptModule: `  ${first.content.stylePromptModule}\n\n`, stylePromptModuleHash: styleModuleHash(`  ${first.content.stylePromptModule}\n\n`) };
    expect(() => simulateReferenceProposal("J08", { ...styleInput, currentContent: { ...changed, stylePromptModuleHash: "0".repeat(64) } })).toThrow();
    const revised = simulateReferenceProposal("J08", { ...styleInput, currentContent: changed, revision: "Increase detail in the environment." });
    expect(revised.kind).toBe("proposal");
    if (revised.kind !== "proposal") return;
    expect(revised.content.stylePromptModule).toBe(changed.stylePromptModule);
    expect(revised.content.stylePromptModuleHash).toBe(changed.stylePromptModuleHash);
    expect(revised.content.samplePlan).toEqual(changed.samplePlan);
    expect(revised.content.approvalQuestions).toContain("Revision request: Increase detail in the environment.");
    const regenerated = simulateReferenceProposal("J08", { ...styleInput, currentContent: changed, sourceChanged: true, concept: version(id(37), { ...(styleInput.concept.content as object), tone: "Reflective" }) });
    expect(regenerated.kind).toBe("proposal");
    if (regenerated.kind === "proposal") expect(regenerated.content.stylePromptModule).toContain("Reflective");
  });

  it("keeps the narrative promise outside the reusable style module", () => {
    const { styleInput } = inputs("professional_creator");
    const promise = "An honest repair restores both the observatory and the friendship.";
    const result = simulateReferenceProposal("J08", { ...styleInput, concept: version(id(31), { ...(styleInput.concept.content as object), emotionalPromise: promise }) });
    expect(result.kind).toBe("proposal");
    if (result.kind !== "proposal") return;
    expect(result.content.styleDefinition.emotionalTone).toBe(promise);
    expect(result.content.stylePromptModule).not.toContain(promise);
    expect(result.content.stylePromptModule).not.toContain("observatory");
  });
});
