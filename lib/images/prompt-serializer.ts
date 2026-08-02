import { imagePromptPlanSchema } from "@/lib/contracts/images";

export function serializeImagePrompt(plan: unknown): string {
  const parsed = imagePromptPlanSchema.parse(plan);
  return [
    `Purpose: ${parsed.purpose}.`,
    `Subject: ${parsed.subject}.`,
    `Action: ${parsed.action}.`,
    `Location: ${parsed.location}.`,
    `Visual style: ${parsed.visualStyle}.`,
    "Create one single full-page storybook illustration. Do not use comic panels, frames, collages, inset scenes, or sequential moments.",
    parsed.continuityConstraints.length ? `Continuity: ${parsed.continuityConstraints.join("; ")}.` : "",
    parsed.textSafeRegion ? "Leave the specified text-safe region free of lettering, dialogue, page numbers, or decorative text." : "",
    parsed.preserve.length ? `Preserve: ${parsed.preserve.join("; ")}.` : "",
  ].filter(Boolean).join("\n");
}
