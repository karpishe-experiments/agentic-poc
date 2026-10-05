import { CASES, conceptBriefSchema, finalCharacterListSchema, finalLocationListSchema, storedManuscriptSchema, storyOutlineSchema, type ExperimentMode, type Persona } from "@/lib/contracts/experiment-runner";
import { parseReferenceProposal, styleModuleHash, type CharacterSheetProposal, type LocationSheetProposal, type VisualStyleProposal } from "@/lib/contracts/experiment-references";
import { opaqueIdSchema } from "@/lib/contracts/common";

type Source = { versionId: string; content: unknown };
type Common = { mode: ExperimentMode; persona: Persona; brief: string; currentContent?: unknown; sourceChanged?: boolean; revision?: string; answers?: { question: string; answer: string }[]; materialQuestion?: string };
type StyleInput = Common & { concept: Source; outline: Source; manuscript: Source; finalCharacters: Source; finalLocations: Source };
type SheetInput = Common & { finalList: Source; style: Source; targetId: string; styleVersionId: string };
type Result<T> = { kind: "clarification"; question: string } | { kind: "proposal"; content: T; warnings: { field: string; message: string }[] };

function checkCommon(input: Common): string | null {
  if (input.mode !== "simulated") throw new Error("Reference fixtures require simulated mode.");
  if (input.brief !== CASES[input.persona].brief) throw new Error("Fixture requires an exact fixed case brief.");
  if (input.materialQuestion && !input.answers?.some((item) => item.question === input.materialQuestion && item.answer.trim())) return input.materialQuestion;
  return null;
}

function source<T>(value: Source, parse: (content: unknown) => T): T {
  opaqueIdSchema.parse(value?.versionId);
  return parse(value.content);
}

function questions(base: string[], input: Common): string[] {
  const additions = [input.revision && `Revision request: ${input.revision}`, ...(input.answers ?? []).filter((item) => item.answer.trim()).map((item) => `${item.question}: ${item.answer}`)].filter((item): item is string => Boolean(item));
  return [...base, ...additions.filter((item) => !base.includes(item))];
}

function styleDirection(persona: Persona): string {
  return persona === "playful_kid" ? "Playful clear shapes and lively but reassuring movement for developing readers."
    : persona === "enthusiast_parent" ? "Warm rounded shapes, gentle contrast, and calm readable detail for early readers."
    : "Precise environmental detail and restrained light shifts that follow the older readers' emotional arc.";
}

function expectedLocationCount(persona: Persona): number {
  return persona === "professional_creator" ? 2 : 1;
}

