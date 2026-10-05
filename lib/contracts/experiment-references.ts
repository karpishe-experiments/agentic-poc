import { createHash } from "node:crypto";
import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";

const text = z.string().min(1).max(16_000).refine((value) => value.trim().length > 0);
const title = z.string().min(1).max(1_000).refine((value) => value.trim().length > 0);
const list = z.array(text).max(100);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const uniqueIds = z.array(opaqueIdSchema).min(1).max(10).refine((ids) => new Set(ids).size === ids.length);
const sourceIds = uniqueIds;

export const referenceBuildSchema = z.object({
  prompt: text,
  stylePromptModuleHash: hash,
  operationId: opaqueIdSchema,
  assetId: opaqueIdSchema,
  sourceVersionIds: sourceIds,
});

const styleDefinition = z.object({
  mediumAndLineWork: text,
  shapeLanguageAndProportions: text,
  colourAndContrast: text,
  textureAndRendering: text,
  lightingAndAtmosphere: text,
  emotionalTone: text,
  accessibilityAndReadability: text,
});
const styleBase = z.object({
  schemaVersion: z.literal("2"),
  title,
  styleDefinition,
  typographyDirection: text,
  speechAndThoughtBubbleDirection: text,
  stylePromptModule: text,
  stylePromptModuleHash: hash,
  exclusions: list,
  approvalQuestions: list,
});
const samplePlan = z.object({ sampleKey: z.enum(["sample_1", "sample_2"]), purpose: text });
const sample = samplePlan.extend({ build: referenceBuildSchema });

// J08 sources are approved J01, J02, J05, J06 and J07 versions. The owning
// service verifies identity and approval; this parser only checks local shape.
export const visualStyleProposalSchema = styleBase.extend({
  samplePlan: z.array(samplePlan).length(2).refine((items) => new Set(items.map((item) => item.sampleKey)).size === 2),
});
export const assembledVisualStyleSchema = styleBase.extend({
  draftStyleVersionId: opaqueIdSchema,
  samples: z.array(sample).length(2).refine((items) => new Set(items.map((item) => item.sampleKey)).size === 2),
});

const sheetBase = z.object({
  schemaVersion: z.literal("2"),
  title,
  finalListVersionId: opaqueIdSchema,
  styleVersionId: opaqueIdSchema,
  stylePromptModule: text,
  stylePromptModuleHash: hash,
  sheetPromptModule: text,
  reviewQuestions: list,
});
export const characterSheetProposalSchema = sheetBase.extend({
  characterId: opaqueIdSchema,
  characterDesignProfile: text,
  attireRequirements: list,
  accessories: list,
  requiredViews: z.tuple([z.literal("front"), z.literal("back"), z.literal("side"), z.literal("neutral_facial")]),
  additionalExpressions: z.array(text).length(3).refine((values) => new Set(values).size === 3),
});
export const locationSheetProposalSchema = sheetBase.extend({
  locationId: opaqueIdSchema,
  locationDefinitionProfile: text,
  stableAnchors: z.array(text).min(1).max(100),
  // J07 permits no additional required features. Keep that approved empty list;
  // the nonempty stable anchors still identify the location.
  requiredFeatures: list,
  overview: z.literal("isometric"),
  supportingViews: z.array(z.object({ angle: text, shows: text })).min(2).max(10)
    .refine((views) => new Set(views.map((view) => view.angle)).size === views.length),
});
export const assembledCharacterSheetSchema = characterSheetProposalSchema.extend({ build: referenceBuildSchema });
export const assembledLocationSheetSchema = locationSheetProposalSchema.extend({ build: referenceBuildSchema });
export type VisualStyleProposal = z.infer<typeof visualStyleProposalSchema>;
export type AssembledVisualStyle = z.infer<typeof assembledVisualStyleSchema>;
export type CharacterSheetProposal = z.infer<typeof characterSheetProposalSchema>;
export type AssembledCharacterSheet = z.infer<typeof assembledCharacterSheetSchema>;
export type LocationSheetProposal = z.infer<typeof locationSheetProposalSchema>;
export type AssembledLocationSheet = z.infer<typeof assembledLocationSheetSchema>;

export type ReferenceTask = "J08" | "J09" | "J10";
export type ReferenceStage = "proposal" | "assembled";
type ReferenceWarning = { field: string; message: string };
const schemas = {
  J08: { proposal: visualStyleProposalSchema, assembled: assembledVisualStyleSchema },
  J09: { proposal: characterSheetProposalSchema, assembled: assembledCharacterSheetSchema },
  J10: { proposal: locationSheetProposalSchema, assembled: assembledLocationSheetSchema },
};

