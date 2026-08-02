import { z } from "zod";
import { finalPagesSchema } from "@/lib/contracts/artifacts";
import type { SkillContext } from "@/lib/contracts/skills";

export const imagePromptCompilationInputSchema = z.object({ intent: z.string().trim().min(1).max(5_000), finalPages: finalPagesSchema });
export const imagePromptCompilationResultSchema = z.object({ kind: z.literal("final_pages_review"), summary: z.string().min(1) });

export async function compileImagePrompts(input: z.infer<typeof imagePromptCompilationInputSchema>, context: SkillContext) {
  const parsed = imagePromptCompilationInputSchema.parse(input);
  if (context.stage !== "final_pages") throw new Error("Image prompt compilation is only available after page composition.");
  return imagePromptCompilationResultSchema.parse({ kind: "final_pages_review", summary: `The ${parsed.finalPages.pages.length} composed pages are ready for page-by-page review.` });
}
