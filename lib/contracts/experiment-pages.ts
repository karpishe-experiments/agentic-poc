import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { CASES, personaSchema, type Persona } from "@/lib/contracts/experiment-runner";

const text = z.string().min(1).max(16_000).refine((value) => value.trim().length > 0);
const shortText = z.string().min(1).max(1_000).refine((value) => value.trim().length > 0);
const ids = z.array(opaqueIdSchema).max(100).refine((items) => new Set(items).size === items.length);
const notes = z.array(text).max(100);
const positive = z.number().int().positive();
const measure = z.number().positive();
const normalizedRect = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().gt(0).max(1), height: z.number().gt(0).max(1) })
  .refine((rect) => rect.x + rect.width <= 1 && rect.y + rect.height <= 1);

const sheetReferenceSchema = z.object({
  subjectKind: z.enum(["character", "location"]),
  subjectId: opaqueIdSchema,
  artifactVersionId: opaqueIdSchema,
  assetId: opaqueIdSchema,
});

const routedReferences = z.array(sheetReferenceSchema).max(20).refine((items) =>
  new Set(items.map((item) => `${item.subjectKind}:${item.subjectId}`)).size === items.length &&
  new Set(items.map((item) => item.assetId)).size === items.length,
  "Sheet subjects and assets must be unique within a panel.",
);

const sourceRouting = z.object({ manuscriptUnitIds: ids, sheetReferences: routedReferences });
const panelKey = shortText;
const letteringKind = z.enum(["narration", "speech", "thought", "sound_effect", "title", "credit", "diegetic"]);
const letteringForm = z.enum(["caption", "bubble", "display", "in_scene"]);

const typographyEntry = z.object({
  kind: letteringKind,
  fontDirection: text,
  sizeHierarchy: text,
  containerTreatment: text,
  placementRules: text,
});

export const pageCanvasSchema = z.object({
  trim: z.object({ width: measure, height: measure, unit: z.enum(["mm", "in"]) }),
  orientation: z.enum(["square", "landscape", "portrait"]),
  aspectRatio: z.object({ width: positive, height: positive }),
  workingPixels: z.object({ width: positive, height: positive }),
  bleed: z.object({ top: z.number().nonnegative(), right: z.number().nonnegative(), bottom: z.number().nonnegative(), left: z.number().nonnegative(), unit: z.enum(["mm", "in"]) }),
  binding: z.object({ edge: z.enum(["left", "right", "top"]), allowance: z.number().nonnegative(), unit: z.enum(["mm", "in"]) }),
  liveTextSafeMargins: z.object({ top: z.number().nonnegative(), right: z.number().nonnegative(), bottom: z.number().nonnegative(), left: z.number().nonnegative(), unit: z.enum(["mm", "in"]) }),
  readingDirection: z.enum(["left_to_right", "right_to_left"]),
});

export const pageLayoutProposalSchema = z.object({
  schemaVersion: z.literal("2"),
  title: shortText,
  canvas: pageCanvasSchema,
  typography: z.array(typographyEntry).length(7).refine((entries) => new Set(entries.map((entry) => entry.kind)).size === 7),
  pages: z.array(z.object({
    pageIndex: z.number().int().nonnegative(),
    pageTurnRhythm: text,
    panels: z.array(z.object({
      panelKey,
      manuscriptUnitIds: ids,
      textCapacity: z.number().int().nonnegative(),
      liveTextSafeRegion: normalizedRect,
      sheetReferences: routedReferences,
      deferredCompositionDecisions: notes,
    })).min(1).max(4).refine((panels) => new Set(panels.map((panel) => panel.panelKey)).size === panels.length),
  })).min(4).max(9),
  deferredCompositionDecisions: notes,
  approvalQuestions: notes,
});

const letteringSchema = z.object({
  kind: letteringKind,
  text,
  form: letteringForm,
  speakerEntityId: opaqueIdSchema.nullable(),
  panelKey,
  placement: text,
  typographyTreatment: text,
  bubbleTreatment: text,
});

export const pageSubjectProposalSchema = z.object({
  schemaVersion: z.literal("2"),
  pageId: opaqueIdSchema,
  pageIndex: z.number().int().nonnegative(),
  layoutVersionId: opaqueIdSchema,
  manuscriptVersionId: opaqueIdSchema,
  styleVersionId: opaqueIdSchema,
  panels: z.array(sourceRouting.extend({
    panelKey,
    actionBeat: text,
    emotionalBeat: text,
    composition: text,
    characterIds: z.array(opaqueIdSchema).max(20).refine((items) => new Set(items).size === items.length),
    locationIds: z.array(opaqueIdSchema).max(20).refine((items) => new Set(items).size === items.length),
    lettering: z.array(letteringSchema).max(20),
    noText: z.boolean(),
  })).min(1).max(4).refine((panels) => new Set(panels.map((panel) => panel.panelKey)).size === panels.length),
  reviewQuestions: notes,
});