export function styleModuleHash(module: string): string {
  return createHash("sha256").update(module, "utf8").digest("hex");
}

// The serializer's exact concatenation is an application decision. This helper
// proves that a saved prompt retains the unchanged shared module as one span.
export function promptContainsExactStyleModule(prompt: string, module: string): boolean {
  return prompt.includes(module);
}

function inspect(value: unknown, depth = 0): void {
  if (depth > 20) throw new Error("Reference content exceeds JSON depth 20.");
  if (Array.isArray(value)) value.forEach((item) => inspect(item, depth + 1));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => inspect(item, depth + 1));
}

function warnings(value: unknown, path = ""): ReferenceWarning[] {
  if (typeof value === "string") {
    const found: ReferenceWarning[] = [];
    if (path === "title" && value.length > 240) found.push({ field: path, message: "Title exceeds the preferred 240 characters." });
    if (path !== "title" && value.length > 2_000) found.push({ field: path, message: "Text exceeds the preferred 2,000 characters." });
    return found;
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => warnings(item, `${path}.${index}`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => warnings(item, path ? `${path}.${key}` : key));
  return [];
}

export function parseReferenceProposal(task: "J08", stage: "proposal", input: unknown): { content: VisualStyleProposal; warnings: ReferenceWarning[] };
export function parseReferenceProposal(task: "J08", stage: "assembled", input: unknown): { content: AssembledVisualStyle; warnings: ReferenceWarning[] };
export function parseReferenceProposal(task: "J09", stage: "proposal", input: unknown): { content: CharacterSheetProposal; warnings: ReferenceWarning[] };
export function parseReferenceProposal(task: "J09", stage: "assembled", input: unknown): { content: AssembledCharacterSheet; warnings: ReferenceWarning[] };
export function parseReferenceProposal(task: "J10", stage: "proposal", input: unknown): { content: LocationSheetProposal; warnings: ReferenceWarning[] };
export function parseReferenceProposal(task: "J10", stage: "assembled", input: unknown): { content: AssembledLocationSheet; warnings: ReferenceWarning[] };
export function parseReferenceProposal(task: ReferenceTask, stage: ReferenceStage, input: unknown): { content: VisualStyleProposal | AssembledVisualStyle | CharacterSheetProposal | AssembledCharacterSheet | LocationSheetProposal | AssembledLocationSheet; warnings: ReferenceWarning[] };
export function parseReferenceProposal(task: ReferenceTask, stage: ReferenceStage, input: unknown) {
  inspect(input);
  const content = schemas[task][stage].parse(input);
  if (new TextEncoder().encode(JSON.stringify(content)).byteLength > 512 * 1024) throw new Error("Reference content exceeds 512 KiB.");
  const expectedHash = styleModuleHash(content.stylePromptModule);
  if (content.stylePromptModuleHash !== expectedHash) throw new Error("Style prompt module hash does not match exact text.");
  const builds: z.infer<typeof referenceBuildSchema>[] = "samples" in content ? (content.samples as z.infer<typeof sample>[]).map((item) => item.build) : "build" in content ? [content.build as z.infer<typeof referenceBuildSchema>] : [];
  if (new Set(builds.map((build) => build.operationId)).size !== builds.length || new Set(builds.map((build) => build.assetId)).size !== builds.length) {
    throw new Error("Reference builds must use distinct operation and asset IDs.");
  }
  for (const build of builds) {
    if (build.stylePromptModuleHash !== expectedHash || !promptContainsExactStyleModule(build.prompt, content.stylePromptModule)) {
      throw new Error("Build prompt must contain the exact style module and hash.");
    }
    if (task === "J08" && "draftStyleVersionId" in content && !build.sourceVersionIds.includes(content.draftStyleVersionId)) {
      throw new Error("Style sample build is missing its draft style version.");
    }
    if (task !== "J08" && "styleVersionId" in content && "finalListVersionId" in content &&
      (!build.sourceVersionIds.includes(content.styleVersionId) || !build.sourceVersionIds.includes(content.finalListVersionId))) {
      throw new Error("Sheet build is missing final-list or style source version.");
    }
  }
  return { content, warnings: warnings(content) };
}
