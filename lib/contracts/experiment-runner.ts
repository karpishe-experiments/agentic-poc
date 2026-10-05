import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { parseReferenceProposal, type VisualStyleProposal } from "@/lib/contracts/experiment-references";

export const EXPERIMENT_PROFILE = "dify_booklet_v1" as const;
export const experimentTaskSchema = z.enum(["J01", "J02", "J03", "J04", "J05", "J06", "J07", "J08", "J09", "J10", "J11", "J12", "J13"]);
export const experimentRoleSchema = z.enum(["manager", "specialist", "tester", "judge", "image"]);
export const personaSchema = z.enum(["playful_kid", "enthusiast_parent", "professional_creator"]);
export const experimentModeSchema = z.enum(["simulated", "balanced", "real"]);
export const runStatusSchema = z.enum(["queued", "running", "paused", "blocked", "completed", "failed"]);
export const operationStateSchema = z.enum(["prepared", "started", "succeeded", "failed", "unknown"]);
export const evaluationStatusSchema = z.enum(["pending", "running", "complete", "failed"]);

export type ExperimentTask = z.infer<typeof experimentTaskSchema>;
export type ExperimentRole = z.infer<typeof experimentRoleSchema>;
export type Persona = z.infer<typeof personaSchema>;
export type ExperimentMode = z.infer<typeof experimentModeSchema>;

// These are logical per-run ceilings in every mode. They confer no spending authority.
export const CASES = {
  playful_kid: { brief: "A young inventor and tiny robot rescue a runaway kite; playful and reassuring; readers 6–8; three single-scene story pages plus cover, two recurring characters, one location.", storyPages: 3, llmLimit: 120, imageLimit: 12, textRevisionLimit: 1, imageRevisionLimit: 1 },
  enthusiast_parent: { brief: "A child and grandparent turn a rainy afternoon into an indoor adventure; warm; readers 3–5; five story pages plus cover, two recurring characters, one location, including one simple two-panel page.", storyPages: 5, llmLimit: 160, imageLimit: 14, textRevisionLimit: 1, imageRevisionLimit: 1 },
  professional_creator: { brief: "Two friends repair a community observatory after a disagreement; precise emotional arc; readers 9–12; eight story pages plus cover, two recurring characters, two locations, at least two multi-panel pages.", storyPages: 8, llmLimit: 220, imageLimit: 20, textRevisionLimit: 3, imageRevisionLimit: 2 },
} as const satisfies Record<Persona, { brief: string; storyPages: number; llmLimit: number; imageLimit: number; textRevisionLimit: number; imageRevisionLimit: number }>;

export const createRunInputSchema = z.strictObject({ persona: personaSchema, mode: experimentModeSchema, predecessorRunId: opaqueIdSchema.optional() });
export const lineageSchema = z.strictObject({
  correlationId: opaqueIdSchema,
  parentWorkflowRunId: opaqueIdSchema.nullable(),
  workflowRunId: opaqueIdSchema,
  role: experimentRoleSchema,
  operationId: opaqueIdSchema,
});

const text = z.string().trim().min(1).max(16_000);
const title = z.string().trim().min(1).max(1_000);
const textList = z.array(text).max(100);
const contentVersion = z.literal("2");

export const conceptBriefSchema = z.object({
  schemaVersion: contentVersion,
  title,
  sourceInput: text,
  audience: z.object({ ageBand: z.enum(["3-5", "6-8", "9-12"]), readingNeeds: text }),
  premise: text,
  theme: text,
  emotionalPromise: text,
  tone: text,
  storyScope: text,
  contentRequirements: textList,
  knownConstraints: textList,
  deferredDecisions: textList,
  approvalQuestions: textList,
});

export const storyOutlineSchema = z.object({
  schemaVersion: contentVersion,
  title,
  summary: text,
  characters: z.array(z.object({ nameOrRole: text, narrativeRole: text, relationship: text, openDetails: textList })).min(1).max(100),
  locations: z.array(z.object({ name: text, storyPurpose: text, openDetails: textList })).min(1).max(100),
  storyArc: z.object({ opening: text, incitingAction: text, escalation: text, decisiveChoice: text, resolution: text }),
  theme: text,
  emotionalArc: text,
  deferredDecisions: textList,
  approvalQuestions: textList,
});

export type ConceptBriefContent = z.infer<typeof conceptBriefSchema>;
export type StoryOutlineContent = z.infer<typeof storyOutlineSchema>;
export type NarrativeContent = ConceptBriefContent | StoryOutlineContent;
export type NarrativeWarning = { field: string; message: string };
export const narrativeTaskSchema = z.enum(["J01", "J02", "J03", "J04", "J05", "J06", "J07", "J08"]);
const characterEntryKey = z.enum(["character_1", "character_2"]);
const locationEntryKey = z.enum(["location_1", "location_2"]);