export type PageLayoutProposal = z.infer<typeof pageLayoutProposalSchema>;
export type PageSubjectProposal = z.infer<typeof pageSubjectProposalSchema>;
export type PageWarning = { field: string; message: string };

function inspect(value: unknown, depth = 0): void {
  if (depth > 20) throw new Error("Page content exceeds JSON depth 20.");
  if (Array.isArray(value)) value.forEach((item) => inspect(item, depth + 1));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => inspect(item, depth + 1));
}

function warnings(value: unknown, path = ""): PageWarning[] {
  if (typeof value === "string") return value.length > (path === "title" ? 240 : 2_000)
    ? [{ field: path, message: `Text exceeds the preferred ${path === "title" ? 240 : 2_000} characters.` }] : [];
  if (Array.isArray(value)) return value.flatMap((item, index) => warnings(item, `${path}.${index}`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => warnings(item, path ? `${path}.${key}` : key));
  return [];
}

function checkJ11(content: PageLayoutProposal, persona: Persona): void {
  const { trim, aspectRatio, workingPixels, orientation } = content.canvas;
  const ratios = [trim.width / trim.height, aspectRatio.width / aspectRatio.height, workingPixels.width / workingPixels.height];
  if (Math.max(...ratios) / Math.min(...ratios) > 1.02 ||
    (orientation === "square" && Math.abs(ratios[0] - 1) > 0.02) ||
    (orientation === "landscape" && ratios[0] <= 1) || (orientation === "portrait" && ratios[0] >= 1)) {
    throw new Error("Canvas trim, aspect ratio, working pixels and orientation must agree.");
  }
  const expected = CASES[persona].storyPages + 1;
  if (content.pages.length !== expected || content.pages.some((page, index) => page.pageIndex !== index)) {
    throw new Error(`J11 requires ordered page indices 0 through ${expected - 1}.`);
  }
  const multi = content.pages.slice(1).filter((page) => page.panels.length > 1);
  if (persona === "playful_kid" && multi.length !== 0) throw new Error("Kid story pages must be single-scene.");
  if (persona === "enthusiast_parent" && (multi.length !== 1 || multi[0].panels.length !== 2)) throw new Error("Parent requires one two-panel story page.");
  if (persona === "professional_creator" && multi.length < 2) throw new Error("Creator requires at least two multi-panel story pages.");
}

function checkJ12(content: PageSubjectProposal): void {
  if (content.pageIndex === 0 && !content.panels.some((panel) => panel.lettering.some((item) => item.kind === "title"))) {
    throw new Error("Cover requires exact title lettering.");
  }
  for (const panel of content.panels) {
    if (panel.noText === (panel.lettering.length > 0)) throw new Error("Panel must contain lettering or explicitly declare noText.");
    if (panel.lettering.some((item) => item.panelKey !== panel.panelKey)) throw new Error("Lettering panel assignment must match its panel.");
    if (panel.lettering.some((item) => (item.kind === "speech" || item.kind === "thought") &&
      (item.speakerEntityId === null || !panel.characterIds.includes(item.speakerEntityId)))) throw new Error("Speech and thought speakers must be panel characters.");
    const routedCharacters = panel.sheetReferences.filter((item) => item.subjectKind === "character").map((item) => item.subjectId);
    const routedLocations = panel.sheetReferences.filter((item) => item.subjectKind === "location").map((item) => item.subjectId);
    if (new Set(routedCharacters).size !== panel.characterIds.length || panel.characterIds.some((item) => !routedCharacters.includes(item)) ||
      new Set(routedLocations).size !== panel.locationIds.length || panel.locationIds.some((item) => !routedLocations.includes(item))) {
      throw new Error("Panel sheet references must match its character and location subjects.");
    }
  }
}

export function parsePageProposal(task: "J11", persona: Persona, input: unknown): { content: PageLayoutProposal; warnings: PageWarning[] };
export function parsePageProposal(task: "J12", persona: Persona, input: unknown): { content: PageSubjectProposal; warnings: PageWarning[] };
export function parsePageProposal(task: "J11" | "J12", persona: Persona, input: unknown): { content: PageLayoutProposal | PageSubjectProposal; warnings: PageWarning[] } {
  personaSchema.parse(persona);
  inspect(input);
  const content = task === "J11" ? pageLayoutProposalSchema.parse(input) : pageSubjectProposalSchema.parse(input);
  if (new TextEncoder().encode(JSON.stringify(content)).byteLength > 512 * 1024) throw new Error("Page content exceeds 512 KiB.");
  if (task === "J11") checkJ11(content as PageLayoutProposal, persona);
  else {
    if ((content as PageSubjectProposal).pageIndex > CASES[persona].storyPages) throw new Error("J12 page index is outside this case.");
    checkJ12(content as PageSubjectProposal);
  }
  return { content, warnings: warnings(content) };
}
