import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentOperationDocument } from "@/db/documents";
import { draftCharacterListSchema, draftLocationListSchema, manuscriptSchema, storedDraftCharacterListSchema, storedDraftLocationListSchema, storedManuscriptSchema, finalCharacterListSchema, finalLocationListSchema } from "@/lib/contracts/experiment-runner";
import type { NarrativeTask } from "@/lib/experiment-runner/narrative-tasks";
import { ExperimentRepositoryError } from "@/db/experiment-repository";

function invalid(message: string): never { throw new ExperimentRepositoryError("invalid_result", message); }
function sameIds(left: string[], right: string[]) {
  return left.length === right.length && new Set(left).size === left.length && left.every((id) => right.includes(id));
}

// This function runs inside the existing completion transaction. Proposal IDs
// never create subjects; Booklet assigns IDs and validates exact saved sources.
export async function materializeNarrativeContent(database: Database, session: ClientSession, operation: ExperimentOperationDocument, task: NarrativeTask, content: unknown, previous: unknown) {
  try {
    if (task === "J01" || task === "J02") return content;
    if (task === "J03") {
      const proposal = draftCharacterListSchema.parse(content);
      const prior = previous ? storedDraftCharacterListSchema.parse(previous).characters : [];
      return storedDraftCharacterListSchema.parse({ ...proposal, characters: proposal.characters.map((entry) => ({ ...entry, characterId: prior.find((item) => item.entryKey === entry.entryKey)?.characterId ?? randomUUID() })) });
    }
    if (task === "J04") {
      const proposal = draftLocationListSchema.parse(content);
      const prior = previous ? storedDraftLocationListSchema.parse(previous).locations : [];
      return storedDraftLocationListSchema.parse({ ...proposal, locations: proposal.locations.map((entry) => ({ ...entry, locationId: prior.find((item) => item.entryKey === entry.entryKey)?.locationId ?? randomUUID() })) });
    }
    const rows = await database.collections.artifact_versions.find({ _id: { $in: operation.dependencyVersionIds } }, { session }).toArray();
    const artifacts = await database.collections.artifacts.find({ _id: { $in: rows.map((row) => row.artifactId) } }, { session }).toArray();
    function source(sourceTask: NarrativeTask) {
      const artifact = artifacts.find((item) => item.taskId === sourceTask);
      const row = rows.find((item) => item.artifactId === artifact?._id);
      if (!row) invalid(`Missing saved ${sourceTask} content.`);
      return JSON.parse(row.contentJson) as unknown;
    }
    if (task === "J05") {
      const proposal = manuscriptSchema.parse(content);
      const characters = storedDraftCharacterListSchema.parse(source("J03")).characters;
      const locations = storedDraftLocationListSchema.parse(source("J04")).locations;
      const prior = previous ? storedManuscriptSchema.parse(previous).units : [];
      for (const unit of proposal.units) {
        if (unit.charactersPresent.some((id) => !characters.some((entry) => entry.characterId === id)) ||
            !locations.some((entry) => entry.locationId === unit.locationId) ||
            unit.dialogue.some((line) => !unit.charactersPresent.includes(line.speakerId))) invalid("Manuscript refers to an unknown or absent subject.");
      }
      if (characters.some((entry) => !proposal.units.some((unit) => unit.charactersPresent.includes(entry.characterId))) ||
          locations.some((entry) => !proposal.units.some((unit) => unit.locationId === entry.locationId))) invalid("Manuscript does not cover the fixed cast and locations.");
      return storedManuscriptSchema.parse({ ...proposal, units: proposal.units.map((unit) => ({ ...unit, unitId: prior.find((item) => item.unitKey === unit.unitKey)?.unitId ?? randomUUID() })) });
    }
    const manuscript = storedManuscriptSchema.parse(source("J05"));
    if (task === "J06") {
      const proposal = finalCharacterListSchema.parse(content);
      const characters = storedDraftCharacterListSchema.parse(source("J03")).characters;
      if (!sameIds(proposal.characters.map((entry) => entry.characterId), characters.map((entry) => entry.characterId))) invalid("Final characters differ from the saved cast.");
      for (const character of proposal.characters) {
        const occurrences = manuscript.units.filter((unit) => unit.charactersPresent.includes(character.characterId)).map((unit) => unit.unitId);
        const recurring = occurrences.length > 1;
        if (!sameIds(character.unitIds, occurrences) || character.recurrence !== (recurring ? "recurring" : "single_scene") || recurring && !character.sheetRequired) invalid("Character occurrence or sheet requirements contradict the manuscript.");
      }
      return proposal;
    }
    const proposal = finalLocationListSchema.parse(content);
    const locations = storedDraftLocationListSchema.parse(source("J04")).locations;
    if (!sameIds(proposal.locations.map((entry) => entry.locationId), locations.map((entry) => entry.locationId))) invalid("Final locations differ from the saved locations.");
    for (const location of proposal.locations) {
      const occurrences = manuscript.units.filter((unit) => unit.locationId === location.locationId).map((unit) => unit.unitId);
      if (!sameIds(location.unitIds, occurrences)) invalid("Location occurrences contradict the manuscript.");
    }
    return proposal;
  } catch (error) {
    if (error instanceof ExperimentRepositoryError) throw error;
    invalid("Saved narrative content or subject references are invalid.");
  }
}