export const draftCharacterListSchema = z.object({
  schemaVersion: contentVersion,
  title,
  characters: z.array(z.object({
    entryKey: characterEntryKey,
    nameOrRole: text,
    narrativeFunction: text,
    role: z.enum(["main", "supporting", "incidental"]),
    knownRelationship: text,
    knownFacts: textList,
    openQuestions: textList,
  })).length(2).refine((entries) => new Set(entries.map((entry) => entry.entryKey)).size === entries.length, "Character entry keys must be unique."),
  castNotes: textList,
  representationAndSafety: textList,
  manuscriptQuestions: textList,
  approvalQuestions: textList,
});

export const draftLocationListSchema = z.object({
  schemaVersion: contentVersion,
  title,
  locations: z.array(z.object({
    entryKey: locationEntryKey,
    title,
    storyPurpose: text,
    knownFacts: textList,
    likelyScenes: textList,
    openQuestions: textList,
  })).min(1).max(2).refine((entries) => new Set(entries.map((entry) => entry.entryKey)).size === entries.length, "Location entry keys must be unique."),
  worldAndSafetyNotes: textList,
  manuscriptQuestions: textList,
  approvalQuestions: textList,
});

export const storedDraftCharacterListSchema = draftCharacterListSchema.extend({
  characters: z.array(draftCharacterListSchema.shape.characters.element.extend({ characterId: opaqueIdSchema })).length(2).refine((entries) => new Set(entries.map((entry) => entry.entryKey)).size === entries.length && new Set(entries.map((entry) => entry.characterId)).size === entries.length),
});
export const storedDraftLocationListSchema = draftLocationListSchema.extend({
  locations: z.array(draftLocationListSchema.shape.locations.element.extend({ locationId: opaqueIdSchema })).min(1).max(2).refine((entries) => new Set(entries.map((entry) => entry.entryKey)).size === entries.length && new Set(entries.map((entry) => entry.locationId)).size === entries.length),
});

const manuscriptUnitSchema = z.object({
  unitKey: z.string().trim().min(1).max(1_000),
  beatTitle: title,
  prose: text,
  action: text,
  narration: text,
  charactersPresent: z.array(opaqueIdSchema).min(1).max(2).refine((ids) => new Set(ids).size === ids.length),
  locationId: opaqueIdSchema,
  dialogue: z.array(z.object({ speakerId: opaqueIdSchema, text })).max(100),
});
export const manuscriptSchema = z.object({
  schemaVersion: contentVersion,
  title,
  continuityNotes: textList,
  units: z.array(manuscriptUnitSchema).min(1).max(100).refine((units) => new Set(units.map((unit) => unit.unitKey)).size === units.length),
  expansionNotes: textList,
  openQuestions: textList,
  approvalQuestions: textList,
});
export const storedManuscriptSchema = manuscriptSchema.extend({
  units: z.array(manuscriptUnitSchema.extend({ unitId: opaqueIdSchema })).min(1).max(100).refine((units) => new Set(units.map((unit) => unit.unitKey)).size === units.length && new Set(units.map((unit) => unit.unitId)).size === units.length),
});
export const finalCharacterListSchema = z.object({
  schemaVersion: contentVersion,
  title,
  characters: z.array(z.object({
    characterId: opaqueIdSchema,
    nameOrRole: text,
    narrativeFunction: text,
    background: text,
    lifeStage: text,
    physicalDescription: text,
    personalityAndActing: text,
    attireRequirements: textList,
    accessories: textList,
    expressions: textList,
    openQuestions: textList,
    unitIds: z.array(opaqueIdSchema).min(1).max(100).refine((ids) => new Set(ids).size === ids.length),
    recurrence: z.enum(["recurring", "single_scene"]),
    sheetRequired: z.boolean(),
  })).length(2).refine((characters) => new Set(characters.map((character) => character.characterId)).size === characters.length),
  profileGuidance: textList,
  representationAndContinuity: textList,
  approvalQuestions: textList,
});
export const finalLocationListSchema = z.object({
  schemaVersion: contentVersion,
  title,
  locations: z.array(z.object({
    locationId: opaqueIdSchema,
    title,
    storyPurpose: text,
    basicDescription: text,
    stableAnchors: textList,
    requiredFeatures: textList,
    continuityNotes: textList,
    openQuestions: textList,
    unitIds: z.array(opaqueIdSchema).min(1).max(100).refine((ids) => new Set(ids).size === ids.length),
    sheetRequired: z.literal(true),
  })).min(1).max(2).refine((locations) => new Set(locations.map((location) => location.locationId)).size === locations.length),
  profileGuidance: textList,
  worldSafetyAndAccessibility: textList,
  approvalQuestions: textList,
});
export type ManuscriptContent = z.infer<typeof manuscriptSchema>;
export type FinalCharacterListContent = z.infer<typeof finalCharacterListSchema>;
export type FinalLocationListContent = z.infer<typeof finalLocationListSchema>;

