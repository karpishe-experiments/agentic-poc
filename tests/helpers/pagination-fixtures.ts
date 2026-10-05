import type { Persona } from "@/lib/contracts/experiment-runner";
import type { PaginationFixtureSource } from "@/lib/experiment-runner/pagination-fixtures";

export const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

export function paginationSources(persona: Persona): PaginationFixtureSource[] {
  const locationCount = persona === "professional_creator" ? 2 : 1;
  const units = Array.from({ length: 5 }, (_, index) => ({ unitId: id(30 + index), unitKey: `beat_${index + 1}`,
    beatTitle: `Beat ${index + 1}`, prose: `Scene ${index + 1}`, action: "Action", narration: "Narration",
    charactersPresent: [id(10), id(11)], locationId: locationCount === 2 && index === 3 ? id(21) : id(20), dialogue: [] }));
  const characters = [10, 11].map((number) => ({ characterId: id(number), nameOrRole: `Character ${number}`, narrativeFunction: "Story role",
    background: "Background", lifeStage: "Child", physicalDescription: "Description", personalityAndActing: "Cheerful", attireRequirements: [],
    accessories: [], expressions: [], openQuestions: [], unitIds: units.map((unit) => unit.unitId), recurrence: "recurring", sheetRequired: true }));
  const locations = Array.from({ length: locationCount }, (_, index) => ({ locationId: id(20 + index), title: `Place ${index + 1}`,
    storyPurpose: "Scene", basicDescription: "Description", stableAnchors: ["Door"], requiredFeatures: [], continuityNotes: [], openQuestions: [],
    unitIds: units.filter((unit) => unit.locationId === id(20 + index)).map((unit) => unit.unitId), sheetRequired: true }));
  const build = (asset: number) => ({ prompt: "Sheet", stylePromptModuleHash: "a".repeat(64), operationId: id(80 + asset), assetId: id(asset), sourceVersionIds: [id(6), id(8)] });
  return [
    { taskId: "J01", id: id(1), content: {} }, { taskId: "J02", id: id(2), content: {} },
    { taskId: "J05", id: id(5), content: { schemaVersion: "2", title: "Story", continuityNotes: [], units, expansionNotes: [], openQuestions: [], approvalQuestions: [] } },
    { taskId: "J06", id: id(6), content: { schemaVersion: "2", title: "Cast", characters, profileGuidance: [], representationAndContinuity: [], approvalQuestions: [] } },
    { taskId: "J07", id: id(7), content: { schemaVersion: "2", title: "Places", locations, profileGuidance: [], worldSafetyAndAccessibility: [], approvalQuestions: [] } },
    { taskId: "J08", id: id(8), content: {} },
    ...characters.map((character, index) => ({ taskId: "J09", id: id(50 + index), subjectKind: "character", subjectId: character.characterId,
      content: { schemaVersion: "2", title: "Character sheet", finalListVersionId: id(6), styleVersionId: id(8), stylePromptModule: "Style", stylePromptModuleHash: "a".repeat(64),
        sheetPromptModule: "Sheet", reviewQuestions: [], characterId: character.characterId, characterDesignProfile: "Character", attireRequirements: [], accessories: [],
        requiredViews: ["front", "back", "side", "neutral_facial"], additionalExpressions: ["Curious", "Concerned", "Relieved"], build: build(60 + index) } })),
    ...locations.map((location, index) => ({ taskId: "J10", id: id(55 + index), subjectKind: "location", subjectId: location.locationId,
      content: { schemaVersion: "2", title: "Location sheet", finalListVersionId: id(7), styleVersionId: id(8), stylePromptModule: "Style", stylePromptModuleHash: "a".repeat(64),
        sheetPromptModule: "Sheet", reviewQuestions: [], locationId: location.locationId, locationDefinitionProfile: "Place", stableAnchors: ["Door"], requiredFeatures: [],
        overview: "isometric", supportingViews: [{ angle: "left", shows: "Door" }, { angle: "right", shows: "Room" }], build: build(70 + index) } })),
  ];
}
