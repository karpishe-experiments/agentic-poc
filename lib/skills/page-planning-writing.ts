import { z } from "zod";
import { bookletSpecificationSchema, pagePlanSchema, storyPlanSchema, visualBibleSchema } from "@/lib/contracts/artifacts";
import { pagePlanDraftSchema } from "@/lib/contracts/drafts";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import type { SkillContext } from "@/lib/contracts/skills";

export const pagePlanningInputSchema = z.object({ intent: z.string().trim().min(1).max(5_000), storyPlan: storyPlanSchema, visualBible: visualBibleSchema, specification: bookletSpecificationSchema, currentPagePlan: pagePlanSchema.nullable().default(null), copyMode: z.enum(["creative", "exact"]).default("creative") });
export const pagePlanningResultSchema = z.object({ content: pagePlanDraftSchema, summary: z.string().min(1) });

export async function planAndWritePages(input: z.infer<typeof pagePlanningInputSchema>, context: SkillContext) {
  void context;
  const parsed = pagePlanningInputSchema.parse(input);
  if (!parsed.specification.geometryConfirmed) throw new Error("Confirm page geometry before drafting the Page Plan.");
  const characterIds = parsed.visualBible.characters.map((character) => character.entityId);
  const locationIds = parsed.visualBible.locations.map((location) => location.entityId);
  const referenceIds = [
    ...parsed.visualBible.styleReferences,
    ...parsed.visualBible.characters.map((character) => character.currentReferenceAssetId).filter((id): id is string => Boolean(id)),
    ...parsed.visualBible.locations.map((location) => location.currentReferenceAssetId).filter((id): id is string => Boolean(id)),
  ];
  const pages = Array.from({ length: parsed.specification.storyPageCount + 1 }, (_, pageIndex) => {
    const existingText = parsed.currentPagePlan?.pages.find((page) => page.pageIndex === pageIndex)?.readerText;
    const readerText = existingText ?? (pageIndex === 0 ? parsed.specification.title : pageIndex === parsed.specification.storyPageCount ? parsed.storyPlan.ending : parsed.storyPlan.keyEvents[Math.min(pageIndex - 1, parsed.storyPlan.keyEvents.length - 1)] ?? "The friends continue their gentle adventure.");
    const lettering = [{
      kind: pageIndex === 0 ? "title" as const : "narration" as const,
      text: readerText,
      speakerEntityId: null,
      delivery: pageIndex === 0 ? "bold, inviting cover title" : "warm, concise story narration",
      placementHint: pageIndex === 0 ? "prominent title area with strong contrast" : "bordered caption in a calm area that preserves the action",
    }];
    return {
    pageIndex, kind: pageIndex === 0 ? "cover" as const : "story" as const,
    readerText,
    lettering,
    sceneAction: pageIndex === 0 ? "Introduce the hero and welcoming story setting." : pageIndex === parsed.specification.storyPageCount ? "Show the gentle resolution shared by the friends." : "Show one clear story beat with a readable emotional change.",
    characterIds, locationIds, incidentalVisualDetails: [], compositionIntent: pageIndex === 0 ? "A welcoming focal cover composition." : "One uncluttered scene with an open text-safe area.", continuityNotes: parsed.storyPlan.continuityConstraints, relevantReferenceIds: referenceIds,
    textSafeRegion: { x: 0.08, y: 0.07, width: 0.84, height: 0.22 },
  }; });
  return pagePlanningResultSchema.parse({ content: { schemaVersion: SCHEMA_VERSION, storyPageCount: parsed.specification.storyPageCount, geometry: parsed.specification.geometry, pages }, summary: "I drafted one cover and one clear illustration plan for each story page." });
}
