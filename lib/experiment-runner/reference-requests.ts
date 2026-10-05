import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentImageRequestSchema, type ExperimentImageRequest } from "@/lib/contracts/experiment-image";
import { parseReferenceProposal } from "@/lib/contracts/experiment-references";

const styleSourcesSchema = z.strictObject({
  draftStyleVersionId: opaqueIdSchema,
  conceptVersionId: opaqueIdSchema,
  outlineVersionId: opaqueIdSchema,
  manuscriptVersionId: opaqueIdSchema,
  finalCharactersVersionId: opaqueIdSchema,
  finalLocationsVersionId: opaqueIdSchema,
});
export type StyleSampleSources = z.infer<typeof styleSourcesSchema>;

// These pure serializers check shape, not database approval or asset existence.
// Their owning operation service must check current saved sources before dispatch.
export function styleSampleRequests(proposal: unknown, sources: StyleSampleSources): {
  sampleKey: "sample_1" | "sample_2"; request: ExperimentImageRequest;
}[] {
  const style = parseReferenceProposal("J08", "proposal", proposal).content;
  const ids = styleSourcesSchema.parse(sources);
  const sourceVersionIds = [ids.draftStyleVersionId, ids.conceptVersionId,
    ids.outlineVersionId, ids.manuscriptVersionId,
    ids.finalCharactersVersionId, ids.finalLocationsVersionId];
  return (["sample_1", "sample_2"] as const).map((sampleKey) => {
    const sample = style.samplePlan.find((item) => item.sampleKey === sampleKey)!;
    return { sampleKey, request: experimentImageRequestSchema.parse({
      kind: "style_preview", styleVersionId: ids.draftStyleVersionId, sourceVersionIds,
      prompt: [
        `Style validation sample. Non-rendered slot identity: ${sampleKey}. Do not draw this identity.`,
        `Purpose: ${sample.purpose}`,
        `Typography: ${style.typographyDirection}`,
        `Speech/thought bubbles: ${style.speechAndThoughtBubbleDirection}`,
        `Excluded content: ${JSON.stringify(style.exclusions)}`,
        "Use the following shared style instructions unchanged:",
        style.stylePromptModule,
      ].join("\n"),
    }) };
  });
}

export function referenceSheetRequest(task: "J09" | "J10", proposal: unknown): ExperimentImageRequest {
  const sheet = task === "J09" ? parseReferenceProposal("J09", "proposal", proposal).content
    : parseReferenceProposal("J10", "proposal", proposal).content;
  const subject = "characterId" in sheet
    ? { characterId: sheet.characterId, characterDesignProfile: sheet.characterDesignProfile,
        attireRequirements: sheet.attireRequirements, accessories: sheet.accessories,
        requiredViews: sheet.requiredViews, additionalExpressions: sheet.additionalExpressions }
    : { locationId: sheet.locationId, locationDefinitionProfile: sheet.locationDefinitionProfile,
        stableAnchors: sheet.stableAnchors, requiredFeatures: sheet.requiredFeatures,
        overview: sheet.overview, supportingViews: sheet.supportingViews };
  return experimentImageRequestSchema.parse({
    kind: "reference", styleVersionId: sheet.styleVersionId,
    sourceVersionIds: [sheet.finalListVersionId, sheet.styleVersionId],
    prompt: [
      "Generate one reference-sheet montage. Subject IDs are non-rendered metadata; do not draw them.",
      task === "J09"
        ? "Include full-body front, full-body back and full-body side views, a detailed neutral facial view, and three additional facial-expression shots from the subject requirements."
        : "Include an isometric overview and each specified supporting view, showing the required features and stable anchors.",
      `Subject requirements: ${JSON.stringify(subject)}`,
      sheet.sheetPromptModule,
      "Use the following shared style instructions unchanged:",
      sheet.stylePromptModule,
    ].join("\n"),
  });
}
