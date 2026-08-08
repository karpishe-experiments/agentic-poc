import { imagePromptPlanSchema } from "@/lib/contracts/images";

export function serializeImagePrompt(plan: unknown): string {
  const parsed = imagePromptPlanSchema.parse(plan);
  const lettering = parsed.lettering?.map((element, index) => {
    const speaker = element.speakerEntityId ? parsed.speakerNames?.[element.speakerEntityId] ?? element.speakerEntityId : null;
    return `${index + 1}. ${element.kind.toUpperCase()} — exact text ${JSON.stringify(element.text)}${speaker ? ` — speaker: ${speaker}` : ""} — delivery: ${element.delivery} — placement: ${element.placementHint}`;
  }) ?? [];
  return [
    `Purpose: ${parsed.purpose}.`,
    `Subject: ${parsed.subject}.`,
    `Action: ${parsed.action}.`,
    `Location: ${parsed.location}.`,
    `Visual style: ${parsed.visualStyle}.`,
    "Create one single full-page storybook illustration. Do not use comic panels, frames, collages, inset scenes, or sequential moments.",
    parsed.continuityConstraints.length ? `Continuity: ${parsed.continuityConstraints.join("; ")}.` : "",
    lettering.length ? [
      "PROFESSIONAL COMIC LETTERING — render the approved copy inside the image:",
      ...lettering,
      "Render every quoted string exactly once, verbatim, with unchanged spelling, capitalization, and punctuation.",
      "Use speech balloons with tails clearly pointing to the named speaker; use cloud-like thought balloons; use bordered narration captions; use expressive, action-integrated hand lettering for sound effects; use bold, inviting display lettering for a title.",
      "Create a natural left-to-right, top-to-bottom reading order and strong visual hierarchy. Keep every word crisp and legible. Do not cover faces, hands, or essential action.",
      "Do not add any other letters, words, digits, prices, page numbers, signs, labels, logos, signatures, or watermarks anywhere in the image.",
      parsed.textSafeRegion ? `Use the planned lettering region approximately at normalized x=${parsed.textSafeRegion.x}, y=${parsed.textSafeRegion.y}, width=${parsed.textSafeRegion.width}, height=${parsed.textSafeRegion.height}; balloons may extend toward their speaker when needed.` : "",
    ].filter(Boolean).join("\n") : "No text, letters, digits, logos, signatures, or watermarks.",
    parsed.revisionInstruction ? `TARGETED REVISION: ${parsed.revisionInstruction}. Change only this requested detail. Preserve the scene, identities, composition, approved copy, exact lettering text, and all unrelated details.` : "",
    parsed.preserve.length ? `Preserve: ${parsed.preserve.join("; ")}.` : "",
  ].filter(Boolean).join("\n");
}
