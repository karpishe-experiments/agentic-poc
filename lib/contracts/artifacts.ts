import { z } from "zod";
import { normalizedRectSchema, opaqueIdSchema, schemaVersionSchema, utcIsoTimestampSchema } from "@/lib/contracts/common";
import { artifactStateSchema, artifactTypeSchema, type ArtifactType } from "@/lib/contracts/domain";

const shortText = (maximum = 2_000) => z.string().trim().min(1).max(maximum);
const textList = (maximumItems = 20, maximumLength = 1_000) => z.array(shortText(maximumLength)).max(maximumItems);

export const audienceProfileSchema = z.object({
  schemaVersion: schemaVersionSchema,
  ageBand: z.enum(["3-5", "6-8", "9-12"]),
  interests: textList(12, 240).min(1),
  readingNeeds: shortText(),
  tone: shortText(240),
  avoidList: textList(),
  knownFacts: textList(),
  openAssumptions: textList(),
});

const storyEntitySchema = z.object({
  entityId: opaqueIdSchema,
  name: shortText(160),
  narrativeRole: shortText(240),
  named: z.boolean(),
  continuityRelevant: z.boolean(),
  recurringVisualSubject: z.boolean(),
});

export const storyCharacterSchema = storyEntitySchema.extend({
  goal: shortText(1_000),
  relationships: textList(12, 500),
});

export const storySettingSchema = storyEntitySchema;

export const storyPlanSchema = z.object({
  schemaVersion: schemaVersionSchema,
  premise: shortText(),
  theme: shortText(500),
  characters: z.array(storyCharacterSchema).max(12),
  settings: z.array(storySettingSchema).max(12),
  storyArc: shortText(),
  keyEvents: textList(16).min(1),
  ending: shortText(),
  ageFitNotes: shortText(),
  continuityConstraints: textList(),
}).superRefine((plan, context) => {
  const entityIds = [...plan.characters, ...plan.settings].map((entity) => entity.entityId);
  if (new Set(entityIds).size !== entityIds.length) context.addIssue({ code: "custom", path: ["characters"], message: "Character and location IDs must be unique." });
});

export const visualStyleSchema = z.object({
  schemaVersion: schemaVersionSchema,
  styleId: z.string().trim().min(1).max(120),
  name: shortText(160),
  rationale: shortText(),
  visualDirection: shortText(),
  palette: textList(12, 120).min(1),
  texture: shortText(240),
  lighting: shortText(240),
  styleReferenceAssetIds: z.array(opaqueIdSchema).max(6),
});

const visualEntityDefinitionSchema = z.object({
  entityId: opaqueIdSchema,
  name: shortText(160),
  visualDetails: textList(16, 500).min(1),
  continuityConstraints: textList(),
  referenceRequired: z.boolean(),
  currentReferenceAssetId: opaqueIdSchema.nullable(),
  revisionNumber: z.number().int().positive(),
});

export const visualBibleSchema = z.object({
  schemaVersion: schemaVersionSchema,
  characters: z.array(visualEntityDefinitionSchema).max(12),
  locations: z.array(visualEntityDefinitionSchema).max(12),
  styleReferences: z.array(opaqueIdSchema).max(6),
}).superRefine((bible, context) => {
  const definitions = [...bible.characters, ...bible.locations];
  if (new Set(definitions.map((definition) => definition.entityId)).size !== definitions.length) {
    context.addIssue({ code: "custom", path: ["characters"], message: "Visual Bible entity IDs must be unique." });
  }
});

export const geometrySchema = z.enum(["landscape_5_4", "portrait_4_5", "square_1_1"]);

export const bookletSpecificationSchema = z.object({
  schemaVersion: schemaVersionSchema,
  title: shortText(240),
  coverDirection: shortText(),
  storyPageCount: z.number().int().min(3).max(8),
  geometry: geometrySchema,
  geometryConfirmed: z.boolean(),
  typographyTheme: shortText(240),
  dialoguePolicy: shortText(500),
  castLimitWarningAccepted: z.boolean(),
  locationLimitWarningAccepted: z.boolean(),
});

export const letteringKindSchema = z.enum(["title", "narration", "dialogue", "thought", "sound_effect"]);
export const letteringElementSchema = z.object({
  kind: letteringKindSchema,
  text: z.string().trim().min(1).max(240),
  speakerEntityId: opaqueIdSchema.nullable().optional(),
  delivery: z.string().trim().min(1).max(120),
  placementHint: z.string().trim().min(1).max(240),
});

export function letteringReaderText(lettering: z.infer<typeof letteringElementSchema>[]): string {
  return lettering.map((element) => element.text).join(" ");
}

