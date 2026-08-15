import { z } from "zod";
import { storyPlanSchema, visualBibleSchema, visualStyleSchema } from "@/lib/contracts/artifacts";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import type { SkillContext } from "@/lib/contracts/skills";

export const visualDirectionInputSchema = z.object({
  intent: z.string().trim().min(1).max(5_000),
  storyPlan: storyPlanSchema,
  visualStyle: visualStyleSchema.nullable(),
});

export const visualDirectionResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("visual_style"), content: visualStyleSchema, summary: z.string().min(1) }),
  z.object({ kind: z.literal("visual_bible"), content: visualBibleSchema, summary: z.string().min(1) }),
]);

export async function planVisualDirection(input: z.infer<typeof visualDirectionInputSchema>, context: SkillContext) {
  const parsed = visualDirectionInputSchema.parse(input);
  if (context.stage === "visual_style") {
    return visualDirectionResultSchema.parse({
      kind: "visual_style",
      content: {
        schemaVersion: SCHEMA_VERSION,
        styleId: "soft-watercolor",
        name: "Soft watercolor",
        rationale: "Its warm, forgiving shapes support a gentle story without overloading young readers.",
        visualDirection: "Rounded watercolor forms, soft edges, natural light, and clearly readable character silhouettes.",
        palette: ["sunlit ochre", "leaf green", "sky blue", "warm cream"],
        texture: "Layered watercolor paper texture",
        lighting: "Warm morning light",
        styleReferenceAssetIds: ["00000000-0000-4000-8000-000000000001"],
      },
      summary: "I selected the seeded soft-watercolor direction as the recommended visual style.",
    });
  }
  if (context.stage !== "visual_bible" || !parsed.visualStyle) throw new Error("Visual Bible planning needs an approved visual style.");
  return visualDirectionResultSchema.parse({
    kind: "visual_bible",
    content: {
      schemaVersion: SCHEMA_VERSION,
      characters: parsed.storyPlan.characters.filter((character) => character.named || character.continuityRelevant).map((character) => ({
        entityId: character.entityId,
        name: character.name,
        visualDetails: ["A clear, kind expression", "A distinctive silhouette that remains readable at booklet size"],
        continuityConstraints: [...parsed.storyPlan.continuityConstraints, `Keep ${character.name} recognizable across every appearance.`],
        referenceRequired: character.recurringVisualSubject,
        currentReferenceAssetId: null,
        revisionNumber: 1,
      })),
      locations: parsed.storyPlan.settings.filter((setting) => setting.named || setting.continuityRelevant).map((setting) => ({
        entityId: setting.entityId,
        name: setting.name,
        visualDetails: ["A memorable establishing shape", "Consistent calm colors and welcoming scale"],
        continuityConstraints: [...parsed.storyPlan.continuityConstraints, `Keep ${setting.name} recognizable across pages.`],
        referenceRequired: setting.recurringVisualSubject,
        currentReferenceAssetId: null,
        revisionNumber: 1,
      })),
      styleReferences: parsed.visualStyle.styleReferenceAssetIds,
    },
    summary: "I mapped the continuity-relevant Story Plan subjects into a Visual Bible and prepared their canonical references.",
  });
}