export type DraftCharacterListContent = z.infer<typeof draftCharacterListSchema>;
export type DraftLocationListContent = z.infer<typeof draftLocationListSchema>;
export const MAX_DRAFT_LIST_CONTENT_BYTES = 512 * 1024;
// Leave room in a Mongo document for version metadata, dependencies and provenance.
export const MAX_NARRATIVE_CONTENT_BYTES = 2 * 1024 * 1024;

function collectWarnings(value: unknown, path: string[] = []): NarrativeWarning[] {
  if (typeof value === "string") {
    const words = value.trim().split(/\s+/u).length;
    const field = path.join(".");
    const warnings: NarrativeWarning[] = [];
    if (field === "title" && value.length > 240) warnings.push({ field, message: "Title exceeds the preferred 240 characters." });
    if (field !== "title" && value.length > 2_000) warnings.push({ field, message: "Text exceeds the preferred 2,000 characters." });
    if (field !== "title" && words > 300) warnings.push({ field, message: "Text exceeds the preferred 300 words." });
    return warnings;
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => collectWarnings(item, [...path, String(index)]));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => collectWarnings(item, [...path, key]));
  return [];
}

export function parseNarrativeProposal(task: "J01", content: unknown): { content: ConceptBriefContent; warnings: NarrativeWarning[] };
export function parseNarrativeProposal(task: "J02", content: unknown): { content: StoryOutlineContent; warnings: NarrativeWarning[] };
export function parseNarrativeProposal(task: "J01" | "J02", content: unknown): { content: NarrativeContent; warnings: NarrativeWarning[] };
export function parseNarrativeProposal(task: "J01" | "J02", content: unknown): { content: NarrativeContent; warnings: NarrativeWarning[] } {
  const parsed = task === "J01" ? conceptBriefSchema.parse(content) : storyOutlineSchema.parse(content);
  if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > MAX_NARRATIVE_CONTENT_BYTES) {
    throw new Error("Narrative content exceeds the 2 MiB storage limit. Shorten the proposal before submitting it.");
  }
  return { content: parsed, warnings: collectWarnings(parsed) };
}

export function parseDraftListProposal(task: "J03", persona: Persona, content: unknown): { content: DraftCharacterListContent; warnings: NarrativeWarning[] };
export function parseDraftListProposal(task: "J04", persona: Persona, content: unknown): { content: DraftLocationListContent; warnings: NarrativeWarning[] };
export function parseDraftListProposal(task: "J03" | "J04", persona: Persona, content: unknown): { content: DraftCharacterListContent | DraftLocationListContent; warnings: NarrativeWarning[] };
export function parseDraftListProposal(task: "J03" | "J04", persona: Persona, content: unknown): { content: DraftCharacterListContent | DraftLocationListContent; warnings: NarrativeWarning[] } {
  const parsed = task === "J03" ? draftCharacterListSchema.parse(content) : draftLocationListSchema.parse(content);
  if (task === "J04" && "locations" in parsed && parsed.locations.length !== (persona === "professional_creator" ? 2 : 1)) {
    throw new Error(`J04 requires ${persona === "professional_creator" ? 2 : 1} locations for ${persona}.`);
  }
  if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > MAX_DRAFT_LIST_CONTENT_BYTES) {
    throw new Error("Draft list content exceeds the 512 KiB storage limit. Shorten the proposal before submitting it.");
  }
  return { content: parsed, warnings: collectWarnings(parsed) };
}