export const pagePackageSchema = z.object({
  pageId: opaqueIdSchema,
  pageIndex: z.number().int().min(0).max(8),
  kind: z.enum(["cover", "story"]),
  readerText: z.string().trim().max(5_000),
  sceneAction: shortText(),
  characterIds: z.array(opaqueIdSchema).max(12),
  locationIds: z.array(opaqueIdSchema).max(6),
  incidentalVisualDetails: textList(),
  compositionIntent: shortText(),
  continuityNotes: textList(),
  relevantReferenceIds: z.array(opaqueIdSchema).max(12),
  textSafeRegion: normalizedRectSchema,
  lettering: z.array(letteringElementSchema).min(1).max(5).optional(),
}).superRefine((page, context) => {
  if (!page.lettering) return;
  const words = page.lettering.reduce((total, element) => total + element.text.split(/\s+/).filter(Boolean).length, 0);
  if (page.kind === "story" && words > 45) context.addIssue({ code: "custom", path: ["lettering"], message: "Story-page comic lettering must stay within 45 words." });
  for (const [index, element] of page.lettering.entries()) {
    const needsSpeaker = element.kind === "dialogue" || element.kind === "thought";
    if (needsSpeaker && !element.speakerEntityId) context.addIssue({ code: "custom", path: ["lettering", index, "speakerEntityId"], message: `${element.kind} needs a speaker.` });
    if (element.speakerEntityId && !page.characterIds.includes(element.speakerEntityId)) context.addIssue({ code: "custom", path: ["lettering", index, "speakerEntityId"], message: "The lettering speaker must appear on this page." });
    if (!needsSpeaker && element.speakerEntityId) context.addIssue({ code: "custom", path: ["lettering", index, "speakerEntityId"], message: `${element.kind} cannot have a speaker.` });
  }
  if (letteringReaderText(page.lettering) !== page.readerText) context.addIssue({ code: "custom", path: ["readerText"], message: "Reader text must match lettering in reading order." });
});

export const pagePlanSchema = z.object({
  schemaVersion: schemaVersionSchema,
  storyPageCount: z.number().int().min(3).max(8),
  geometry: geometrySchema,
  pages: z.array(pagePackageSchema).min(4).max(9),
}).superRefine((plan, context) => {
  if (plan.pages.length !== plan.storyPageCount + 1) context.addIssue({ code: "custom", path: ["pages"], message: "A page plan needs one cover plus the exact story-page count." });
  const indices = plan.pages.map((page) => page.pageIndex).sort((a, b) => a - b);
  if (indices.some((index, expected) => index !== expected)) context.addIssue({ code: "custom", path: ["pages"], message: "Page indices must begin at zero with no gaps." });
  if (plan.pages.filter((page) => page.kind === "cover" && page.pageIndex === 0).length !== 1 || plan.pages.some((page) => page.pageIndex === 0 && page.kind !== "cover") || plan.pages.some((page) => page.pageIndex > 0 && page.kind !== "story")) {
    context.addIssue({ code: "custom", path: ["pages"], message: "The cover is page zero; every following page is one story illustration." });
  }
});

export const finalPagesSchema = z.object({
  schemaVersion: schemaVersionSchema,
  pages: z.array(z.object({
    pageId: opaqueIdSchema,
    pageIndex: z.number().int().min(0).max(8),
    sourceIllustrationAssetId: opaqueIdSchema,
    composedAssetId: opaqueIdSchema,
    readerText: z.string().max(5_000),
    lettering: z.array(letteringElementSchema).min(1).max(5).optional(),
    textSafeRegion: normalizedRectSchema,
    revisionNumber: z.number().int().positive(),
    acceptedQualityIssueIds: z.array(opaqueIdSchema),
  })).min(4).max(9),
});

export const pdfExportDocumentSchema = z.object({
  schemaVersion: schemaVersionSchema,
  exportId: opaqueIdSchema,
  finalPageVersionIds: z.array(opaqueIdSchema).min(1),
  finalPageAssetIds: z.array(opaqueIdSchema).min(1),
  preflightSummary: z.object({ passed: z.boolean(), checks: textList(20, 500) }),
  pdfAssetId: opaqueIdSchema.nullable(),
  createdAt: utcIsoTimestampSchema,
});

export const artifactDocumentSchemas = {
  audience_profile: audienceProfileSchema,
  story_plan: storyPlanSchema,
  visual_style: visualStyleSchema,
  visual_bible: visualBibleSchema,
  booklet_specification: bookletSpecificationSchema,
  page_plan: pagePlanSchema,
  final_pages: finalPagesSchema,
  pdf_export: pdfExportDocumentSchema,
} satisfies Record<ArtifactType, z.ZodType>;

export function parseArtifactDocument(artifactType: ArtifactType, content: unknown): unknown {
  return artifactDocumentSchemas[artifactType].parse(content);
}

export const artifactVersionSchema = z.object({
  id: opaqueIdSchema,
  artifactId: opaqueIdSchema,
  versionNumber: z.number().int().positive(),
  schemaVersion: schemaVersionSchema,
  content: z.unknown(),
  createdBy: z.enum(["agent", "user_edit", "repair", "application"]),
  sourceVersionId: opaqueIdSchema.nullable(),
  createdAt: utcIsoTimestampSchema,
});

export const approvalSchema = z.object({
  id: opaqueIdSchema,
  artifactVersionId: opaqueIdSchema,
  scope: z.enum(["artifact_content", "reference", "page", "artifact"]),
  subjectKey: z.string().min(1).nullable(),
  action: z.string().min(1),
  origin: z.enum(["user", "carried_forward"]),
  createdAt: utcIsoTimestampSchema,
});

export const artifactDetailSchema = z.object({
  artifactType: artifactTypeSchema,
  state: artifactStateSchema,
  currentVersion: artifactVersionSchema.nullable(),
  history: z.array(artifactVersionSchema),
  approvals: z.array(approvalSchema),
});

export type ArtifactVersion = z.infer<typeof artifactVersionSchema>;
export type ArtifactApproval = z.infer<typeof approvalSchema>;
export type ArtifactDetail = z.infer<typeof artifactDetailSchema>;
