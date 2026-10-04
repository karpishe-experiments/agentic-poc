import { describe, expect, it } from "vitest";
import {
  finalCharacterListSchema,
  finalLocationListSchema,
  manuscriptSchema,
  parseNarrativeTaskProposal,
  storedDraftCharacterListSchema,
  storedDraftLocationListSchema,
  storedManuscriptSchema,
  validateRoleResult,
} from "@/lib/contracts/experiment-runner";

const childId = "00000000-0000-4000-8000-000000000001";
const robotId = "00000000-0000-4000-8000-000000000002";
const parkId = "00000000-0000-4000-8000-000000000003";
const unitId = "00000000-0000-4000-8000-000000000004";
const versionId = "00000000-0000-4000-8000-000000000005";

const unit = {
  unitKey: "opening", beatTitle: "The kite escapes", prose: "The kite flew away.",
  action: "The child and robot give chase.", narration: "They ran together.",
  charactersPresent: [childId, robotId], locationId: parkId,
  dialogue: [{ speakerId: childId, text: "Follow it!" }],
};
const manuscript = {
  schemaVersion: "2", title: "The Kite", continuityNotes: [], units: [unit],
  expansionNotes: [], openQuestions: [], approvalQuestions: [],
};
const character = {
  characterId: childId, nameOrRole: "Child", narrativeFunction: "Lead",
  background: "A young inventor.", lifeStage: "Child", physicalDescription: "Short hair.",
  personalityAndActing: "Curious and quick.", attireRequirements: [], accessories: [],
  expressions: [], openQuestions: [], unitIds: [unitId], recurrence: "single_scene", sheetRequired: false,
};
const location = {
  locationId: parkId, title: "Park", storyPurpose: "Kite chase", basicDescription: "A green park.",
  stableAnchors: [], requiredFeatures: [], continuityNotes: [], openQuestions: [],
  unitIds: [unitId], sheetRequired: true,
};

describe("S2 narrative proposal contracts", () => {
  it("accepts complete manuscript units, strips extras and requires stored IDs", () => {
    const result = parseNarrativeTaskProposal("J05", "playful_kid", { ...manuscript, surplus: true });
    expect(result.content).not.toHaveProperty("surplus");
    expect(manuscriptSchema.safeParse({ ...manuscript, units: [{ ...unit, prose: "" }] }).success).toBe(false);
    expect(manuscriptSchema.safeParse({ ...manuscript, units: [unit, unit] }).success).toBe(false);
    expect(storedManuscriptSchema.safeParse(manuscript).success).toBe(false);
    expect(storedManuscriptSchema.safeParse({ ...manuscript, units: [{ ...unit, unitId }] }).success).toBe(true);
  });

  it("requires canonical final character and location lists", () => {
    const characters = { schemaVersion: "2", title: "The Kite", characters: [character, { ...character, characterId: robotId }], profileGuidance: [], representationAndContinuity: [], approvalQuestions: [] };
    const locations = { schemaVersion: "2", title: "The Kite", locations: [location], profileGuidance: [], worldSafetyAndAccessibility: [], approvalQuestions: [] };
    expect(parseNarrativeTaskProposal("J06", "playful_kid", characters).content).toEqual(characters);
    expect(parseNarrativeTaskProposal("J07", "playful_kid", locations).content).toEqual(locations);
    expect(finalCharacterListSchema.safeParse({ ...characters, characters: [character, character] }).success).toBe(false);
    expect(finalLocationListSchema.safeParse({ ...locations, locations: [{ ...location, sheetRequired: false }] }).success).toBe(false);
    expect(() => parseNarrativeTaskProposal("J07", "professional_creator", locations)).toThrow(/requires 2 locations/);
  });

  it("keeps application IDs out of draft proposals and requires them in stored lists", () => {
    const draftCharacter = { entryKey: "character_1", nameOrRole: "Child", narrativeFunction: "Lead", role: "main", knownRelationship: "Robot friend", knownFacts: [], openQuestions: [] };
    const draftCharacters = { schemaVersion: "2", title: "The Kite", characters: [draftCharacter, { ...draftCharacter, entryKey: "character_2", characterId: "robot" }], castNotes: [], representationAndSafety: [], manuscriptQuestions: [], approvalQuestions: [] };
    const draftLocation = { entryKey: "location_1", title: "Park", storyPurpose: "Chase", knownFacts: [], likelyScenes: [], openQuestions: [] };
    const draftLocations = { schemaVersion: "2", title: "The Kite", locations: [draftLocation], worldAndSafetyNotes: [], manuscriptQuestions: [], approvalQuestions: [] };
    expect(parseNarrativeTaskProposal("J03", "playful_kid", draftCharacters).content.characters[1]).not.toHaveProperty("characterId");
    expect(storedDraftCharacterListSchema.safeParse(draftCharacters).success).toBe(false);
    expect(storedDraftLocationListSchema.safeParse(draftLocations).success).toBe(false);
  });

  it("routes J07 proposals and revisions through the existing role envelope", () => {
    expect(validateRoleResult("specialist", { kind: "proposal", payload: { taskId: "J07", content: {} } }).kind).toBe("proposal");
    expect(validateRoleResult("tester", { kind: "decision", payload: { decision: { action: "revise", taskId: "J07", artifactVersionId: versionId, instruction: "Clarify the park." } } }).kind).toBe("decision");
  });
});