// Inputs are supplied by the owning service after it verifies current approval.
// Parsing source content here cannot establish approval or source identity.
export function simulateReferenceProposal(task: "J08", input: StyleInput): Result<VisualStyleProposal>;
export function simulateReferenceProposal(task: "J09", input: SheetInput): Result<CharacterSheetProposal>;
export function simulateReferenceProposal(task: "J10", input: SheetInput): Result<LocationSheetProposal>;
export function simulateReferenceProposal(task: "J08" | "J09" | "J10", input: StyleInput | SheetInput): Result<VisualStyleProposal | CharacterSheetProposal | LocationSheetProposal> {
  const question = checkCommon(input);
  if (question) return { kind: "clarification", question };
  if (task === "J08") {
    const value = input as StyleInput;
    const concept = source(value.concept, conceptBriefSchema.parse);
    const outline = source(value.outline, storyOutlineSchema.parse);
    const manuscript = source(value.manuscript, storedManuscriptSchema.parse);
    const characters = source(value.finalCharacters, finalCharacterListSchema.parse);
    const locations = source(value.finalLocations, finalLocationListSchema.parse);
    if (concept.sourceInput !== input.brief) throw new Error("Concept does not match the fixed case brief.");
    if (outline.characters.length !== 2 || outline.locations.length !== expectedLocationCount(input.persona) ||
      characters.characters.length !== 2 || locations.locations.length !== expectedLocationCount(input.persona)) {
      throw new Error("Reference sources do not match fixed case subject counts.");
    }
    const current = input.currentContent && !input.sourceChanged ? parseReferenceProposal("J08", "proposal", input.currentContent).content : null;
    const direction = styleDirection(input.persona);
    const stylePromptModule = current?.stylePromptModule ?? [
      `Style direction: ${direction}`,
      `Visual tone: ${concept.tone}. Use clear expressive faces and body language to communicate changing emotions.`,
      "Composition: Show a legible primary action, expressive body language, and enough environmental detail to orient the reader without fixing a scene layout.",
      "Continuity: Preserve approved character and place facts in each scene-specific prompt.",
      "Lettering: Leave clean readable space for narration; use clear speech bubbles, distinct thought bubbles, restrained sound effects, and diegetic text only where the story calls for it.",
    ].join("\n");
    const content = {
      schemaVersion: "2" as const, title: current?.title ?? `${outline.title} visual style`,
      styleDefinition: current?.styleDefinition ?? {
        mediumAndLineWork: `Illustrated storybook with ${direction}`,
        shapeLanguageAndProportions: direction, colourAndContrast: `Palette follows ${concept.tone}; preserve readable contrast.`,
        textureAndRendering: "Controlled texture keeps faces, actions, and important objects legible.",
        lightingAndAtmosphere: `Light supports ${outline.emotionalArc}.`, emotionalTone: concept.emotionalPromise,
        accessibilityAndReadability: `Clear silhouettes and text-safe space suit the ${concept.audience.ageBand} audience.`,
      },
      typographyDirection: current?.typographyDirection ?? "Readable storybook lettering with clear narration hierarchy and generous spacing.",
      speechAndThoughtBubbleDirection: current?.speechAndThoughtBubbleDirection ?? "Separate speech and thought bubbles; keep tails unambiguous and leave room for sound effects and diegetic signs.",
      stylePromptModule, stylePromptModuleHash: styleModuleHash(stylePromptModule),
      exclusions: current?.exclusions ?? ["Do not change approved character identity or location anchors."],
      approvalQuestions: questions(current?.approvalQuestions ?? ["Do both samples express the intended emotion, action, environment, and detail?"], input),
      samplePlan: current?.samplePlan ?? [
        { sampleKey: "sample_1" as const, purpose: `Show ${characters.characters.map((item) => item.nameOrRole).join(" and ")}: ${manuscript.units[0].action} in ${locations.locations[0].title}; establish emotion, setting, and readable detail.` },
        { sampleKey: "sample_2" as const, purpose: `Show ${manuscript.units.at(-1)!.action} with the same characters and environmental anchors; test emotional change and action clarity.` },
      ],
    };
    return { kind: "proposal", ...parseReferenceProposal("J08", "proposal", content) };
  }
  const value = input as SheetInput;
  const style = source(value.style, (content) => parseReferenceProposal("J08", "assembled", content).content);
  if (value.styleVersionId !== value.style.versionId) throw new Error("Style version ID does not match source.");
  if (task === "J09") {
    const list = source(value.finalList, finalCharacterListSchema.parse);
    if (list.characters.length !== 2) throw new Error("Character list does not match fixed case count.");
    const target = list.characters.find((item) => item.characterId === value.targetId);
    if (!target || !target.sheetRequired || target.recurrence !== "recurring") throw new Error("J09 requires a recurring final character target.");
    const expressionPool = [...new Set(target.expressions.map((item) => item.trim()).filter(Boolean))];
    if (expressionPool.length < 3) {
      const expressionQuestion = `Which three distinct expressions should ${target.nameOrRole}'s sheet show?`;
      const answer = input.answers?.find((item) => item.question === expressionQuestion && item.answer.trim())?.answer;
      if (answer) {
        for (const expression of answer.split(/[,;\n]/).map((item) => item.trim())) {
          if (expression && !expressionPool.includes(expression)) expressionPool.push(expression);
        }
      }
      if (expressionPool.length < 3) return { kind: "clarification", question: expressionQuestion };
    }
    const current = input.currentContent && !input.sourceChanged ? parseReferenceProposal("J09", "proposal", input.currentContent).content : null;
    if (current && current.characterId !== target.characterId) throw new Error("Current character target differs.");
    const content = {
      schemaVersion: "2" as const, title: current?.title ?? `${target.nameOrRole} character sheet`,
      finalListVersionId: value.finalList.versionId, styleVersionId: value.styleVersionId,
      stylePromptModule: style.stylePromptModule, stylePromptModuleHash: style.stylePromptModuleHash,
      sheetPromptModule: current?.sheetPromptModule ?? `One character montage for ${target.nameOrRole}. Preserve ${target.physicalDescription}. Show full-body front, full-body back, full-body side, a detailed neutral facial view, and three distinct expressions. Include all attire: ${target.attireRequirements.join("; ") || "none specified"}. Include all accessories: ${target.accessories.join("; ") || "none specified"}. Add no extra or unapproved attire. No readable labels, watermarks, logos, or unrelated characters.`,
      reviewQuestions: questions(current?.reviewQuestions ?? ["Is this the same character in every view and expression?"], input),
      characterId: target.characterId, characterDesignProfile: current?.characterDesignProfile ?? `${target.background} ${target.lifeStage}. ${target.physicalDescription} ${target.personalityAndActing}`,
      attireRequirements: target.attireRequirements, accessories: target.accessories,
      requiredViews: ["front", "back", "side", "neutral_facial"] as const,
      additionalExpressions: current?.additionalExpressions ?? expressionPool.slice(0, 3),
    };
    return { kind: "proposal", ...parseReferenceProposal("J09", "proposal", content) };
  }
  const list = source(value.finalList, finalLocationListSchema.parse);
  if (list.locations.length !== expectedLocationCount(input.persona)) throw new Error("Location list does not match fixed case count.");
  const target = list.locations.find((item) => item.locationId === value.targetId);
  if (!target || !target.sheetRequired) throw new Error("J10 requires a final location target.");
  const current = input.currentContent && !input.sourceChanged ? parseReferenceProposal("J10", "proposal", input.currentContent).content : null;
  if (current && current.locationId !== target.locationId) throw new Error("Current location target differs.");
  const content = {
    schemaVersion: "2" as const, title: current?.title ?? `${target.title} location sheet`,
    finalListVersionId: value.finalList.versionId, styleVersionId: value.styleVersionId,
    stylePromptModule: style.stylePromptModule, stylePromptModuleHash: style.stylePromptModuleHash,
    sheetPromptModule: current?.sheetPromptModule ?? `One location montage for ${target.title}. Isometric overview plus two supporting views. Preserve stable anchors: ${target.stableAnchors.join("; ")}. Include required features: ${target.requiredFeatures.join("; ")}. Do not add page action or weather unless it is an approved stable fact. No readable labels, watermarks, logos, or unrelated characters.`,
    reviewQuestions: questions(current?.reviewQuestions ?? ["Are the location anchors recognizable in all views?"], input),
    locationId: target.locationId, locationDefinitionProfile: current?.locationDefinitionProfile ?? `${target.basicDescription} ${target.storyPurpose}`,
    stableAnchors: target.stableAnchors, requiredFeatures: target.requiredFeatures, overview: "isometric" as const,
    supportingViews: current?.supportingViews ?? [
      { angle: "entry", shows: `Entry view showing ${target.stableAnchors[0]}.` },
      { angle: "reverse", shows: `Reverse view showing ${target.requiredFeatures[0] ?? target.stableAnchors[0]}.` },
    ],
  };
  return { kind: "proposal", ...parseReferenceProposal("J10", "proposal", content) };
}