export function parseNarrativeTaskProposal(task: "J01", persona: Persona, content: unknown): { content: ConceptBriefContent; warnings: NarrativeWarning[] };
export function parseNarrativeTaskProposal(task: "J02", persona: Persona, content: unknown): { content: StoryOutlineContent; warnings: NarrativeWarning[] };
export function parseNarrativeTaskProposal(task: "J03", persona: Persona, content: unknown): { content: DraftCharacterListContent; warnings: NarrativeWarning[] };
export function parseNarrativeTaskProposal(task: "J04", persona: Persona, content: unknown): { content: DraftLocationListContent; warnings: NarrativeWarning[] };
export function parseNarrativeTaskProposal(task: "J05", persona: Persona, content: unknown): { content: ManuscriptContent; warnings: NarrativeWarning[] };
export function parseNarrativeTaskProposal(task: "J06", persona: Persona, content: unknown): { content: FinalCharacterListContent; warnings: NarrativeWarning[] };
export function parseNarrativeTaskProposal(task: "J07", persona: Persona, content: unknown): { content: FinalLocationListContent; warnings: NarrativeWarning[] };
export function parseNarrativeTaskProposal(task: "J08", persona: Persona, content: unknown): { content: VisualStyleProposal; warnings: NarrativeWarning[] };
export function parseNarrativeTaskProposal(task: z.infer<typeof narrativeTaskSchema>, persona: Persona, content: unknown): { content: NarrativeContent | DraftCharacterListContent | DraftLocationListContent | ManuscriptContent | FinalCharacterListContent | FinalLocationListContent | VisualStyleProposal; warnings: NarrativeWarning[] };
export function parseNarrativeTaskProposal(task: z.infer<typeof narrativeTaskSchema>, persona: Persona, content: unknown) {
  if (task === "J08") return parseReferenceProposal("J08", "proposal", content);
  if (task === "J01" || task === "J02") return parseNarrativeProposal(task, content);
  if (task === "J03" || task === "J04") return parseDraftListProposal(task, persona, content);
  const parsed = task === "J05" ? manuscriptSchema.parse(content) : task === "J06" ? finalCharacterListSchema.parse(content) : finalLocationListSchema.parse(content);
  if (task === "J07" && "locations" in parsed && parsed.locations.length !== (persona === "professional_creator" ? 2 : 1)) {
    throw new Error(`J07 requires ${persona === "professional_creator" ? 2 : 1} locations for ${persona}.`);
  }
  if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > MAX_DRAFT_LIST_CONTENT_BYTES) {
    throw new Error("Narrative task content exceeds the 512 KiB storage limit. Shorten the proposal before submitting it.");
  }
  return { content: parsed, warnings: collectWarnings(parsed) };
}

const questionPayload = z.strictObject({ question: text });
const uniqueIds = z.array(opaqueIdSchema).min(1).max(100).refine((items) => new Set(items).size === items.length);
const uniqueTasks = z.array(experimentTaskSchema).min(1).max(13).refine((items) => new Set(items).size === items.length);
export const testerDecisionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("delegate"), taskIds: uniqueTasks, subjectId: opaqueIdSchema }),
  z.strictObject({ action: z.literal("revoke_delegation"), delegationId: opaqueIdSchema }),
  z.strictObject({ action: z.literal("approve"), versionIds: uniqueIds }),
  z.strictObject({ action: z.literal("answer"), questionId: opaqueIdSchema, text }),
  z.strictObject({ action: z.literal("revise"), taskId: narrativeTaskSchema, artifactVersionId: opaqueIdSchema, instruction: text }),
]);
export type TesterDecision = z.infer<typeof testerDecisionSchema>;
const managerDelegate = z.strictObject({ kind: z.literal("delegate"), payload: z.strictObject({ taskId: narrativeTaskSchema, subjectKind: z.literal("book"), subjectId: opaqueIdSchema }) });
const managerAsk = z.strictObject({ kind: z.literal("ask"), payload: questionPayload });
const specialistProposal = z.strictObject({ kind: z.literal("proposal"), payload: z.strictObject({ taskId: narrativeTaskSchema, content: z.unknown() }) });
const specialistClarification = z.strictObject({ kind: z.literal("clarification"), payload: questionPayload });
const testerDecision = z.strictObject({ kind: z.literal("decision"), payload: z.strictObject({ decision: testerDecisionSchema }) });
const testerFeedback = z.strictObject({ kind: z.literal("feedback"), payload: z.unknown() });
const judgeAssessment = z.strictObject({ kind: z.literal("assessment"), payload: z.unknown() });
export const roleResultSchema = z.discriminatedUnion("kind", [managerDelegate, managerAsk, specialistProposal, specialistClarification, testerDecision, testerFeedback, judgeAssessment]);
export type RoleResult = z.infer<typeof roleResultSchema>;

export const resultEnvelopeSchema = z.strictObject({
  runId: opaqueIdSchema,
  operationId: opaqueIdSchema,
  workflowRunId: opaqueIdSchema,
  inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  result: roleResultSchema,
});

const allowedKinds: Record<ExperimentRole, ReadonlySet<RoleResult["kind"]>> = {
  manager: new Set(["delegate", "ask"]),
  specialist: new Set(["proposal", "clarification"]),
  tester: new Set(["decision", "feedback"]),
  judge: new Set(["assessment"]),
  image: new Set(),
};

// This checks result routing only. The owning service validates decisions, grants,
// operation identity, task eligibility and current source versions before mutation.
export function validateRoleResult(role: ExperimentRole, result: unknown): RoleResult {
  const parsed = roleResultSchema.parse(result);
  if (!allowedKinds[role].has(parsed.kind)) throw new Error(`Result kind ${parsed.kind} is not allowed for ${role}.`);
  return parsed;
}
