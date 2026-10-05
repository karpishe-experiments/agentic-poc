import { CASES, finalCharacterListSchema, finalLocationListSchema, storedManuscriptSchema, type Persona } from "@/lib/contracts/experiment-runner";
import { assembledCharacterSheetSchema, assembledLocationSheetSchema } from "@/lib/contracts/experiment-references";
import { parsePageProposal, type PageLayoutProposal } from "@/lib/contracts/experiment-pages";

export type PaginationFixtureSource = {
  taskId: string; id: string; content: unknown;
  subjectKind?: string; subjectId?: string;
};

type FixtureInput = {
  persona: Persona;
  sources: PaginationFixtureSource[];
  currentContent?: unknown;
  sourceChanged?: boolean;
  revision?: string;
  answers?: string[];
  materialQuestion?: string;
};

export function simulatePaginationProposal(input: FixtureInput):
  | { kind: "clarification"; question: string }
  | { kind: "proposal"; content: PageLayoutProposal } {
  if (input.materialQuestion && !input.answers?.some((answer) => answer.startsWith(`${input.materialQuestion}: `))) {
    return { kind: "clarification", question: input.materialQuestion };
  }
  const book = (taskId: string) => {
    const matches = input.sources.filter((item) => item.taskId === taskId && (item.subjectKind === undefined || item.subjectKind === "book"));
    if (matches.length !== 1) throw new Error(`J11 requires one approved ${taskId} book source.`);
    return matches[0].content;
  };
  book("J01"); book("J02"); book("J08");
  const manuscript = storedManuscriptSchema.parse(book("J05"));
  const characters = finalCharacterListSchema.parse(book("J06"));
  const locations = finalLocationListSchema.parse(book("J07"));
  const references = input.sources.filter((item) => item.taskId === "J09" || item.taskId === "J10").map((item) => {
    const character = item.taskId === "J09";
    const sheet = character ? assembledCharacterSheetSchema.parse(item.content) : assembledLocationSheetSchema.parse(item.content);
    const subjectId = character ? (sheet as { characterId: string }).characterId : (sheet as { locationId: string }).locationId;
    if (item.subjectId !== subjectId || item.subjectKind !== (character ? "character" : "location")) throw new Error("J11 sheet subject metadata does not match its content.");
    return { subjectKind: character ? "character" as const : "location" as const, subjectId, artifactVersionId: item.id, assetId: sheet.build.assetId };
  });
  const required = [
    ...characters.characters.filter((item) => item.sheetRequired).map((item) => `character:${item.characterId}`),
    ...locations.locations.filter((item) => item.sheetRequired).map((item) => `location:${item.locationId}`),
  ];
  if (references.length !== required.length || new Set(references.map((item) => `${item.subjectKind}:${item.subjectId}`)).size !== required.length ||
    required.some((key) => !references.some((item) => `${item.subjectKind}:${item.subjectId}` === key))) {
    throw new Error("J11 requires every approved character and location sheet.");
  }
  const current = input.currentContent === undefined ? null : parsePageProposal("J11", input.persona, input.currentContent).content;
  const count = CASES[input.persona].storyPages;
  const panelCount = (index: number) => input.persona === "enthusiast_parent" && index === 3 ? 2 :
    input.persona === "professional_creator" && (index === 3 || index === 6) ? 2 : 1;
  const generatedPages: PageLayoutProposal["pages"] = Array.from({ length: count + 1 }, (_, pageIndex) => {
    const countForPage = panelCount(pageIndex);
    const panels = Array.from({ length: countForPage }, (_, panelIndex) => {
      const units = pageIndex === 0 ? [] : manuscript.units.filter((_, unitIndex) => Math.floor(unitIndex * count / manuscript.units.length) + 1 === pageIndex);
      // Extra story pages reuse the nearest beat. A manuscript beat can span
      // panels or pages; a physical page is never treated as a manuscript unit.
      const selected = pageIndex && units.length === 0 ? [manuscript.units[Math.floor((pageIndex - 1) * manuscript.units.length / count)]] : units;
      const subjects = new Set(selected.flatMap((unit) => [...unit.charactersPresent.map((id) => `character:${id}`), `location:${unit.locationId}`]));
      const routed = pageIndex === 0 ? [] : references.filter((item) => subjects.has(`${item.subjectKind}:${item.subjectId}`));
      if (pageIndex && routed.length !== subjects.size) throw new Error("J11 manuscript subjects lack approved sheets.");
      return {
        panelKey: `panel_${panelIndex + 1}`,
        manuscriptUnitIds: selected.map((unit) => unit.unitId),
        textCapacity: pageIndex === 0 ? 80 : input.persona === "playful_kid" ? 120 : 180,
        liveTextSafeRegion: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        sheetReferences: routed,
        deferredCompositionDecisions: [],
      };
    });
    return { pageIndex, pageTurnRhythm: pageIndex === 0 ? "Cover invites the first story page." : pageIndex === count ? "Resolve the story before the final turn." : "Carry the action into the next page.", panels };
  });
  const additions = [...(input.answers ?? []), ...(input.revision ? [`Revision request: ${input.revision}`] : [])];
  const decisions = current?.deferredCompositionDecisions ?? [];
  const content = {
    schemaVersion: "2" as const,
    title: current?.title ?? manuscript.title,
    canvas: current?.canvas ?? {
      trim: { width: 210, height: 210, unit: "mm" as const }, orientation: "square" as const,
      aspectRatio: { width: 1, height: 1 }, workingPixels: { width: 2048, height: 2048 },
      bleed: { top: 3, right: 3, bottom: 3, left: 3, unit: "mm" as const },
      binding: { edge: "left" as const, allowance: 8, unit: "mm" as const },
      liveTextSafeMargins: { top: 12, right: 12, bottom: 12, left: 16, unit: "mm" as const },
      readingDirection: "left_to_right" as const,
    },
    typography: current?.typography ?? (["narration", "speech", "thought", "sound_effect", "title", "credit", "diegetic"] as const).map((kind) => ({
      kind, fontDirection: "Clear, rounded lettering with high contrast.",
      sizeHierarchy: kind === "title" ? "Largest display size." : "Readable story size.",
      containerTreatment: kind === "speech" || kind === "thought" ? "Rounded bubble with a clear tail." : "Quiet open or caption space.",
      placementRules: "Place inside the live text safe region, clear of faces and actions.",
    })),
    pages: current && !input.sourceChanged ? current.pages : generatedPages.map((page) => {
      const saved = current?.pages[page.pageIndex];
      return saved && saved.panels.length === page.panels.length ? {
        ...page, pageTurnRhythm: saved.pageTurnRhythm,
        panels: page.panels.map((panel, index) => ({
          ...panel, panelKey: saved.panels[index].panelKey,
          textCapacity: saved.panels[index].textCapacity,
          liveTextSafeRegion: saved.panels[index].liveTextSafeRegion,
          deferredCompositionDecisions: saved.panels[index].deferredCompositionDecisions,
        })),
      } : page;
    }),
    deferredCompositionDecisions: [...decisions, ...additions.filter((note) => !decisions.includes(note))],
    approvalQuestions: current?.approvalQuestions ?? ["Does the page rhythm and lettering space suit this story?"],
  };
  return { kind: "proposal", content: parsePageProposal("J11", input.persona, content).content };
}
